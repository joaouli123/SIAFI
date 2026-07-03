import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResponse, paginate } from '../../common/dto/paginated-response.dto';
import { InstallmentFilterDto } from './dto/installment-filter.dto';
import { UpdateInstallmentDto } from './dto/update-installment.dto';

@Injectable()
export class InstallmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Listagem geral de parcelas com filtros e paginação (tela /parcelas → "Todas").
  async findAll(
    filters: InstallmentFilterDto,
    consultorId?: number,
  ): Promise<PaginatedResponse<unknown>> {
    const { status, clientId, loanId, search, startDate, endDate, aberto, comObservacao, page, limit } = filters;
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
    if (consultorId) loanWhere.consultorId = consultorId;
    if (search) {
      loanWhere.client = {
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { cpf: { contains: search } },
        ],
      };
    }
    if (Object.keys(loanWhere).length) where.loan = loanWhere;

    const [data, total] = await Promise.all([
      this.prisma.installment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ dataVencimento: 'asc' }, { numero: 'asc' }],
        include: {
          loan: {
            select: {
              id: true,
              status: true,
              multaPercentual: true,
              moraDiariaPercentual: true,
              client: { select: { id: true, nome: true, nomeSocial: true, cpf: true, whatsapp: true, observacoes: true } },
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
      return {
        ...inst,
        moraAcumulada: String(enc.valorMora),
        multaAplicada: String(enc.valorMulta),
        valorComEncargos: String(enc.totalDevido),
      };
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

  async findById(id: number): Promise<unknown> {
    const installment = await this.prisma.installment.findUnique({
      where: { id },
      include: {
        payments: { orderBy: { dataPagamento: 'desc' } },
        loan: {
          include: {
            client: { select: { id: true, nome: true, cpf: true } },
          },
        },
      },
    });

    if (!installment) {
      throw new NotFoundException(`Parcela com id ${id} não encontrada`);
    }

    return installment;
  }

  async findOverdue(consultorId?: number): Promise<unknown[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: Record<string, unknown> = {
      status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] },
      dataVencimento: { lt: today },
    };

    if (consultorId) {
      where['loan'] = { consultorId };
    }

    const data = await this.prisma.installment.findMany({
      where,
      orderBy: { dataVencimento: 'asc' },
      include: {
        loan: {
          include: {
            client: { select: { id: true, nome: true, cpf: true, whatsapp: true, observacoes: true } },
          },
        },
      },
    });

    const { multaDefault, moraDiaDefault } = await this.getTaxasDefault();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return data.map((inst: any) => {
      const enc = this.calcEncargos(inst, multaDefault, moraDiaDefault, hoje);
      return {
        ...inst,
        moraAcumulada: String(enc.valorMora),
        multaAplicada: String(enc.valorMulta),
        valorComEncargos: String(enc.totalDevido),
      };
    });
  }

  // Parcelas com vencimento hoje (pendente/atrasado/parcialmente_pago) — dashboard do caixa.
  async findHoje(consultorId?: number): Promise<unknown[]> {
    const hoje = new Date();
    const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
    const fimDia    = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);

    const where: Record<string, unknown> = {
      status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] },
      dataVencimento: { gte: inicioDia, lte: fimDia },
    };

    if (consultorId) {
      where['loan'] = { consultorId };
    }

    const data = await this.prisma.installment.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dataVencimento: 'asc' }],
      include: {
        loan: {
          include: {
            client: { select: { id: true, nome: true, nomeSocial: true, cpf: true, whatsapp: true } },
          },
        },
      },
    });

    const { multaDefault, moraDiaDefault } = await this.getTaxasDefault();
    const hojeDate = new Date();
    hojeDate.setHours(0, 0, 0, 0);

    return data.map((inst: any) => {
      const enc = this.calcEncargos(inst, multaDefault, moraDiaDefault, hojeDate);
      return {
        ...inst,
        moraAcumulada: String(enc.valorMora),
        multaAplicada: String(enc.valorMulta),
        valorComEncargos: String(enc.totalDevido),
      };
    });
  }

  // ─── Encargos: fórmula ÚNICA do sistema ───────────────────────────────────────
  // Multa: aplicada uma única vez sobre o valor da parcela (multaPercentual %).
  // Mora:  diária sobre o saldo devedor (moraDiariaPercentual % ao dia × dias).
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
    inst: {
      installmentAmount: unknown;
      totalPago: unknown;
      dataVencimento: Date;
      loan: { multaPercentual: unknown; moraDiariaPercentual: unknown };
    },
    multaDefault: number,
    moraDiaDefault: number,
    hoje: Date,
  ): { saldo: number; valorMulta: number; valorMora: number; totalDevido: number; diasAtraso: number } {
    const venc = new Date(inst.dataVencimento);
    venc.setHours(0, 0, 0, 0);

    const saldo = Math.max(0, Number(inst.installmentAmount) - Number(inst.totalPago));
    const diasAtraso =
      saldo > 0
        ? Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

    const multaPerc = inst.loan.multaPercentual != null ? Number(inst.loan.multaPercentual) : multaDefault;
    const moraDiaPerc = inst.loan.moraDiariaPercentual != null ? Number(inst.loan.moraDiariaPercentual) : moraDiaDefault;

    const valorMulta = diasAtraso >= 1 ? parseFloat(((Number(inst.installmentAmount) * multaPerc) / 100).toFixed(2)) : 0;
    const valorMora = diasAtraso >= 1 ? parseFloat((saldo * (moraDiaPerc / 100) * diasAtraso).toFixed(2)) : 0;
    const totalDevido = parseFloat((saldo + valorMulta + valorMora).toFixed(2));

    return { saldo, valorMulta, valorMora, totalDevido, diasAtraso };
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
        dataVencimento: true,
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
  async getEncargos(id: number): Promise<{
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
        dataVencimento: true,
        loan: { select: { multaPercentual: true, moraDiariaPercentual: true } },
      },
    });

    if (!inst) throw new NotFoundException(`Parcela ${id} não encontrada`);

    const hoje = new Date();
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
