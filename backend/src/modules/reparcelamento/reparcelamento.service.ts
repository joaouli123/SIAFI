import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import Decimal from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import { dataLocal } from '../../common/data';
import { ScoreRiscoService } from '../score-risco/score-risco.service';
import { addMonthsSafe } from '../../common/utils/date.utils';
import { QUEUE_FINANCE_NOTIFICATIONS } from '../queue/queue.constants';
import type { NotificationJobData } from '../queue/queue.interfaces';
import { CreateSolicitacaoDto } from './dto/create-solicitacao.dto';
import { PropostaDto } from './dto/proposta.dto';
import { RejeitarSolicitacaoDto } from './dto/rejeitar-solicitacao.dto';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const INCLUDE_DETAIL = {
  client:    { select: { id: true, nome: true, cpf: true, whatsapp: true, email: true } },
  loan:      {
    select: {
      id: true, status: true, principalAmount: true, targetProfit: true,
      totalReceivable: true, numeroParcelas: true, dataInicio: true,
      reparcelamentoCount: true, consultorId: true, metodoPagamento: true,
    },
  },
  consultor: { select: { id: true, nome: true } },
} as const;


@Injectable()
export class ReparcelamentoService {
  constructor(
    private readonly prisma:      PrismaService,
    private readonly scoreRisco:  ScoreRiscoService,
    @InjectQueue(QUEUE_FINANCE_NOTIFICATIONS)
    private readonly queue: Queue<NotificationJobData>,
  ) {}

  // ─── Queries ────────────────────────────────────────────────────────────────

