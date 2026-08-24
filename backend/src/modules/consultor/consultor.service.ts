import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { dataLocal } from '../../common/data';
import { BAIXA_ORDER, BAIXA_SELECT, realizedLucro } from '../../common/commission';
import { calcularEncargos } from '../../common/encargos';
import type { RequestUser } from '../auth/guards/supabase-auth.guard';
import { CreateSolicitacaoDto, ResponderSolicitacaoDto } from './dto/create-solicitacao.dto';
import { CreateIntencaoDto, AprovarIntencaoDto } from './dto/create-intencao.dto';
import { CreateCobrancaDto } from './dto/create-cobranca.dto';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class ConsultorService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Carteira do consultor ────────────────────────────────────────────────

  async getCarteira(consultorId: number) {
    return this.prisma.client.findMany({
      where: { consultorId, active: true },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        cpf: true,
        whatsapp: true,
        loans: {
          where: { status: { in: ['ativo', 'inadimplente'] } },
          select: {
            id: true,
            status: true,
            principalAmount: true,
            totalReceivable: true,
            numeroParcelas: true,
          },
        },
      },
    });
  }

  async getStats(consultorId: number) {
    const [totalClientes, emprestimoAtivos, parcelas] = await Promise.all([
      this.prisma.client.count({ where: { consultorId, active: true } }),
      this.prisma.loan.count({
        where: { client: { consultorId }, status: 'ativo' },
      }),
      this.prisma.installment.count({
        where: { loan: { client: { consultorId } }, status: 'atrasado' },
      }),
    ]);
    return { totalClientes, emprestimoAtivos, parcelasAtrasadas: parcelas };
  }

  // ─── Solicitações ─────────────────────────────────────────────────────────

  async criarSolicitacao(dto: CreateSolicitacaoDto, currentUser: RequestUser) {
    const isConsultor = currentUser.role === 'consultor';
    const consultorId = isConsultor ? currentUser.id : (dto as any).consultorId;

    if (isConsultor) {
      await this.assertClientePertenceConsultor(dto.clientId, currentUser.id);
    }

    const solicitacao = await this.prisma.consultorSolicitacao.create({
      data: {
        consultorId,
        clientId: dto.clientId,
        loanId: dto.loanId ?? null,
        tipo: dto.tipo,
        descricao: dto.descricao,
        valorSolicitado: dto.valorSolicitado ?? null,
        urgencia: (dto as any).urgencia ?? 'normal',
      },
      include: { client: { select: { nome: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        acao: 'SOLICITACAO_CONSULTOR_CRIADA',
        entidade: 'ConsultorSolicitacao',
        entidadeId: solicitacao.id,
        dados: { tipo: dto.tipo, clienteNome: solicitacao.client.nome },
      },
    }).catch(() => {});

    return solicitacao;
  }

  async listarSolicitacoes(currentUser: RequestUser, status?: string) {
    const where: Record<string, unknown> = {};

    if (currentUser.role === 'consultor') {
      where.consultorId = currentUser.id;
    }

    if (status) where.status = status;

    return this.prisma.consultorSolicitacao.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        consultor: { select: { nome: true } },
        client: { select: { nome: true, cpf: true } },
        loan: { select: { id: true, status: true } },
      },
    });
  }

  async responderSolicitacao(
    id: number,
    dto: ResponderSolicitacaoDto,
    currentUser: RequestUser,
  ) {
    const sol = await this.prisma.consultorSolicitacao.findUnique({ where: { id } });
    if (!sol) throw new NotFoundException('Solicitação não encontrada');
    if (sol.status !== 'pendente') {
      throw new ForbiddenException('Solicitação já foi respondida');
    }

    return this.prisma.consultorSolicitacao.update({
      where: { id },
      data: {
        status: dto.status,
        respostaFinanceiro: dto.respostaFinanceiro ?? null,
        respondidoPor: currentUser.id,
        respondidoEm: new Date(),
      },
    });
  }

  // ─── Intenções de empréstimo ──────────────────────────────────────────────

  async criarIntencao(dto: CreateIntencaoDto, currentUser: RequestUser) {
    if (currentUser.role === 'consultor') {
      await this.assertClientePertenceConsultor(dto.clientId, currentUser.id);
    }

    const intencao = await this.prisma.intencaoEmprestimo.create({
      data: {
        clientId: dto.clientId,
        consultorId: currentUser.id,
        valorSolicitado: dto.valorSolicitado,
        numeroParcelas: dto.numeroParcelas,
        finalidade: dto.finalidade ?? null,
        observacoes: dto.observacoes ?? null,
      },
      include: { client: { select: { nome: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        acao: 'INTENCAO_EMPRESTIMO_CRIADA',
        entidade: 'IntencaoEmprestimo',
        entidadeId: intencao.id,
        dados: { valorSolicitado: dto.valorSolicitado, clienteNome: intencao.client.nome },
      },
    }).catch(() => {});

    return intencao;
  }

  async listarIntencoes(currentUser: RequestUser, status?: string) {
    const where: Record<string, unknown> = {};

    if (currentUser.role === 'consultor') {
      where.consultorId = currentUser.id;
    }

    if (status) where.status = status;

    return this.prisma.intencaoEmprestimo.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { nome: true, cpf: true } },
        consultor: { select: { nome: true } },
      },
    });
  }

  async aprovarIntencao(id: number, dto: AprovarIntencaoDto, currentUser: RequestUser) {
    const intencao = await this.prisma.intencaoEmprestimo.findUnique({ where: { id } });
    if (!intencao) throw new NotFoundException('Intenção não encontrada');
    if (intencao.status !== 'aguardando') {
      throw new ForbiddenException('Intenção já foi processada');
    }

    return this.prisma.intencaoEmprestimo.update({
      where: { id },
      data: {
        status: dto.status,
        observacoes: dto.observacoes ?? intencao.observacoes,
        aprovadoPor: currentUser.id,
        aprovadoEm: new Date(),
      },
    });
  }

  // ─── Cobranças ────────────────────────────────────────────────────────────

  async registrarCobranca(dto: CreateCobrancaDto, currentUser: RequestUser) {
    if (currentUser.role === 'consultor') {
      await this.assertClientePertenceConsultor(dto.clientId, currentUser.id);
    }

    return this.prisma.cobrancaContato.create({
      data: {
        installmentId: dto.installmentId,
        clientId: dto.clientId,
        consultorId: currentUser.id,
        canal: dto.canal,
        resultado: dto.resultado,
        prometeuPagarEm: dto.prometeuPagarEm ? dataLocal(dto.prometeuPagarEm) : null,
        observacao: dto.observacao ?? null,
      },
    });
  }

  async listarCobrancas(currentUser: RequestUser, clientId?: number) {
    const where: Record<string, unknown> = {};

    if (currentUser.role === 'consultor') {
      where.consultorId = currentUser.id;
    }

    if (clientId) where.clientId = clientId;

    return this.prisma.cobrancaContato.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { nome: true } },
        installment: { select: { numero: true, installmentAmount: true, dataVencimento: true } },
      },
    });
  }

  // ─── Relatório geral do cliente (consultor) ──────────────────────────────

  async listarClientesRelatorio(currentUser: RequestUser) {
    const where: Record<string, unknown> = { active: true };
    if (currentUser.role === 'consultor') where.consultorId = currentUser.id;

    const clientes = await this.prisma.client.findMany({
      where,
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, cpf: true },
    });
    if (clientes.length === 0) return [];

    // A tela lista a carteira inteira de cara, entao cada linha ja diz se o
    // cliente tem parcela vencida: e a primeira coisa que o consultor precisa
    // saber antes de ligar, sem ter que abrir cliente por cliente.
    const ids = clientes.map((c) => c.id);
    const loans = await this.prisma.loan.findMany({
      where: { clientId: { in: ids }, status: { in: ['ativo', 'inadimplente'] } },
      select: { id: true, clientId: true },
    });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const atrasadas = loans.length
      ? await this.prisma.installment.groupBy({
          by: ['loanId'],
          where: {
            loanId: { in: loans.map((l) => l.id) },
            status: { in: ['pendente', 'parcialmente_pago', 'atrasado'] },
            dataVencimento: { lt: hoje },
          },
          _count: { _all: true },
        })
      : [];

    const clientePorLoan = new Map(loans.map((l) => [l.id, l.clientId]));
    const contratos = new Map<number, number>();
    for (const l of loans) contratos.set(l.clientId, (contratos.get(l.clientId) ?? 0) + 1);
    const emAtraso = new Map<number, number>();
    for (const g of atrasadas) {
      const clientId = clientePorLoan.get(g.loanId);
      if (clientId === undefined) continue;
      emAtraso.set(clientId, (emAtraso.get(clientId) ?? 0) + g._count._all);
    }

    return clientes.map((c) => ({
      ...c,
      contratosAtivos: contratos.get(c.id) ?? 0,
      parcelasAtrasadas: emAtraso.get(c.id) ?? 0,
    }));
  }

  /**
   * Visão completa do cliente para o consultor: cada contrato com as parcelas
   * separadas em pagas / vencidas / a vencer. Consultor só enxerga a própria
   * carteira; admin e financeiro enxergam qualquer cliente.
   */
  async getRelatorioCliente(clientId: number, currentUser: RequestUser) {
    if (currentUser.role === 'consultor') {
      await this.assertClientePertenceConsultor(clientId, currentUser.id);
    }

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        nome: true,
        cpf: true,
        whatsapp: true,
        email: true,
        cidade: true,
        estado: true,
        active: true,
        consultor: { select: { id: true, nome: true } },
        loans: {
          orderBy: { dataInicio: 'desc' },
          select: {
            id: true,
            status: true,
            principalAmount: true,
            totalReceivable: true,
            numeroParcelas: true,
            dataInicio: true,
            metodoPagamento: true,
            multaPercentual: true,
            moraDiariaPercentual: true,
            installments: {
              orderBy: { dataVencimento: 'asc' },
              select: {
                id: true,
                numero: true,
                installmentAmount: true,
                dataVencimento: true,
                status: true,
                totalPago: true,
                saldoDevedor: true,
                payments: {
                  where: { estornado: false },
                  select: { dataPagamento: true, valorPago: true, estornado: true },
                  orderBy: { dataPagamento: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!client) throw new NotFoundException('Cliente não encontrado');

    const [multaS, moraS] = await Promise.all([
      this.prisma.siteSetting.findUnique({ where: { chave: 'financeiro.multa_atraso_percentual' } }),
      this.prisma.siteSetting.findUnique({ where: { chave: 'financeiro.mora_dia_percentual' } }),
    ]);
    const multaDefault = multaS?.valor ? parseFloat(multaS.valor) : 2.0;
    const moraDiaDefault = moraS?.valor ? parseFloat(moraS.valor) : 0.0333;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const resumo = {
      totalContratos: 0,
      totalContratado: 0,
      totalPago: 0,
      totalVencido: 0,
      totalAVencer: 0,
      qtdPagas: 0,
      qtdVencidas: 0,
      qtdAVencer: 0,
      qtdQuitadasHistorico: 0,
    };

    const contratos = client.loans.map((loan) => {
      const multaPerc = loan.multaPercentual != null ? Number(loan.multaPercentual) : multaDefault;
      const moraDiaPerc =
        loan.moraDiariaPercentual != null ? Number(loan.moraDiariaPercentual) : moraDiaDefault;

      const pagas: unknown[] = [];
      const vencidas: unknown[] = [];
      const aVencer: unknown[] = [];

      let pagoContrato = 0;
      let vencidoContrato = 0;
      let aVencerContrato = 0;

      for (const inst of loan.installments) {
        const enc = calcularEncargos(inst as never, multaPerc, moraDiaPerc, hoje);
        const venc = new Date(inst.dataVencimento);
        venc.setHours(0, 0, 0, 0);

        // Installment não guarda data de quitação — a referência é a última baixa viva.
        const ultimaBaixa = inst.payments.length
          ? inst.payments[inst.payments.length - 1].dataPagamento
          : null;

        const base = {
          id: inst.id,
          numero: inst.numero,
          valor: String(inst.installmentAmount),
          dataVencimento: inst.dataVencimento,
          dataPagamento: ultimaBaixa,
          status: inst.status,
          totalPago: String(inst.totalPago),
          saldo: enc.saldo,
          multa: enc.valorMulta,
          mora: enc.valorMora,
          totalDevido: enc.totalDevido,
          diasAtraso: enc.diasAtraso,
        };

        if (inst.status === 'cancelado') continue;

        if (enc.saldo <= 0.005) {
          pagas.push(base);
          pagoContrato += Number(inst.totalPago);
        } else if (venc < hoje) {
          vencidas.push(base);
          vencidoContrato += enc.totalDevido;
          pagoContrato += Number(inst.totalPago);
        } else {
          aVencer.push(base);
          aVencerContrato += enc.saldo;
          pagoContrato += Number(inst.totalPago);
        }
      }

      // A migracao do legado so trouxe as parcelas EM ABERTO: as ja quitadas no
      // sistema antigo nao viraram linha nenhuma. Sem isso o relatorio diz "0 pagas"
      // num contrato de 2021 com metade do carne liquidado - justamente o numero que
      // o consultor usa na negociacao. O que sobra e a diferenca entre o que o
      // contrato declara e o que o sistema registra.
      const quitadasHistorico = Math.max(0, loan.numeroParcelas - loan.installments.length);

      resumo.totalContratos += 1;
      resumo.totalContratado += Number(loan.totalReceivable);
      resumo.totalPago += pagoContrato;
      resumo.totalVencido += vencidoContrato;
      resumo.totalAVencer += aVencerContrato;
      resumo.qtdPagas += pagas.length;
      resumo.qtdVencidas += vencidas.length;
      resumo.qtdAVencer += aVencer.length;
      resumo.qtdQuitadasHistorico += quitadasHistorico;

      return {
        id: loan.id,
        status: loan.status,
        principalAmount: String(loan.principalAmount),
        totalReceivable: String(loan.totalReceivable),
        numeroParcelas: loan.numeroParcelas,
        qtdQuitadasHistorico: quitadasHistorico,
        dataInicio: loan.dataInicio,
        metodoPagamento: loan.metodoPagamento,
        totalPago: r2(pagoContrato),
        totalVencido: r2(vencidoContrato),
        totalAVencer: r2(aVencerContrato),
        pagas,
        vencidas,
        aVencer,
      };
    });

    return {
      cliente: {
        id: client.id,
        nome: client.nome,
        cpf: client.cpf,
        whatsapp: client.whatsapp,
        email: client.email,
        cidade: client.cidade,
        estado: client.estado,
        active: client.active,
        consultor: client.consultor,
      },
      resumo: {
        ...resumo,
        totalContratado: r2(resumo.totalContratado),
        totalPago: r2(resumo.totalPago),
        totalVencido: r2(resumo.totalVencido),
        totalAVencer: r2(resumo.totalAVencer),
      },
      contratos,
    };
  }

  // ─── Detalhe de cliente da carteira ──────────────────────────────────────

  async getClienteDetalhe(clientId: number, consultorId: number) {
    await this.assertClientePertenceConsultor(clientId, consultorId);

    return this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        nome: true,
        cpf: true,
        whatsapp: true,
        email: true,
        cidade: true,
        estado: true,
        portalAtivo: true,
        active: true,
        loans: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            principalAmount: true,
            totalReceivable: true,
            numeroParcelas: true,
            status: true,
            dataInicio: true,
            installments: {
              where: { status: 'atrasado' },
              select: { id: true },
            },
          },
        },
        cobrancaContatos: {
          where: { consultorId },
          orderBy: { createdAt: 'desc' },
          take: 15,
          select: {
            id: true,
            canal: true,
            resultado: true,
            prometeuPagarEm: true,
            observacao: true,
            createdAt: true,
            installment: {
              select: { numero: true, installmentAmount: true, dataVencimento: true },
            },
          },
        },
      },
    });
  }

  // ─── Relatório da Carteira ────────────────────────────────────────────────

  async getRelatorio(consultorId: number) {
    const [loans, overdueInstallments, payments] = await Promise.all([
      this.prisma.loan.findMany({
        where: { client: { consultorId }, status: { in: ['ativo', 'inadimplente'] } },
        select: {
          id: true,
          principalAmount: true,
          totalReceivable: true,
          comissaoPercentual: true,
          status: true,
          dataInicio: true,
          installments: {
            select: {
              status: true, installmentAmount: true, totalPago: true, principalPayback: true,
              payments: { where: { estornado: false }, select: BAIXA_SELECT, orderBy: BAIXA_ORDER },
            },
          },
        },
      }),
      this.prisma.installment.findMany({
        where: { loan: { client: { consultorId } }, status: 'atrasado' },
        select: {
          installmentAmount: true,
          totalPago: true,
          dataVencimento: true,
          loan: { select: { client: { select: { nome: true } } } },
        },
        orderBy: { dataVencimento: 'asc' },
        take: 20,
      }),
      this.prisma.payment.findMany({
        where: {
          estornado: false,
          installment: { loan: { client: { consultorId } } },
        },
        select: { valorPago: true, dataPagamento: true },
      }),
    ]);

    // Resumo da carteira
    let totalInvestido = 0;
    let totalAReceber = 0;
    let totalRecebido = 0;
    let totalEmAtraso = 0;
    let comissaoPrevista = 0;  // % × lucro total dos contratos da carteira
    let comissaoRealizada = 0; // % × lucro já recebido (capital primeiro)

    for (const loan of loans) {
      totalInvestido += Number(loan.principalAmount);
      const pct = Number(loan.comissaoPercentual ?? 0);
      const lucroContrato = Number(loan.totalReceivable) - Number(loan.principalAmount);
      comissaoPrevista += (lucroContrato * pct) / 100;
      for (const inst of loan.installments) {
        const saldo = Number(inst.installmentAmount) - Number(inst.totalPago);
        // Lucro realizado da parcela: proporcional (daqui pra frente) ou capital-primeiro (legado).
        const lucroRealizado = realizedLucro(inst.payments, {
          principalPayback: inst.principalPayback,
          installmentAmount: inst.installmentAmount,
        });
        comissaoRealizada += (lucroRealizado * pct) / 100;
        if (inst.status === 'pendente' || inst.status === 'parcialmente_pago') {
          totalAReceber += saldo;
        } else if (inst.status === 'atrasado') {
          totalAReceber += saldo;
          totalEmAtraso += saldo;
        }
      }
    }

    for (const p of payments) {
      totalRecebido += Number(p.valorPago);
    }

    // Faturamento dos últimos 6 meses
    const now = new Date();
    const meses: { mes: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const total = payments
        .filter(p => {
          const dt = new Date(p.dataPagamento);
          return dt >= start && dt <= end;
        })
        .reduce((s, p) => s + Number(p.valorPago), 0);
      meses.push({ mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, total });
    }

    return {
      resumo: {
        totalContratos: loans.length,
        totalInvestido,
        totalAReceber,
        totalRecebido,
        totalEmAtraso,
        comissaoPrevista: parseFloat(comissaoPrevista.toFixed(2)),
        comissaoRealizada: parseFloat(comissaoRealizada.toFixed(2)),
        inadimplentes: loans.filter(l => l.status === 'inadimplente').length,
      },
      faturamentoMensal: meses,
      parcelasAtrasadas: overdueInstallments,
    };
  }

  // ─── Helper ───────────────────────────────────────────────────────────────

  private async assertClientePertenceConsultor(clientId: number, consultorId: number) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, consultorId },
    });
    if (!client) {
      throw new ForbiddenException('Cliente não pertence à sua carteira');
    }
  }
}
