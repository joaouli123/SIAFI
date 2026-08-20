import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Decimal from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import { calcularEncargos } from '../../common/encargos';
import { ScoreRiscoService } from '../score-risco/score-risco.service';
import { SettingsService } from '../settings/settings.service';
import { CobrancaService } from '../cobranca/cobranca.service';
import {
  QUEUE_FINANCE_NOTIFICATIONS,
  QUEUE_PAYMENT_PROCESSING,
  JOB_WA_LEMBRETE_VENCIMENTO,
  JOB_WA_COBRANCA_ATRASO,
  JOB_EMAIL_LEMBRETE,
  JOB_PAYMENT_CONCILIACAO,
  JOB_INTENCAO_SLA_ALERTA,
  JOB_INTENCAO_SLA_ESCALADA,
  JOB_PROPOSTA_EXPIRANDO_CLIENTE,
  JOB_PROPOSTA_EXPIRADA_CONSULTOR,
} from '../queue/queue.constants';
import type { NotificationJobData, PaymentJobData } from '../queue/queue.interfaces';

@Injectable()
export class CronService implements OnModuleInit {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreRisco: ScoreRiscoService,
    private readonly settings: SettingsService,
    private readonly cobranca: CobrancaService,
    @InjectQueue(QUEUE_FINANCE_NOTIFICATIONS)
    private readonly notificationsQueue: Queue<NotificationJobData>,
    @InjectQueue(QUEUE_PAYMENT_PROCESSING)
    private readonly paymentQueue: Queue<PaymentJobData>,
  ) {}

  // Toda instancia deste backend roda as 10 rotinas contra o MESMO banco. Uma
  // segunda instancia (homologacao, demo) duplicaria cobranca por WhatsApp/e-mail
  // para clientes reais e rodaria de novo o sla-aceite, que CANCELA contratos.
  // Sobe com CRON_ENABLED=false quem nao for a instancia dona das rotinas.
  // Excluir os jobs no onModuleInit nao funciona: o ScheduleExplorer do
  // @nestjs/schedule so os registra depois deste hook, entao o registry esta
  // vazio aqui e as rotinas sobem mesmo assim. O corte tem que ser no handler.
  private readonly cronDesligado = process.env.CRON_ENABLED === 'false';

  onModuleInit() {
    if (this.cronDesligado) {
      this.logger.warn('CRON_ENABLED=false — rotinas automaticas desligadas nesta instancia');
    }
  }

  @Cron('0 8 * * *', { name: 'mark-overdue', timeZone: 'America/Sao_Paulo' })
  async markOverdueInstallments(): Promise<void> {
    if (this.cronDesligado) return;
    this.logger.log('Cron: marcando parcelas em atraso');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const affected = await this.prisma.installment.findMany({
      where: { status: 'pendente', dataVencimento: { lt: today } },
      select: { loan: { select: { clientId: true } } },
    });

    const result = await this.prisma.installment.updateMany({
      where: { status: 'pendente', dataVencimento: { lt: today } },
      data: { status: 'atrasado' },
    });

    this.logger.log(`${result.count} parcelas marcadas como atrasado`);

    const clientIds = [...new Set(affected.map(i => i.loan.clientId))];
    for (const clientId of clientIds) {
      void this.scoreRisco.recalcularScore(clientId);
    }
  }

  @Cron('0 9 * * *', { name: 'send-reminders', timeZone: 'America/Sao_Paulo' })
  async sendReminders(): Promise<void> {
    if (this.cronDesligado) return;
    this.logger.log('Cron: enfileirando lembretes de vencimento (próximos 3 dias)');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    const parcelas = await this.prisma.installment.findMany({
      where: {
        status: 'pendente',
        dataVencimento: { gte: today, lte: threeDaysLater },
      },
      include: { loan: { include: { client: { select: { id: true, nome: true, whatsapp: true, email: true } } } } },
    });

    const todayStr = today.toISOString().split('T')[0];
    let enfileirados = 0;

    for (const parcela of parcelas) {
      const client = parcela.loan.client;
      const dtVenc = new Intl.DateTimeFormat('pt-BR').format(new Date(parcela.dataVencimento));

      const jobData: NotificationJobData = {
        clientId: client.id,
        clienteNome: client.nome,
        clienteWhatsapp: client.whatsapp ?? undefined,
        clienteEmail: client.email ?? undefined,
        installmentId: parcela.id,
        loanId: parcela.loanId,
        valorParcela: Number(parcela.installmentAmount),
        dataVencimento: dtVenc,
      };

      if (client.whatsapp) {
        await this.notificationsQueue.add(JOB_WA_LEMBRETE_VENCIMENTO, jobData, {
          jobId: `lembrete-wa-${parcela.id}-${todayStr}`,
        });
        enfileirados++;
      }
      if (client.email) {
        await this.notificationsQueue.add(JOB_EMAIL_LEMBRETE, jobData, {
          jobId: `lembrete-email-${parcela.id}-${todayStr}`,
        });
        enfileirados++;
      }
    }

    this.logger.log(`${enfileirados} lembretes enfileirados para ${parcelas.length} parcelas`);
  }

  @Cron('0 10 * * *', { name: 'send-overdue', timeZone: 'America/Sao_Paulo' })
  async sendOverdueNotices(): Promise<void> {
    if (this.cronDesligado) return;
    this.logger.log('Cron: enfileirando cobranças de atraso');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const atrasadas = await this.prisma.installment.findMany({
      where: { status: 'atrasado', dataVencimento: { gte: today, lt: tomorrow } },
      include: { loan: { include: { client: { select: { id: true, nome: true, whatsapp: true } } } } },
    });

    const todayStr = today.toISOString().split('T')[0];
    let enfileirados = 0;

    for (const parcela of atrasadas) {
      const client = parcela.loan.client;
      if (!client.whatsapp) continue;

      await this.notificationsQueue.add(
        JOB_WA_COBRANCA_ATRASO,
        {
          clientId: client.id,
          clienteNome: client.nome,
          clienteWhatsapp: client.whatsapp,
          installmentId: parcela.id,
          loanId: parcela.loanId,
          valorParcela: Number(parcela.installmentAmount),
        },
        { jobId: `cobranca-wa-${parcela.id}-${todayStr}` },
      );
      enfileirados++;
    }

    this.logger.log(`${enfileirados} cobranças enfileiradas`);
  }

  @Cron('0 11 * * *', { name: 'lembrete-reparcelamentos', timeZone: 'America/Sao_Paulo' })
  async lembreteReparcelamentosAprovados(): Promise<void> {
    if (this.cronDesligado) return;
    this.logger.log('Cron: lembretes de reparcelamentos aprovados não executados');

    const limite = new Date(Date.now() - 3 * 86_400_000); // aprovados há mais de 3 dias
    const pendentes = await this.prisma.solicitacaoReparcelamento.findMany({
      where: {
        status: 'aprovado',
        aprovadoSegundaInstanciaEm: { lt: limite },
      },
      include: { client: { select: { id: true, nome: true } } },
      take: 50,
    });

    for (const s of pendentes) {
      await this.notificationsQueue.add(
        'reparcelamento.lembrete-execucao',
        {
          clientId:    s.clientId,
          clienteNome: s.client.nome,
          templateVars: { solicitacaoId: String(s.id) },
        },
        { jobId: `reparcela-lembrete-${s.id}-${new Date().toISOString().split('T')[0]}` },
      );
    }

    if (pendentes.length > 0) {
      this.logger.warn(`${pendentes.length} reparcelamentos aprovados aguardando execução há mais de 3 dias`);
    }
  }

  @Cron('0 */2 * * *', { name: 'sla-intencoes', timeZone: 'America/Sao_Paulo' })
  async verificarSlaIntencoes(): Promise<void> {
    if (this.cronDesligado) return;
    this.logger.log('Cron: verificando SLA de intenções');
    const now = new Date();
    const duasHorasAtras = new Date(now.getTime() - 2 * 3_600_000);

    const [alertas, escaladas] = await Promise.all([
      this.prisma.intencaoEmprestimo.findMany({
        where: { status: 'aguardando', prazoExpiracaoEm: { lt: now }, slaNotificado: false },
        include: { client: { select: { id: true, nome: true } }, consultor: { select: { id: true, nome: true } } },
      }),
      this.prisma.intencaoEmprestimo.findMany({
        where: { status: 'aguardando', prazoExpiracaoEm: { lt: duasHorasAtras }, slaEscalonado: false },
        select: { id: true, clientId: true, client: { select: { nome: true } } },
      }),
    ]);

    if (alertas.length > 0) {
      const ids = alertas.map(i => i.id);
      await this.prisma.intencaoEmprestimo.updateMany({
        where: { id: { in: ids } },
        data:  { slaNotificado: true },
      });

      for (const intencao of alertas) {
        await this.notificationsQueue.add(JOB_INTENCAO_SLA_ALERTA, {
          clientId:    intencao.clientId,
          clienteNome: intencao.client.nome,
          templateVars: { intencaoId: String(intencao.id) },
        }, { jobId: `sla-alerta-${intencao.id}` });
      }
      this.logger.warn(`${alertas.length} intenções em SLA expirado — alertas enviados`);
    }

    if (escaladas.length > 0) {
      const ids = escaladas.map(i => i.id);
      await this.prisma.intencaoEmprestimo.updateMany({
        where: { id: { in: ids } },
        data:  { slaEscalonado: true },
      });

      for (const intencao of escaladas) {
        await this.notificationsQueue.add(JOB_INTENCAO_SLA_ESCALADA, {
          clientId:    intencao.clientId,
          clienteNome: intencao.client.nome,
          templateVars: { intencaoId: String(intencao.id) },
        }, { jobId: `sla-escalada-${intencao.id}` });
      }
      this.logger.warn(`${escaladas.length} intenções escaladas por SLA`);
    }
  }

  @Cron('0 7 * * *', { name: 'sla-aceite', timeZone: 'America/Sao_Paulo' })
  async verificarSlaAceite(): Promise<void> {
    if (this.cronDesligado) return;
    this.logger.log('Cron: verificando SLA de aceite de propostas');
    const agora = new Date();
    const em2dias = new Date(agora.getTime() + 2 * 86_400_000);
    const em1dia  = new Date(agora.getTime() + 1 * 86_400_000);
    const hoje    = agora.toISOString().split('T')[0];

    // D-2: notificar cliente
    const paraNotificarCliente = await this.prisma.loan.findMany({
      where: {
        status: 'aguardando_aceite',
        aceiteSlaNotificado: false,
        aceiteExpiraEm: { lte: em2dias },
      },
      include: { client: { select: { id: true, nome: true, whatsapp: true } } },
    });
    for (const loan of paraNotificarCliente) {
      await this.notificationsQueue.add(
        JOB_PROPOSTA_EXPIRANDO_CLIENTE,
        {
          clientId:        loan.clientId,
          clienteNome:     loan.client.nome,
          clienteWhatsapp: loan.client.whatsapp ?? undefined,
          loanId:          loan.id,
          templateVars:    { diasRestantes: '2', loanId: String(loan.id) },
        },
        { jobId: `proposta-expirando-${loan.id}-${hoje}` },
      );
      await this.prisma.loan.update({
        where: { id: loan.id },
        data: { aceiteSlaNotificado: true },
      });
    }

    // D-1: notificar consultor
    const paraNotificarConsultor = await this.prisma.loan.findMany({
      where: {
        status: 'aguardando_aceite',
        aceiteSlaConsultor: false,
        aceiteExpiraEm: { lte: em1dia },
        client: { consultorId: { not: null } },
      },
      include: {
        client: { select: { id: true, nome: true, consultorId: true } },
      },
    });
    for (const loan of paraNotificarConsultor) {
      if (!loan.client.consultorId) continue;
      await this.notificationsQueue.add(
        JOB_PROPOSTA_EXPIRADA_CONSULTOR,
        {
          clientId:     loan.clientId,
          clienteNome:  loan.client.nome,
          templateVars: { consultorId: String(loan.client.consultorId), loanId: String(loan.id) },
        },
        { jobId: `proposta-consultor-${loan.id}-${hoje}` },
      );
      await this.prisma.loan.update({
        where: { id: loan.id },
        data: { aceiteSlaConsultor: true },
      });
    }

    // D+0: cancelar propostas expiradas
    const expiradas = await this.prisma.loan.findMany({
      where: {
        status: 'aguardando_aceite',
        aceiteExpiraEm: { lt: agora },
      },
      include: { client: { select: { id: true, nome: true, consultorId: true } } },
    });

    for (const loan of expiradas) {
      await this.prisma.$transaction(async (tx) => {
        await tx.loan.update({
          where: { id: loan.id },
          data:  { status: 'cancelado' },
        });
        await tx.installment.updateMany({
          where: { loanId: loan.id, status: 'pendente' },
          data:  { status: 'cancelado' },
        });
        // Reverter IntencaoEmprestimo para 'aprovado' (re-aprovável sem nova análise)
        await tx.intencaoEmprestimo.updateMany({
          where: { loanId: loan.id },
          data:  { status: 'aprovado', loanId: null },
        });
        await tx.auditLog.create({
          data: {
            acao:       'PROPOSTA_EXPIRADA',
            entidade:   'loans',
            entidadeId: loan.id,
            dados: {
              clientId:      loan.clientId,
              aceiteExpiraEm: loan.aceiteExpiraEm?.toISOString(),
              motivo:        'Cliente não assinou dentro do prazo',
            },
          },
        });
      });
      this.logger.warn(`Proposta expirada — Loan #${loan.id} (cliente ${loan.client.nome})`);
    }

    if (expiradas.length > 0) {
      this.logger.warn(`${expiradas.length} proposta(s) cancelada(s) por expiração de SLA`);
    }
  }

  @Cron('0 2 * * *', { name: 'conciliacao-pix', timeZone: 'America/Sao_Paulo' })
  async conciliacaoPix(): Promise<void> {
    if (this.cronDesligado) return;
    this.logger.log('Cron: enfileirando job de conciliação PIX');

    await this.paymentQueue.add(
      JOB_PAYMENT_CONCILIACAO,
      { paymentId: '', externalReference: '', status: 'cron', amount: 0, origem: 'cron' },
      { jobId: `conciliacao-${new Date().toISOString().split('T')[0]}` },
    );
  }

  @Cron('5 8 * * *', { name: 'atualizar-encargos', timeZone: 'America/Sao_Paulo' })
  async atualizarEncargos(): Promise<void> {
    if (this.cronDesligado) return;
    this.logger.log('Cron: atualizando multas e mora diária');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const moraPercStr  = await this.settings.get('financeiro.mora_dia_percentual');
    const moraDefault  = new Decimal(moraPercStr ?? '0.0333');
    const multaPercStr = await this.settings.get('financeiro.multa_atraso_percentual');
    const multaDefault = new Decimal(multaPercStr ?? '2.00');

    // Parcelas vencidas com saldo devedor
    const vencidas = await this.prisma.installment.findMany({
      where: {
        status:        { in: ['atrasado', 'parcialmente_pago'] },
        dataVencimento: { lt: today },
        saldoDevedor:  { gt: 0 },
      },
      include: {
        payments: {
          select: { dataPagamento: true, valorPago: true, estornado: true },
          orderBy: { dataPagamento: 'asc' },
        },
        loan: {
          select: { moraDiariaPercentual: true, multaPercentual: true },
        },
      },
    });

    let multasAplicadas = 0;
    let moraAcumuladas  = 0;

    // Fórmula ÚNICA do sistema (common/encargos.ts), idempotente: multa única sobre o
    // valor da parcela + mora diária sobre o saldo de cada período (venc → baixas → hoje).
    for (const inst of vencidas) {
      const moraPerc = inst.loan.moraDiariaPercentual
        ? new Decimal(inst.loan.moraDiariaPercentual.toString())
        : moraDefault;
      const multaPerc = inst.loan.multaPercentual
        ? new Decimal(inst.loan.multaPercentual.toString())
        : multaDefault;

      const enc = calcularEncargos(inst, multaPerc.toNumber(), moraPerc.toNumber(), today);

      const multaJaAplicada = new Decimal(inst.multaAplicada.toString()).greaterThan(0);
      if (!multaJaAplicada) multasAplicadas++;

      await this.prisma.installment.update({
        where: { id: inst.id },
        data: {
          moraAcumulada:    enc.valorMora,
          valorMora:        enc.valorMora,
          multaAplicada:    enc.valorMulta,
          valorMulta:       enc.valorMulta,
          valorComEncargos: enc.totalDevido,
        },
      });
      moraAcumuladas++;
    }

    this.logger.log(`Encargos: ${moraAcumuladas} moras | ${multasAplicadas} multas aplicadas`);
  }

  @Cron('30 9 * * *', { name: 'cobrancas-antecipadas', timeZone: 'America/Sao_Paulo' })
  async enviarCobrancasAntecipadas(): Promise<void> {
    if (this.cronDesligado) return;
    this.logger.log('Cron: processando cobranças antecipadas');
    await this.cobranca.processarCobrancasAntecipadas();
  }

  @Cron('0 14 * * *', { name: 'reenviar-cobrancas', timeZone: 'America/Sao_Paulo' })
  async reenviarCobrancasNaoLidas(): Promise<void> {
    if (this.cronDesligado) return;
    this.logger.log('Cron: reenviando cobranças D-3');
    await this.cobranca.reenviarCobrancas();
  }
}
