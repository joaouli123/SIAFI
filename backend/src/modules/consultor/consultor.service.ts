import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { dataLocal } from '../../common/data';
import { BAIXA_ORDER, BAIXA_SELECT, realizedLucro } from '../../common/commission';
import type { RequestUser } from '../auth/guards/supabase-auth.guard';
import { CreateSolicitacaoDto, ResponderSolicitacaoDto } from './dto/create-solicitacao.dto';
import { CreateIntencaoDto, AprovarIntencaoDto } from './dto/create-intencao.dto';
import { CreateCobrancaDto } from './dto/create-cobranca.dto';

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