  async findAll(opts: { status?: string; loanId?: number } = {}): Promise<unknown[]> {
    return this.prisma.solicitacaoReparcelamento.findMany({
      where: {
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.loanId ? { loanId: opts.loanId } : {}),
      },
      include: INCLUDE_DETAIL,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findById(id: number): Promise<unknown> {
    const s = await this.prisma.solicitacaoReparcelamento.findUnique({
      where: { id },
      include: INCLUDE_DETAIL,
    });
    if (!s) throw new NotFoundException(`Solicitação ${id} não encontrada`);
    return s;
  }

  // ─── Commands ───────────────────────────────────────────────────────────────

  async criar(dto: CreateSolicitacaoDto, userId: number): Promise<unknown> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: dto.loanId },
      include: { client: { select: { id: true, nome: true, whatsapp: true, email: true } } },
    });

    if (!loan) throw new NotFoundException(`Empréstimo ${dto.loanId} não encontrado`);
    if (loan.status !== 'ativo' && loan.status !== 'inadimplente') {
      throw new BadRequestException(`Empréstimo com status "${loan.status}" não pode ser reparcelado`);
    }

    const existe = await this.prisma.solicitacaoReparcelamento.findFirst({
      where: { loanId: dto.loanId, status: { in: ['pendente', 'proposta_enviada', 'aprovado'] } },
    });
    if (existe) {
      throw new BadRequestException('Já existe uma solicitação ativa para este empréstimo');
    }

    const solicitacao = await this.prisma.$transaction(async (tx) => {
      const created = await tx.solicitacaoReparcelamento.create({
        data: {
          clientId:             loan.clientId,
          loanId:               dto.loanId,
          consultorId:          userId,
          tipo:                 dto.tipo,
          motivoCliente:        dto.motivoCliente,
          dataPrevistaPagamento: dto.dataPrevistaPagamento ? dataLocal(dto.dataPrevistaPagamento) : null,
          status:               'pendente',
        },
      });

      await tx.conversa.create({
        data: {
          solicitacaoId: created.id,
          tipo:          'reparcelamento',
          titulo:        `Reparcelamento #${created.id} — ${loan.client.nome}`,
        },
      });

      return created;
    });

    return solicitacao;
  }

  async submitProposta(id: number, dto: PropostaDto, userId: number): Promise<unknown> {
    const s = await this.prisma.solicitacaoReparcelamento.findUnique({ where: { id } });
    if (!s) throw new NotFoundException(`Solicitação ${id} não encontrada`);
    if (s.status !== 'pendente') {
      throw new BadRequestException(`Status "${s.status}" não permite envio de proposta`);
    }

    return this.prisma.solicitacaoReparcelamento.update({
      where: { id },
      data: {
        status:                 'proposta_enviada',
        novoValorPrincipal:     dto.novoValorPrincipal,
        novoTargetProfit:       dto.novoTargetProfit,
        novoNumeroParcelas:     dto.novoNumeroParcelas,
        novaDataInicio:         dataLocal(dto.novaDataInicio),
        multaAplicada:          dto.multaAplicada ?? null,
        moraAplicada:           dto.moraAplicada ?? null,
        observacaoFinanceiro:   dto.observacaoFinanceiro ?? null,
        respondidoPor:          userId,
        respondidoEm:           new Date(),
      },
      include: INCLUDE_DETAIL,
    });
  }

  async aprovarSegundaInstancia(id: number, userId: number): Promise<unknown> {
    const s = await this.prisma.solicitacaoReparcelamento.findUnique({ where: { id } });
    if (!s) throw new NotFoundException(`Solicitação ${id} não encontrada`);
    if (s.status !== 'proposta_enviada') {
      throw new BadRequestException(`Status "${s.status}" não permite aprovação de segunda instância`);
    }

    return this.prisma.solicitacaoReparcelamento.update({
      where: { id },
      data: {
        status:                          'aprovado',
        aprovadoSegundaInstancia:        true,
        aprovadoSegundaInstanciaPor:     userId,
        aprovadoSegundaInstanciaEm:      new Date(),
      },
      include: INCLUDE_DETAIL,
    });
  }

  async rejeitar(id: number, dto: RejeitarSolicitacaoDto, userId: number): Promise<unknown> {
    const s = await this.prisma.solicitacaoReparcelamento.findUnique({ where: { id } });
    if (!s) throw new NotFoundException(`Solicitação ${id} não encontrada`);
    if (s.status === 'executado' || s.status === 'rejeitado') {
      throw new BadRequestException(`Solicitação já está "${s.status}"`);
    }

    return this.prisma.solicitacaoReparcelamento.update({
      where: { id },
      data: {
        status:       'rejeitado',
        respondidoPor: userId,
        respondidoEm:  new Date(),
        observacaoFinanceiro: dto.motivo ?? null,
      },
    });
  }

  async executar(id: number, ip: string, userId: number): Promise<unknown> {
    const s = await this.prisma.solicitacaoReparcelamento.findUnique({
      where: { id },
      include: {
        loan: true,
        client: { select: { id: true, nome: true } },
      },
    });

    if (!s) throw new NotFoundException(`Solicitação ${id} não encontrada`);
    if (s.status !== 'aprovado') {
      throw new BadRequestException(`Apenas solicitações "aprovadas" podem ser executadas (atual: "${s.status}")`);
    }
    if (!s.novoValorPrincipal || !s.novoTargetProfit || !s.novoNumeroParcelas || !s.novaDataInicio) {
      throw new BadRequestException('Proposta incompleta — preencha todos os campos antes de executar');
    }

    const novaDataInicio    = s.novaDataInicio!;
    const novoValorPrincipal = s.novoValorPrincipal!;
    const novoTargetProfit   = s.novoTargetProfit!;
    const novoNumeroParcelas = s.novoNumeroParcelas!;

    const installments = this.calcularParcelas(
      new Decimal(novoValorPrincipal.toString()),
      new Decimal(novoTargetProfit.toString()),
      novoNumeroParcelas,
      novaDataInicio,
    );

    const total = new Decimal(novoValorPrincipal.toString()).plus(new Decimal(novoTargetProfit.toString()));

    const aceitePayload = JSON.stringify({
      solicitacaoId: id,
      loanId:        s.loanId,
      clientId:      s.clientId,
      principal:     s.novoValorPrincipal.toString(),
      profit:        s.novoTargetProfit.toString(),
      parcelas:      s.novoNumeroParcelas,
      dataInicio:    novaDataInicio.toISOString(),
      ts:            Date.now(),
    });
    const aceiteHash = createHash('sha256').update(aceitePayload).digest('hex');
    const aceiteEm   = new Date();

    const novoLoan = await this.prisma.$transaction(async (tx) => {
      // 1. Cancelar empréstimo original
      await tx.loan.update({
        where: { id: s.loanId },
        data:  { status: 'cancelado' },
      });

      // 2. Cancelar parcelas não pagas do original
      await tx.installment.updateMany({
        where: { loanId: s.loanId, status: { not: 'pago' } },
        data:  { status: 'cancelado' },
      });

      // 3. Criar novo empréstimo com rastreabilidade
      const loan = await tx.loan.create({
        data: {
          clientId:            s.clientId,
          consultorId:         s.loan.consultorId,
          principalAmount:     novoValorPrincipal,
          targetProfit:        novoTargetProfit,
          totalReceivable:     total.toDecimalPlaces(2).toNumber(),
          numeroParcelas:      novoNumeroParcelas,
          dataInicio:          novaDataInicio,
          origemLoanId:        s.loanId,
          reparcelamentoCount: (s.loan.reparcelamentoCount ?? 0) + 1,
          metodoPagamento:     s.loan.metodoPagamento,
          aceiteClienteEm:     aceiteEm,
          aceiteClienteIp:     ip.substring(0, 45),
          aceiteClienteHash:   aceiteHash,
          status:              'ativo',
        },
      });

      // 4. Criar parcelas do novo empréstimo
      await tx.installment.createMany({
        data: installments.map(i => ({ ...i, loanId: loan.id })),
      });

      // 5. Finalizar solicitação
      await tx.solicitacaoReparcelamento.update({
        where: { id },
        data: {
          status:       'executado',
          novoLoanId:   loan.id,
          executadoPor: userId,
          executadoEm:  aceiteEm,
        },
      });

      return loan;
    });

    // Recalcular score após commit (não-bloqueante)
    void this.scoreRisco.recalcularScore(s.clientId);

    return { message: 'Reparcelamento executado com sucesso', novoLoanId: novoLoan.id };
  }

  simular(
    principal: number,
    profit: number,
    numeroParcelas: number,
    dataInicio: string,
  ) {
    const p = new Decimal(principal);
    const l = new Decimal(profit);
    const parcelas = this.calcularParcelas(p, l, numeroParcelas, dataLocal(dataInicio));
    const total    = p.plus(l);
    return {
      parcelas,
      totalReceivable: total.toFixed(2),
      valorParcela:    parcelas[0]?.installmentAmount.toFixed(2) ?? '0.00',
    };
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private calcularParcelas(
    principal: Decimal,
    profit:    Decimal,
    n:         number,
    dataInicio: Date,
  ) {
    const total = principal.plus(profit);
    const base  = total.dividedBy(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    const baseP = principal.dividedBy(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);

    const ajusteTotal = total.minus(base.times(n));
    const ajusteP     = principal.minus(baseP.times(n));

    return Array.from({ length: n }, (_, i) => {
      const isUlt        = i === n - 1;
      const installAmt   = isUlt ? base.plus(ajusteTotal) : base;
      const principalPay = isUlt ? baseP.plus(ajusteP)    : baseP;
      // netGain derivado garante a invariante installmentAmount == principalPayback + netGain
      const gain         = installAmt.minus(principalPay);
      const amt          = installAmt.toDecimalPlaces(2).toNumber();
      return {
        numero:            i + 1,
        installmentAmount: amt,
        principalPayback:  principalPay.toDecimalPlaces(2).toNumber(),
        netGain:           gain.toDecimalPlaces(2).toNumber(),
        dataVencimento:    addMonthsSafe(dataInicio, i + 1),
        status:            'pendente' as const,
        totalPago:         0,
        // Sem saldoDevedor o schema aplica o default 0 → o saldo some no detalhe do
        // contrato, o pagamento pré-preenche 0 e o cron de encargos ignora a parcela.
        saldoDevedor:      amt,
        valorMulta:        0,
        valorMora:         0,
      };
    });
  }
}
