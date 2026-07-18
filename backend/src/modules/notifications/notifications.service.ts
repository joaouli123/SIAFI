import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  QUEUE_FINANCE_NOTIFICATIONS,
  JOB_WA_LEMBRETE_VENCIMENTO,
  JOB_WA_COBRANCA_ATRASO,
  JOB_WA_CONFIRMACAO_PAGAMENTO,
  JOB_WA_PORTAL_ATIVADO,
  JOB_EMAIL_LEMBRETE,
  JOB_EMAIL_CONFIRMACAO,
  JOB_EMAIL_PORTAL_ATIVADO,
} from '../queue/queue.constants';
import type { NotificationJobData } from '../queue/queue.interfaces';

interface LogNotificationData {
  clientId: number;
  loanId?: number;
  tipo: string;
  assunto?: string;
  mensagem: string;
  status: 'enviado' | 'erro' | 'pendente';
}

export interface NotificationList {
  data: {
    id: number;
    clientId: number;
    loanId: number | null;
    tipo: string;
    assunto: string | null;
    mensagem: string;
    status: string;
    sentAt: Date | null;
    createdAt: Date;
    client: { nome: string };
  }[];
  meta: {
    total: number;
    page: number;
    limit: number;
    lastPage: number;
  };
  // Campos flat espelhados de `meta` — a tela /notificacoes lê data.total/data.lastPage.
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_FINANCE_NOTIFICATIONS)
    private readonly notificationsQueue: Queue<NotificationJobData>,
  ) {}

  async enviarLembreteVencimento(clientId: number, installmentId: number): Promise<void> {
    const installment = await this.prisma.installment.findUnique({
      where: { id: installmentId },
      include: { loan: { include: { client: { select: { id: true, nome: true, whatsapp: true, email: true } } } } },
    });
    if (!installment) return;

    const client = installment.loan.client;
    const today = new Date().toISOString().split('T')[0];
    const dtVenc = new Intl.DateTimeFormat('pt-BR').format(new Date(installment.dataVencimento));

    const jobData: NotificationJobData = {
      clientId: client.id,
      clienteNome: client.nome,
      clienteWhatsapp: client.whatsapp ?? undefined,
      clienteEmail: client.email ?? undefined,
      installmentId,
      loanId: installment.loanId,
      valorParcela: Number(installment.installmentAmount),
      dataVencimento: dtVenc,
    };

    if (client.whatsapp) {
      await this.notificationsQueue.add(JOB_WA_LEMBRETE_VENCIMENTO, jobData, {
        jobId: `lembrete-wa-${installmentId}-${today}`,
      });
    }
    if (client.email) {
      await this.notificationsQueue.add(JOB_EMAIL_LEMBRETE, jobData, {
        jobId: `lembrete-email-${installmentId}-${today}`,
      });
    }
  }

  async enviarCobrancaAtraso(clientId: number, installmentId: number): Promise<void> {
    const installment = await this.prisma.installment.findUnique({
      where: { id: installmentId },
      include: { loan: { include: { client: { select: { id: true, nome: true, whatsapp: true } } } } },
    });
    if (!installment) return;

    const client = installment.loan.client;
    if (!client.whatsapp) return;

    await this.notificationsQueue.add(
      JOB_WA_COBRANCA_ATRASO,
      {
        clientId: client.id,
        clienteNome: client.nome,
        clienteWhatsapp: client.whatsapp,
        installmentId,
        loanId: installment.loanId,
        valorParcela: Number(installment.installmentAmount),
      },
      { jobId: `cobranca-${installmentId}-${new Date().toISOString().split('T')[0]}` },
    );
  }

  async enviarConfirmacaoPagamento(clientId: number, valorPago: number): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, nome: true, whatsapp: true, email: true },
    });
    if (!client) return;

    const jobData: NotificationJobData = {
      clientId: client.id,
      clienteNome: client.nome,
      clienteWhatsapp: client.whatsapp ?? undefined,
      clienteEmail: client.email ?? undefined,
      valorParcela: valorPago,
    };

    const now = Date.now();
    if (client.whatsapp) {
      await this.notificationsQueue.add(JOB_WA_CONFIRMACAO_PAGAMENTO, jobData, {
        jobId: `confirmacao-wa-${clientId}-${now}`,
      });
    }
    if (client.email) {
      await this.notificationsQueue.add(JOB_EMAIL_CONFIRMACAO, jobData, {
        jobId: `confirmacao-email-${clientId}-${now}`,
      });
    }
  }

  async enviarAcessoPortal(clientId: number, senhaTemporaria: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, nome: true, whatsapp: true, email: true },
    });
    if (!client) return;

    const jobData: NotificationJobData = {
      clientId: client.id,
      clienteNome: client.nome,
      clienteWhatsapp: client.whatsapp ?? undefined,
      clienteEmail: client.email ?? undefined,
      senhaTemporaria,
    };

    if (client.whatsapp) {
      await this.notificationsQueue.add(JOB_WA_PORTAL_ATIVADO, jobData);
    }
    if (client.email) {
      await this.notificationsQueue.add(JOB_EMAIL_PORTAL_ATIVADO, jobData);
    }
  }

  async logNotification(data: LogNotificationData): Promise<void> {
    await this.prisma.notification.create({
      data: {
        clientId: data.clientId,
        loanId: data.loanId ?? null,
        tipo: data.tipo,
        assunto: data.assunto ?? null,
        mensagem: data.mensagem,
        status: data.status,
        sentAt: data.status === 'enviado' ? new Date() : null,
      },
    });
  }

  async findAll(page = 1, limit = 20, clientId?: number): Promise<NotificationList> {
    const skip = (page - 1) * limit;
    const where = clientId ? { clientId } : {};

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { client: { select: { nome: true } } },
      }),
      this.prisma.notification.count({ where }),
    ]);

    const lastPage = Math.ceil(total / limit) || 1;
    return {
      data,
      meta: { total, page, limit, lastPage },
      total,
      page,
      limit,
      lastPage,
    };
  }
}
