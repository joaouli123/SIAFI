import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import axios from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';
import { QUEUE_FINANCE_NOTIFICATIONS } from '../../queue/queue.constants';
import {
  JOB_WA_LEMBRETE_VENCIMENTO,
  JOB_WA_COBRANCA_ATRASO,
  JOB_WA_CONFIRMACAO_PAGAMENTO,
  JOB_WA_PORTAL_ATIVADO,
  JOB_WA_COBRANCA_ANTECIPADA,
} from '../../queue/queue.constants';
import type { NotificationJobData } from '../../queue/queue.interfaces';

const TELEFONE_SUPORTE = process.env.WHATSAPP_SUPORTE ?? '(65) 99999-9999';

@Processor(QUEUE_FINANCE_NOTIFICATIONS, { concurrency: 5 })
export class WhatsAppWorker extends WorkerHost {
  private readonly logger = new Logger(WhatsAppWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    // Este worker só processa jobs de WhatsApp; email jobs são ignorados aqui
    if (!job.name.startsWith('whatsapp.')) return;

    const { clienteNome, clienteWhatsapp, valorParcela, dataVencimento, senhaTemporaria } = job.data;

    if (!clienteWhatsapp) {
      this.logger.warn(`Job ${job.id} ignorado: cliente sem WhatsApp (clientId=${job.data.clientId})`);
      return;
    }

    const valor = valorParcela
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorParcela)
      : '';

    let message: string;

    switch (job.name) {
      case JOB_WA_LEMBRETE_VENCIMENTO:
        message =
          `Olá, ${clienteNome}! 👋\n` +
          `Sua parcela de *${valor}* vence em *${dataVencimento ?? ''}*.\n` +
          `Pague com PIX pelo portal: https://siafi.app.br/portal`;
        break;

      case JOB_WA_COBRANCA_ATRASO:
        message =
          `Olá, ${clienteNome}. Identificamos que sua parcela de *${valor}* ` +
          `está em atraso. Entre em contato para regularizar: ${TELEFONE_SUPORTE}`;
        break;

      case JOB_WA_CONFIRMACAO_PAGAMENTO:
        message =
          `✅ Pagamento confirmado!\n` +
          `Valor: *${valor}*\n` +
          `Obrigado pela pontualidade, ${clienteNome}!`;
        break;

      case JOB_WA_PORTAL_ATIVADO:
        message =
          `Olá, ${clienteNome}! 👋\n` +
          `Seu acesso ao portal Lidera foi ativado.\n` +
          `🔐 Senha temporária: *${senhaTemporaria ?? ''}*\n` +
          `🌐 https://siafi.app.br/portal\n` +
          `⚠️ Troque sua senha no primeiro acesso.`;
        break;

      case JOB_WA_COBRANCA_ANTECIPADA:
        message =
          `Olá, ${clienteNome}! 💰\n` +
          `Sua parcela de *${valor}* vence em *${dataVencimento ?? ''}*.\n` +
          `Acesse o portal para pagar via PIX ou baixar o boleto:\n` +
          `🌐 https://siafi.app.br/portal\n` +
          `Qualquer dúvida, estamos à disposição!`;
        break;

      default:
        this.logger.warn(`Job name desconhecido: ${job.name}`);
        return;
    }

    await this.sendWhatsApp(clienteWhatsapp, message);

    await this.prisma.notification.create({
      data: {
        clientId: job.data.clientId,
        loanId: job.data.loanId ?? null,
        tipo: 'whatsapp',
        assunto: job.name,
        mensagem: message,
        status: 'enviado',
        sentAt: new Date(),
      },
    });
  }

  private async sendWhatsApp(phone: string, message: string): Promise<void> {
    const apiUrl = process.env.EVOLUTION_API_URL ?? process.env.WHATSAPP_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY ?? process.env.WHATSAPP_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE ?? process.env.WHATSAPP_INSTANCE;

    if (!apiUrl || !apiKey || !instance) {
      throw new Error('Evolution API não configurada — verifique EVOLUTION_API_URL/KEY/INSTANCE');
    }

    const phoneClean = phone.replace(/\D/g, '');
    const number = phoneClean.startsWith('55') ? phoneClean : `55${phoneClean}`;

    await axios.post(
      `${apiUrl}/message/sendText/${instance}`,
      { number, text: message },
      { headers: { apikey: apiKey }, timeout: 15000 },
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<NotificationJobData>, error: Error): Promise<void> {
    this.logger.error(`Job ${job.name} (id=${job.id}) falhou definitivamente: ${error.message}`);

    await this.prisma.auditLog.create({
      data: {
        acao: `${job.name.toUpperCase().replace(/\./g, '_')}_FALHOU`,
        entidade: 'queue',
        contexto: {
          jobId: job.id,
          jobName: job.name,
          erro: error.message,
          clientId: job.data.clientId,
          tentativas: job.attemptsMade,
        },
      },
    });
  }
}
