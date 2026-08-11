import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailTemplateService } from '../../email-template/email-template.service';
import { QUEUE_FINANCE_NOTIFICATIONS } from '../../queue/queue.constants';
import {
  JOB_EMAIL_LEMBRETE,
  JOB_EMAIL_CONFIRMACAO,
  JOB_EMAIL_PORTAL_ATIVADO,
  JOB_EMAIL_COBRANCA_ANTECIPADA,
  JOB_EMAIL_LINK_ACESSO,
  JOB_EMAIL_ACEITE_CONTRATO,
} from '../../queue/queue.constants';
import type { NotificationJobData } from '../../queue/queue.interfaces';

const LOGO_URL = 'https://siafi.app.br/logo.png';
const PORTAL_URL = 'https://siafi.app.br/portal';

@Processor(QUEUE_FINANCE_NOTIFICATIONS, { concurrency: 3 })
export class EmailWorker extends WorkerHost {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailTplService: EmailTemplateService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    // Este worker só processa jobs de email; WhatsApp jobs são ignorados aqui
    if (!job.name.startsWith('email.')) return;

    const { clienteEmail, pdfBase64 } = job.data;

    if (!clienteEmail) {
      this.logger.warn(`Job ${job.id} ignorado: cliente sem email (clientId=${job.data.clientId})`);
      await this.prisma.auditLog.create({
        data: {
          acao: 'EMAIL_IGNORADO',
          entidade: 'email',
          entidadeId: job.data.clientId,
          contexto: {
            jobId: job.id,
            jobName: job.name,
            motivo: 'Cliente sem email cadastrado',
            clientId: job.data.clientId,
          } as any,
        },
      }).catch(() => {});
      return;
    }

    const { subject, html } = await this.resolveTemplate(job);

    const attachments = pdfBase64 && job.name === JOB_EMAIL_COBRANCA_ANTECIPADA
      ? [{ filename: `boleto-parcela-${job.data.installmentId ?? ''}.pdf`, content: Buffer.from(pdfBase64, 'base64'), contentType: 'application/pdf' }]
      : undefined;

    let messageId: string | undefined;
    try {
      messageId = await this.sendEmail(clienteEmail, subject, html, attachments);
    } catch (err: any) {
      await this.prisma.auditLog.create({
        data: {
          acao: 'EMAIL_FALHOU',
          entidade: 'email',
          entidadeId: job.data.clientId,
          contexto: {
            jobId: job.id,
            jobName: job.name,
            destinatario: clienteEmail,
            assunto: subject,
            erro: err?.message ?? String(err),
            smtpHost: process.env.MAIL_HOST,
            smtpPort: process.env.MAIL_PORT,
            clientId: job.data.clientId,
          } as any,
        },
      }).catch(() => {});
      throw err;
    }

