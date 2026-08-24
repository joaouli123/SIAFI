import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dataLocal } from '../../common/data';
import { calcularEncargos, Encargos, ParcelaEncargo } from '../../common/encargos';
import { filtroCliente } from '../../common/busca';
import { PaginatedResponse, paginate } from '../../common/dto/paginated-response.dto';
import { InstallmentFilterDto } from './dto/installment-filter.dto';
import { UpdateInstallmentDto } from './dto/update-installment.dto';
import {
  BAIXA_ORDER,
  BAIXA_SELECT,
  BaixaInput,
  Numerico,
  baixasVivas,
  remainingCapital,
} from '../../common/commission';

@Injectable()
export class InstallmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Baixas necessárias para fatiar a mora por período (ver common/encargos.ts).
  private static readonly BAIXAS_PARCELA = {
    select: { ...BAIXA_SELECT, estornado: true },
    orderBy: BAIXA_ORDER,
  } as const;

  // Listagem geral de parcelas com filtros e paginação (tela /parcelas → "Todas").
  async findAll(
    filters: InstallmentFilterDto,
    consultorId?: number,
    role?: string,
  ): Promise<PaginatedResponse<unknown>> {
    const { status, clientId, loanId, consultorId: filterConsultorId, search, startDate, endDate, aberto, comObservacao, page, limit } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.InstallmentWhereInput = {};
    if (status) where.status = status as Prisma.InstallmentWhereInput['status'];
    else if (aberto === 'true') where.status = { notIn: ['pago', 'cancelado'] };
    if (loanId) where.loanId = loanId;
    if (comObservacao === 'true') where.observacao = { not: null, notIn: [''] };
    else if (comObservacao === 'false') where.OR = [{ observacao: null }, { observacao: '' }];

    if (startDate || endDate) {
      where.dataVencimento = {};
      // Início do dia / fim do dia em horário local (datas são construídas como locais)
      if (startDate) (where.dataVencimento as Prisma.DateTimeFilter).gte = new Date(`${startDate}T00:00:00`);
      if (endDate) (where.dataVencimento as Prisma.DateTimeFilter).lte = new Date(`${endDate}T23:59:59.999`);
    }

    const loanWhere: Prisma.LoanWhereInput = {};
    if (clientId) loanWhere.clientId = clientId;
    // Consultor: a carteira é definida em client.consultorId (vínculo em /clientes),
    // não no contrato. Consultor autenticado só vê a própria carteira; admin/financeiro
    // pode filtrar por consultor. Ambos filtram pelo consultor DO CLIENTE.
    const effectiveConsultorId = consultorId ?? filterConsultorId;
    const clientWhere: Prisma.ClientWhereInput = {};
    if (effectiveConsultorId) clientWhere.consultorId = effectiveConsultorId;
    if (search) {
      clientWhere.OR = filtroCliente(search);
    }
    if (Object.keys(clientWhere).length) loanWhere.client = clientWhere;
    if (Object.keys(loanWhere).length) where.loan = loanWhere;

    const [data, total] = await Promise.all([
      this.prisma.installment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ dataVencimento: 'asc' }, { numero: 'asc' }],
        include: {
          payments: InstallmentsService.BAIXAS_PARCELA,
          loan: {
            select: {
              id: true,
              status: true,
              multaPercentual: true,
              moraDiariaPercentual: true,
              client: { select: { id: true, nome: true, nomeSocial: true, cpf: true, whatsapp: true, observacoes: true, consultor: { select: { id: true, nome: true } } } },
              consultor: { select: { id: true, nome: true } },
            },
          },
        },
      }),
      this.prisma.installment.count({ where }),
    ]);

    const { multaDefault, moraDiaDefault } = await this.getTaxasDefault();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const mappedData = data.map((inst: any) => {
      const enc = this.calcEncargos(inst, multaDefault, moraDiaDefault, hoje);
      return this.stripSplitForCaixa({
        ...inst,
        capitalRestante: String(this.getRemainingCapital(inst)),
        moraAcumulada: String(enc.valorMora),
        multaAplicada: String(enc.valorMulta),
        valorComEncargos: String(enc.totalDevido),
      }, role);
    });

    return paginate(mappedData, total, page, limit);
  }

  async findByLoan(loanId: number): Promise<unknown[]> {
    return this.prisma.installment.findMany({
      where: { loanId },
      orderBy: { numero: 'asc' },
      include: {
        payments: { orderBy: { dataPagamento: 'desc' } },
      },
    });
  }

  async findById(id: number, role?: string): Promise<unknown> {
    const installment = await this.prisma.installment.findUnique({
      where: { id },
      include: {
        payments: { orderBy: { dataPagamento: 'desc' } },
        loan: {
          include: {
            client: { select: { id: true, nome: true, cpf: true } },
            consultor: { select: { id: true, nome: true } },
          },
        },
      },
    });

    if (!installment) {
      throw new NotFoundException(`Parcela com id ${id} não encontrada`);
    }

    return this.stripSplitForCaixa({
      ...installment,
      capitalRestante: String(this.getRemainingCapital(installment)),
    } as Record<string, any>, role);
  }

  async findOverdue(consultorId?: number, role?: string, clientId?: number): Promise<unknown[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: Record<string, unknown> = {
      status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] },
      dataVencimento: { lt: today },
    };

    if (consultorId || clientId) {
      const clientWhere: Record<string, unknown> = {};
      if (consultorId) clientWhere.consultorId = consultorId;
      if (clientId) clientWhere.id = clientId;
      where['loan'] = { client: clientWhere };
    }

    const data = await this.prisma.installment.findMany({
      where,
      orderBy: { dataVencimento: 'asc' },
      include: {
        payments: InstallmentsService.BAIXAS_PARCELA,
        loan: {
          include: {
            client: {
              select: {
                id: true,
                nome: true,
                cpf: true,
                whatsapp: true,
                observacoes: true,
                consultor: { select: { id: true, nome: true } },
                _count: {
                  select: {
                    loans: { where: { status: { not: 'cancelado' } } },
                  },
                },
              },
            },
            consultor: { select: { id: true, nome: true } },
          },
        },
      },
    });

    const { multaDefault, moraDiaDefault } = await this.getTaxasDefault();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return data.map((inst: any) => {
      const enc = this.calcEncargos(inst, multaDefault, moraDiaDefault, hoje);
      const client = inst.loan?.client;
      const { _count: clientCount, ...clientWithoutCount } = client ?? {};
      return this.stripSplitForCaixa({
        ...inst,
        loan: inst.loan
          ? {
              ...inst.loan,
              client: client
                ? { ...clientWithoutCount, quantidadeEmprestimos: clientCount?.loans ?? 0 }
                : client,
            }
          : inst.loan,
        capitalRestante: String(this.getRemainingCapital(inst)),
        moraAcumulada: String(enc.valorMora),
        multaAplicada: String(enc.valorMulta),
        valorComEncargos: String(enc.totalDevido),
      }, role);
    });
  }

  // Parcelas com vencimento hoje (pendente/atrasado/parcialmente_pago) — dashboard do caixa.
  async findHoje(consultorId?: number, role?: string): Promise<unknown[]> {
    const hoje = new Date();
    const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
    const fimDia    = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);

    const where: Record<string, unknown> = {
      status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] },
      dataVencimento: { gte: inicioDia, lte: fimDia },
    };

    if (consultorId) {
      where['loan'] = { client: { consultorId } };
    }

    const data = await this.prisma.installment.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dataVencimento: 'asc' }],
      include: {
        payments: InstallmentsService.BAIXAS_PARCELA,
        loan: {
          include: {
            client: { select: { id: true, nome: true, nomeSocial: true, cpf: true, whatsapp: true, consultor: { select: { id: true, nome: true } } } },
            consultor: { select: { id: true, nome: true } },
          },
        },
      },
    });

    const { multaDefault, moraDiaDefault } = await this.getTaxasDefault();
    const hojeDate = new Date();
    hojeDate.setHours(0, 0, 0, 0);

    return data.map((inst: any) => {
      const enc = this.calcEncargos(inst, multaDefault, moraDiaDefault, hojeDate);
      return this.stripSplitForCaixa({
        ...inst,
        capitalRestante: String(this.getRemainingCapital(inst)),
        moraAcumulada: String(enc.valorMora),
        multaAplicada: String(enc.valorMulta),
        valorComEncargos: String(enc.totalDevido),
      }, role);
    });
  }

  // ─── Encargos: fórmula ÚNICA do sistema (common/encargos.ts) ──────────────────
  // Multa: aplicada uma única vez sobre o valor da parcela (multaPercentual %).
  // Mora:  diária sobre o saldo de CADA período (vencimento → baixas → hoje), para
  //        que um pagamento parcial não apague a mora já corrida sobre o saldo maior.
  // Fallback por contrato → settings 'financeiro.multa_atraso_percentual' /
  // 'financeiro.mora_dia_percentual'. Idempotente: o mesmo cálculo é usado no
  // cron (atualizarEncargos), no markOverdue e no getEncargos.

  private async getTaxasDefault(): Promise<{ multaDefault: number; moraDiaDefault: number }> {
    const [multaS, moraS] = await Promise.all([
      this.prisma.siteSetting.findUnique({ where: { chave: 'financeiro.multa_atraso_percentual' } }),
      this.prisma.siteSetting.findUnique({ where: { chave: 'financeiro.mora_dia_percentual' } }),
    ]);
    return {
      multaDefault: multaS?.valor ? parseFloat(multaS.valor) : 2.0,
      moraDiaDefault: moraS?.valor ? parseFloat(moraS.valor) : 0.0333,
    };
  }

  private calcEncargos(
    inst: ParcelaEncargo & { loan: { multaPercentual: unknown; moraDiariaPercentual: unknown } },
    multaDefault: number,
    moraDiaDefault: number,
    hoje: Date,
  ): Encargos {
    const multaPerc = inst.loan.multaPercentual != null ? Number(inst.loan.multaPercentual) : multaDefault;
    const moraDiaPerc =
      inst.loan.moraDiariaPercentual != null ? Number(inst.loan.moraDiariaPercentual) : moraDiaDefault;

    return calcularEncargos(inst, multaPerc, moraDiaPerc, hoje);
  }

  private getRemainingCapital(inst: {
    status?: string;
    principalPayback: unknown;
    installmentAmount: unknown;
    payments?: Array<BaixaInput & { estornado?: boolean; createdAt?: Date | string }> | null;
  }): number {
    if (inst.status === 'cancelado') return 0;
    return remainingCapital(baixasVivas(inst.payments), {
      principalPayback: inst.principalPayback as Numerico,
      installmentAmount: inst.installmentAmount as Numerico,
    });
  }

  // Remove os campos de split (principalPayback/netGain/capitalRestante) para o papel 'caixa'.
  private stripSplitForCaixa<T extends Record<string, any>>(inst: T, role?: string): T {
    if (role !== 'caixa') return inst;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { principalPayback, netGain, capitalRestante, ...rest } = inst;
    return rest as T;
  }

  // Recalcula mora/multa em tempo real para parcelas de UM MESMO contrato — usado pelo
  // detalhe do empréstimo (LoansService.findById), que não passa por findAll/findOverdue.
  async recalcularEncargosLista<T extends ParcelaEncargo>(
    installments: T[],
    multaPercentual: unknown,
    moraDiariaPercentual: unknown,
  ): Promise<(T & { moraAcumulada: string; multaAplicada: string; valorComEncargos: string })[]> {
    const { multaDefault, moraDiaDefault } = await this.getTaxasDefault();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const loanCtx = { multaPercentual, moraDiariaPercentual };

    return installments.map((inst) => {
      const enc = this.calcEncargos({ ...inst, loan: loanCtx }, multaDefault, moraDiaDefault, hoje);
      return {
        ...inst,
        moraAcumulada: String(enc.valorMora),
        multaAplicada: String(enc.valorMulta),
        valorComEncargos: String(enc.totalDevido),
      };
    });
  }

  // Marca parcelas vencidas como 'atrasado' e recalcula encargos (idempotente).
  async markOverdue(): Promise<{ count: number }> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const { multaDefault, moraDiaDefault } = await this.getTaxasDefault();

    const vencidas = await this.prisma.installment.findMany({
      where: {
        status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] },
        dataVencimento: { lt: hoje },
      },
      select: {
        id: true,
        status: true,
        installmentAmount: true,
        totalPago: true,
        saldoDevedor: true,
        dataVencimento: true,
        payments: InstallmentsService.BAIXAS_PARCELA,
        loan: { select: { multaPercentual: true, moraDiariaPercentual: true } },
      },
    });

    for (const inst of vencidas) {
      const enc = this.calcEncargos(inst, multaDefault, moraDiaDefault, hoje);
      await this.prisma.installment.update({
        where: { id: inst.id },
        data: {
          status: inst.status === 'pendente' ? 'atrasado' : inst.status,
          multaAplicada: enc.valorMulta,
          moraAcumulada: enc.valorMora,
          valorMulta: enc.valorMulta,
          valorMora: enc.valorMora,
          valorComEncargos: enc.totalDevido,
        },
      });
    }

    return { count: vencidas.length };
  }

  // Retorna encargos recalculados em tempo real para exibição/baixa ao operador.
  async getEncargos(id: number, asOf?: Date | string): Promise<{
    valor: number;
    totalPago: number;
    valorMulta: number;
    valorMora: number;
    totalDevido: number;
    diasAtraso: number;
  }> {
    const inst = await this.prisma.installment.findUnique({
      where: { id },
      select: {
        installmentAmount: true,
        totalPago: true,
        saldoDevedor: true,
        dataVencimento: true,
        payments: InstallmentsService.BAIXAS_PARCELA,
        loan: { select: { multaPercentual: true, moraDiariaPercentual: true } },
      },
    });

    if (!inst) throw new NotFoundException(`Parcela ${id} não encontrada`);

    // Na baixa, a dívida deve ser congelada na data informada pelo operador.
    // Sem asOf, mantém o comportamento de exibição em tempo real (hoje).
    const hoje = asOf ? dataLocal(asOf) : new Date();
    hoje.setHours(0, 0, 0, 0);
    const { multaDefault, moraDiaDefault } = await this.getTaxasDefault();
    const enc = this.calcEncargos(inst, multaDefault, moraDiaDefault, hoje);

    return {
      valor: Number(inst.installmentAmount),
      totalPago: Number(inst.totalPago),
      valorMulta: enc.valorMulta,
      valorMora: enc.valorMora,
      totalDevido: enc.totalDevido,
      diasAtraso: enc.diasAtraso,
    };
  }

  async update(id: number, dto: UpdateInstallmentDto): Promise<unknown> {
    const installment = await this.prisma.installment.findUnique({ where: { id } });
    if (!installment) {
      throw new NotFoundException(`Parcela com id ${id} não encontrada`);
    }

    return this.prisma.installment.update({
      where: { id },
      data: {
        observacao: dto.observacao !== undefined ? dto.observacao : installment.observacao,
      },
    });
  }
}