    await Promise.all([
      this.prisma.notification.create({
        data: {
          clientId: job.data.clientId,
          loanId: job.data.loanId ?? null,
          tipo: 'email',
          assunto: subject,
          mensagem: `Email enviado para ${clienteEmail}`,
          status: 'enviado',
          sentAt: new Date(),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          acao: 'EMAIL_ENVIADO',
          entidade: 'email',
          entidadeId: job.data.clientId,
          contexto: {
            jobId: job.id,
            jobName: job.name,
            destinatario: clienteEmail,
            assunto: subject,
            messageId,
            temAnexo: !!attachments,
            smtpHost: process.env.MAIL_HOST,
            smtpPort: process.env.MAIL_PORT,
            clientId: job.data.clientId,
          } as any,
        },
      }),
    ]);
  }

  private async resolveTemplate(job: Job<NotificationJobData>): Promise<{ subject: string; html: string }> {
    const vars: Record<string, string> = {
      clienteNome:    job.data.clienteNome ?? '',
      valorParcela:   job.data.valorParcela
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(job.data.valorParcela)
        : '',
      dataVencimento: job.data.dataVencimento ?? '',
      senhaTemporaria: job.data.senhaTemporaria ?? '',
      empresaNome:    'Lidera',
      ...(job.data.templateVars as Record<string, string> | undefined ?? {}),
    };

    const dbTpl = await this.emailTplService.getTemplate(job.name).catch(() => null);
    if (dbTpl) {
      let assunto = dbTpl.assunto;
      let corpo   = dbTpl.corpo;
      for (const [k, v] of Object.entries(vars)) {
        assunto = assunto.replaceAll(`{{${k}}}`, v);
        corpo   = corpo.replaceAll(`{{${k}}}`, v);
      }
      return { subject: assunto, html: corpo };
    }
    return this.buildTemplate(job);
  }

  private buildTemplate(job: Job<NotificationJobData>): { subject: string; html: string } {
    const { clienteNome, valorParcela, dataVencimento, senhaTemporaria, isReenvio } = job.data;

    const valor = valorParcela
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorParcela)
      : '';

    const footer = `
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#9ca3af;font-size:12px;text-align:center">
        Lidera — Sistema de Apoio Financeiro<br>
        Para dúvidas, acesse ${PORTAL_URL}
      </p>`;

    switch (job.name) {
      case JOB_EMAIL_LEMBRETE:
        return {
          subject: `Lembrete: parcela de ${valor} vence em ${dataVencimento ?? ''}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
              <h2 style="color:#111827">Lembrete de Vencimento</h2>
              <p>Olá, <strong>${clienteNome}</strong>!</p>
              <p>Sua parcela de <strong>${valor}</strong> vence em <strong>${dataVencimento ?? ''}</strong>.</p>
              <a href="${PORTAL_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
                Pagar agora
              </a>
              ${footer}
            </div>`,
        };

      case JOB_EMAIL_CONFIRMACAO:
        return {
          subject: `✅ Pagamento de ${valor} confirmado`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
              <h2 style="color:#16a34a">Pagamento Confirmado</h2>
              <p>Olá, <strong>${clienteNome}</strong>!</p>
              <p>Recebemos o seu pagamento de <strong>${valor}</strong>. Obrigado pela pontualidade! 🎉</p>
              <a href="${PORTAL_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
                Ver extrato
              </a>
              ${footer}
            </div>`,
        };

      case JOB_EMAIL_PORTAL_ATIVADO:
        return {
          subject: isReenvio
            ? 'SIAFI — Nova senha de acesso ao portal'
            : 'SIAFI — Seu acesso ao portal foi ativado',
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <h2 style="color:#111827">${isReenvio ? 'Nova senha de acesso' : 'Bem-vindo ao Portal SIAFI!'}</h2>
              <p>Olá, <strong>${clienteNome}</strong>!</p>
              <p>${isReenvio ? 'Sua senha foi redefinida. Use a senha temporária abaixo para acessar o portal:' : 'Seu acesso foi criado. Use a senha temporária abaixo para entrar:'}</p>
              <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0;text-align:center">
                <span style="font-size:24px;font-weight:bold;letter-spacing:4px">${senhaTemporaria ?? ''}</span>
              </div>
              <p style="color:#ef4444;font-size:14px">⚠️ Troque sua senha imediatamente após o primeiro acesso.</p>
              <a href="${PORTAL_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
                Acessar portal
              </a>
              ${footer}
            </div>`,
        };

      case JOB_EMAIL_COBRANCA_ANTECIPADA:
        return {
          subject: `Lembrete: parcela de ${valor} vence em ${dataVencimento ?? ''}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
              <h2 style="color:#1e40af">Aviso de Vencimento</h2>
              <p>Olá, <strong>${clienteNome}</strong>!</p>
              <p>Sua parcela de <strong>${valor}</strong> vence em <strong>${dataVencimento ?? ''}</strong>.</p>
              <p>O boleto está em anexo neste e-mail. Você também pode pagar via PIX pelo portal:</p>
              <a href="${PORTAL_URL}" style="display:inline-block;background:#1e40af;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
                Acessar portal
              </a>
              ${footer}
            </div>`,
        };

      case JOB_EMAIL_LINK_ACESSO: {
        const { linkAcesso, isAtivacao } = job.data;
        const subject = isAtivacao
          ? 'SIAFI — Crie sua senha de acesso ao portal'
          : 'SIAFI — Redefina sua senha de acesso';
        const titulo = isAtivacao ? 'Bem-vindo ao Portal SIAFI!' : 'Redefinição de senha';
        const subtexto = isAtivacao
          ? 'Clique no botão abaixo para criar sua senha. Após isso, você será redirecionado para o login do portal.'
          : 'Clique no botão abaixo para redefinir sua senha.';
        const botao = isAtivacao ? 'Criar minha senha' : 'Redefinir minha senha';
        return {
          subject,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
              <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
              <h2 style="color:#111827">${titulo}</h2>
              <p>Olá, <strong>${clienteNome}</strong>!</p>
              <p>${subtexto}</p>
              <div style="margin:24px 0;text-align:center">
                <a href="${linkAcesso ?? '#'}"
                   style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
                  ${botao}
                </a>
              </div>
              <p style="color:#6b7280;font-size:13px">Este link é válido por <strong>12 horas</strong> e pode ser usado apenas uma vez.</p>
              <p style="color:#6b7280;font-size:13px">Se você não solicitou este acesso, ignore este email.</p>
              ${footer}
            </div>`,
        };
      }

      case JOB_EMAIL_ACEITE_CONTRATO: {
        const { linkAcesso, needsPasswordSetup, clienteNome: nome } = job.data;
        if (needsPasswordSetup) {
          return {
            subject: 'SIAFI — Proposta aprovada! Crie sua senha para assinar',
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
                <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
                <h2 style="color:#16a34a">Proposta aprovada!</h2>
                <p>Olá, <strong>${nome}</strong>!</p>
                <p>Sua proposta de empréstimo foi aprovada. Para assinar o contrato, primeiro crie sua senha clicando no botão abaixo.</p>
                <p style="color:#6b7280;font-size:13px">Após fazer login, acesse <strong>Contratos</strong> para visualizar e assinar.</p>
                <div style="margin:24px 0;text-align:center">
                  <a href="${linkAcesso ?? '#'}"
                     style="display:inline-block;background:#16a34a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
                    Criar minha senha
                  </a>
                </div>
                <p style="color:#6b7280;font-size:13px">Este link é válido por <strong>12 horas</strong> e pode ser usado apenas uma vez.</p>
                ${footer}
              </div>`,
          };
        }
        return {
          subject: 'SIAFI — Sua proposta foi aprovada, acesse para assinar',
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
              <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
              <h2 style="color:#16a34a">Proposta aprovada!</h2>
              <p>Olá, <strong>${nome}</strong>!</p>
              <p>Sua proposta de empréstimo foi aprovada e está aguardando sua assinatura.</p>
              <p>Acesse o portal e vá em <strong>Contratos</strong> para visualizar e assinar o documento.</p>
              <div style="margin:24px 0;text-align:center">
                <a href="${linkAcesso ?? '#'}"
                   style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
                  Acessar o portal
                </a>
              </div>
              ${footer}
            </div>`,
        };
      }

      default:
        return { subject: `Notificação Lidera — ${job.name}`, html: `<p>Olá, ${clienteNome}!</p>` };
    }
  }

  private async sendEmail(to: string, subject: string, html: string, attachments?: any[]): Promise<string> {
    const host = process.env.SMTP_HOST ?? process.env.MAIL_HOST;
    const port = +(process.env.SMTP_PORT ?? process.env.MAIL_PORT ?? 587);
    const user = process.env.SMTP_USER ?? process.env.MAIL_USER;
    const pass = process.env.SMTP_PASS ?? process.env.MAIL_PASS;
    const from = process.env.SMTP_FROM ?? `"SIAFI — Lidera" <${user ?? ''}>`;

    if (!host || !user || !pass) {
      throw new Error(`SMTP não configurado — host=${host} user=${user} pass=${pass ? '***' : 'VAZIO'}`);
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({ from, to, subject, html, attachments });
    this.logger.log(`Email enviado → ${to} | subject: ${subject} | messageId: ${info.messageId}`);
    return info.messageId as string;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<NotificationJobData>, error: Error): void {
    this.logger.error(`Job ${job.name} (id=${job.id}) falhou definitivamente após ${job.attemptsMade} tentativas: ${error.message}`);
  }
}
