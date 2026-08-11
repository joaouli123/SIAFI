import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import axios from 'axios';
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
  JOB_EMAIL_CAPITAL_LIBERADO,
  JOB_WA_LEMBRETE_VENCIMENTO,
  JOB_WA_COBRANCA_ATRASO,
  JOB_WA_CONFIRMACAO_PAGAMENTO,
  JOB_WA_PORTAL_ATIVADO,
  JOB_WA_COBRANCA_ANTECIPADA,
  JOB_WA_ACEITE_CONTRATO,
  JOB_WA_CAPITAL_LIBERADO,
  JOB_INTENCAO_NOVA,
  JOB_INTENCAO_REJEITADA,
  JOB_INTENCAO_SLA_ALERTA,
  JOB_INTENCAO_SLA_ESCALADA,
  JOB_PROPOSTA_EXPIRANDO_CLIENTE,
  JOB_PROPOSTA_EXPIRADA_CONSULTOR,
} from '../../queue/queue.constants';
import type { NotificationJobData } from '../../queue/queue.interfaces';

const LOGO_URL      = 'https://siafi.app.br/logo.png';
const PORTAL_URL    = 'https://siafi.app.br/portal';
const APP_URL       = process.env.APP_URL ?? 'https://siafi.app.br';
const TELEFONE_SUPORTE = process.env.WHATSAPP_SUPORTE ?? '(65) 99999-9999';

const EMAIL_FOOTER = `
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#9ca3af;font-size:12px;text-align:center">
    Lidera — Sistema de Apoio Financeiro<br>
    Para dúvidas, acesse <a href="${PORTAL_URL}" style="color:#6b7280">${PORTAL_URL}</a>
  </p>`;

function formatBRL(value: number | undefined): string {
  if (value === undefined) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

@Processor(QUEUE_FINANCE_NOTIFICATIONS, { concurrency: 3 })
export class NotificationsWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationsWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailTplService: EmailTemplateService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    if (job.name.startsWith('email.'))    return this.processEmail(job);
    if (job.name.startsWith('whatsapp.')) return this.processWhatsApp(job);

    // intencao.rejeitada vai para o cliente — usa o fluxo padrão de email (clienteEmail está no payload)
    if (job.name === JOB_INTENCAO_REJEITADA) return this.processEmail(job);

    if (job.name.startsWith('intencao.') || job.name.startsWith('proposta.')) {
      return this.processInternal(job);
    }

    this.logger.warn(`Job name não reconhecido: ${job.name} (id=${job.id}) — ignorado`);
  }

  // ─── Email (cliente) ──────────────────────────────────────────────────────

  private async processEmail(job: Job<NotificationJobData>): Promise<void> {
    const { clienteEmail, pdfBase64 } = job.data;

    if (!clienteEmail) {
      this.logger.warn(`Job ${job.id} ignorado: cliente sem email (clientId=${job.data.clientId})`);
      await this.prisma.auditLog.create({
        data: {
          acao: 'EMAIL_IGNORADO',
          entidade: 'email',
          entidadeId: job.data.clientId,
          contexto: { jobId: job.id, jobName: job.name, motivo: 'Cliente sem email cadastrado', clientId: job.data.clientId } as any,
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
          contexto: { jobId: job.id, jobName: job.name, destinatario: clienteEmail, assunto: subject, erro: err?.message ?? String(err), smtpHost: process.env.MAIL_HOST, smtpPort: process.env.MAIL_PORT, clientId: job.data.clientId } as any,
        },
      }).catch(() => {});
      throw err;
    }

    await Promise.all([
      this.prisma.notification.create({
        data: { clientId: job.data.clientId, loanId: job.data.loanId ?? null, tipo: 'email', assunto: subject, mensagem: `Email enviado para ${clienteEmail}`, status: 'enviado', sentAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          acao: 'EMAIL_ENVIADO',
          entidade: 'email',
          entidadeId: job.data.clientId,
          contexto: { jobId: job.id, jobName: job.name, destinatario: clienteEmail, assunto: subject, messageId, temAnexo: !!attachments, smtpHost: process.env.MAIL_HOST, smtpPort: process.env.MAIL_PORT, clientId: job.data.clientId } as any,
        },
      }),
    ]);
  }

  // ─── WhatsApp (cliente) ───────────────────────────────────────────────────

  private async processWhatsApp(job: Job<NotificationJobData>): Promise<void> {
    const { clienteNome, clienteWhatsapp, valorParcela, dataVencimento, senhaTemporaria } = job.data;

    if (!clienteWhatsapp) {
      this.logger.warn(`Job ${job.id} ignorado: cliente sem WhatsApp (clientId=${job.data.clientId})`);
      return;
    }

    const valor = valorParcela ? formatBRL(valorParcela) : '';

    let message: string;

    switch (job.name) {
      case JOB_WA_LEMBRETE_VENCIMENTO:
        message = `Olá, ${clienteNome}! 👋\nSua parcela de *${valor}* vence em *${dataVencimento ?? ''}*.\nPague com PIX pelo portal: ${PORTAL_URL}`;
        break;

      case JOB_WA_COBRANCA_ATRASO:
        message = `Olá, ${clienteNome}. Identificamos que sua parcela de *${valor}* está em atraso. Entre em contato para regularizar: ${TELEFONE_SUPORTE}`;
        break;

      case JOB_WA_CONFIRMACAO_PAGAMENTO:
        message = `✅ Pagamento confirmado!\nValor: *${valor}*\nObrigado pela pontualidade, ${clienteNome}!`;
        break;

      case JOB_WA_PORTAL_ATIVADO:
        message = `Olá, ${clienteNome}! 👋\nSeu acesso ao portal Lidera foi ativado.\n🔐 Senha temporária: *${senhaTemporaria ?? ''}*\n🌐 ${PORTAL_URL}\n⚠️ Troque sua senha no primeiro acesso.`;
        break;

      case JOB_WA_COBRANCA_ANTECIPADA:
        message = `Olá, ${clienteNome}! 💰\nSua parcela de *${valor}* vence em *${dataVencimento ?? ''}*.\nAcesse o portal para pagar via PIX:\n🌐 ${PORTAL_URL}`;
        break;

      case JOB_WA_ACEITE_CONTRATO: {
        const { linkAcesso, needsPasswordSetup, principalAmount, numeroParcelas } = job.data;
        const detalhes = principalAmount ? `\n💰 Valor: *${formatBRL(principalAmount)}*${numeroParcelas ? ` em *${numeroParcelas}x*` : ''}` : '';
        if (needsPasswordSetup) {
          message = `🎉 Olá, ${clienteNome}! Sua proposta de empréstimo foi *aprovada*!${detalhes}\n\nPara assinar o contrato, primeiro ative sua conta clicando no link enviado para o seu email.`;
        } else {
          message = `🎉 Olá, ${clienteNome}! Sua proposta de empréstimo foi *aprovada*!${detalhes}\n\n📋 Acesse o portal para revisar e assinar seu contrato:\n🌐 ${linkAcesso ?? PORTAL_URL}`;
        }
        break;
      }

      case JOB_WA_CAPITAL_LIBERADO: {
        const { principalAmount } = job.data;
        const valorLib = principalAmount ? `de *${formatBRL(principalAmount)}* ` : '';
        message = `✅ Olá, ${clienteNome}! O capital ${valorLib}do seu empréstimo foi *liberado*!\nSeu contrato está ativo. Acesse o portal para ver o cronograma de parcelas:\n🌐 ${PORTAL_URL}`;
        break;
      }

      default:
        this.logger.warn(`Job WhatsApp com name desconhecido: ${job.name}`);
        return;
    }

    await this.sendWhatsApp(clienteWhatsapp, message);

    await this.prisma.notification.create({
      data: { clientId: job.data.clientId, loanId: job.data.loanId ?? null, tipo: 'whatsapp', assunto: job.name, mensagem: message, status: 'enviado', sentAt: new Date() },
    });
  }

  // ─── Notificações internas (financeiro/consultor/admin) ───────────────────

  private async processInternal(job: Job<NotificationJobData>): Promise<void> {
    switch (job.name) {
      case JOB_INTENCAO_NOVA:
        return this.processIntencaoNova(job);
      case JOB_INTENCAO_SLA_ALERTA:
      case JOB_INTENCAO_SLA_ESCALADA:
        return this.processSlaNotification(job);
      case JOB_PROPOSTA_EXPIRANDO_CLIENTE:
        return this.processPropostaExpirando(job);
      case JOB_PROPOSTA_EXPIRADA_CONSULTOR:
        return this.processPropostaExpirada(job);
      default:
        this.logger.warn(`Job interno não tratado: ${job.name} (id=${job.id})`);
    }
  }

  private async processIntencaoNova(job: Job<NotificationJobData>): Promise<void> {
    const userId = parseInt(job.data.templateVars?.userId ?? '0');
    if (!userId) {
      this.logger.warn(`${job.name} (${job.id}): userId ausente no payload`);
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, nome: true },
    });
    if (!user?.email) {
      this.logger.warn(`${job.name} (${job.id}): usuário ${userId} sem email cadastrado`);
      return;
    }

    const intencaoId = job.data.templateVars?.intencaoId ?? '?';
    const clienteNome = job.data.clienteNome;
    const subject = `Nova intenção de empréstimo #${intencaoId} — ${clienteNome}`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
        <h2 style="color:#111827">Nova Intenção de Empréstimo</h2>
        <p>Olá, <strong>${user.nome}</strong>!</p>
        <p>Foi registrada uma nova solicitação de empréstimo para o cliente <strong>${clienteNome}</strong> que aguarda sua análise.</p>
        <p><strong>Intenção #${intencaoId}</strong></p>
        <a href="${APP_URL}/intencoes/${intencaoId}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
          Analisar agora
        </a>
        ${EMAIL_FOOTER}
      </div>`;

    await this.sendEmailInterno(user.email, subject, html, job.id, job.name, parseInt(intencaoId) || 0);
  }

  private async processSlaNotification(job: Job<NotificationJobData>): Promise<void> {
    const isEscalada = job.name === JOB_INTENCAO_SLA_ESCALADA;
    const intencaoId = job.data.templateVars?.intencaoId ?? '?';
    const clienteNome = job.data.clienteNome;

    const financeiros = await this.prisma.user.findMany({
      where: { role: { in: ['admin', 'financeiro'] }, active: true, email: { not: null } },
      select: { email: true, nome: true },
    });

    const subject = isEscalada
      ? `🚨 SLA Expirado — Intenção #${intencaoId} não analisada`
      : `⚠️ Alerta SLA — Intenção #${intencaoId} prestes a expirar`;

    const htmlBadge = isEscalada
      ? `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:12px;color:#991b1b;margin-bottom:16px">⏰ O prazo de análise desta intenção foi <strong>excedido</strong>. Ação imediata necessária.</div>`
      : `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px;color:#713f12;margin-bottom:16px">⚠️ O prazo de análise desta intenção está <strong>prestes a expirar</strong>.</div>`;

    for (const financeiro of financeiros) {
      if (!financeiro.email) continue;
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
          <h2 style="color:#111827">${isEscalada ? '🚨 SLA Expirado' : '⚠️ Alerta de SLA'}</h2>
          <p>Olá, <strong>${financeiro.nome}</strong>!</p>
          ${htmlBadge}
          <p>A intenção de empréstimo <strong>#${intencaoId}</strong> do cliente <strong>${clienteNome}</strong> requer atenção.</p>
          <a href="${APP_URL}/intencoes/${intencaoId}"
             style="display:inline-block;background:${isEscalada ? '#dc2626' : '#d97706'};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
            Ver intenção
          </a>
          ${EMAIL_FOOTER}
        </div>`;
      await this.sendEmailInterno(financeiro.email, subject, html, job.id, job.name, parseInt(intencaoId) || 0);
    }
  }

  private async processPropostaExpirando(job: Job<NotificationJobData>): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: job.data.clientId },
      select: { email: true, nome: true },
    });
    if (!client?.email) {
      this.logger.warn(`${job.name} (${job.id}): cliente ${job.data.clientId} sem email`);
      return;
    }

    const diasRestantes = job.data.templateVars?.diasRestantes ?? '?';
    const loanId = job.data.loanId ?? job.data.templateVars?.loanId;
    const subject = `⏰ Seu contrato expira em ${diasRestantes} dia(s) — Lidera`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
        <h2 style="color:#d97706">Seu contrato está prestes a expirar</h2>
        <p>Olá, <strong>${client.nome}</strong>!</p>
        <p>Você tem <strong>${diasRestantes} dia(s)</strong> para revisar e assinar seu contrato no portal.</p>
        <p>Após esse prazo, a proposta será cancelada automaticamente.</p>
        <a href="${APP_URL}/portal/contratos/${loanId ?? ''}"
           style="display:inline-block;background:#d97706;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
          Assinar agora
        </a>
        ${EMAIL_FOOTER}
      </div>`;

    let messageId: string | undefined;
    try {
      messageId = await this.sendEmail(client.email, subject, html);
    } catch (err: any) {
      await this.prisma.auditLog.create({
        data: { acao: 'EMAIL_FALHOU', entidade: 'email', entidadeId: job.data.clientId, contexto: { jobId: job.id, jobName: job.name, erro: err?.message } as any },
      }).catch(() => {});
      throw err;
    }

    await Promise.all([
      this.prisma.notification.create({
        data: { clientId: job.data.clientId, loanId: loanId ? Number(loanId) : null, tipo: 'email', assunto: subject, mensagem: `Alerta de expiração enviado para ${client.email}`, status: 'enviado', sentAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: { acao: 'EMAIL_ENVIADO', entidade: 'email', entidadeId: job.data.clientId, contexto: { jobId: job.id, jobName: job.name, destinatario: client.email, assunto: subject, messageId } as any },
      }),
    ]);
  }

  private async processPropostaExpirada(job: Job<NotificationJobData>): Promise<void> {
    const consultorId = parseInt(job.data.templateVars?.consultorId ?? '0');
    if (!consultorId) {
      this.logger.warn(`${job.name} (${job.id}): consultorId ausente`);
      return;
    }

    const consultor = await this.prisma.user.findUnique({
      where: { id: consultorId },
      select: { email: true, nome: true },
    });
    if (!consultor?.email) {
      this.logger.warn(`${job.name} (${job.id}): consultor ${consultorId} sem email`);
      return;
    }

    const loanId = job.data.templateVars?.loanId ?? '?';
    const clienteNome = job.data.clienteNome;
    const subject = `Contrato #${loanId} expirado — Cliente não assinou`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
        <h2 style="color:#dc2626">Contrato expirado</h2>
        <p>Olá, <strong>${consultor.nome}</strong>!</p>
        <p>O contrato <strong>#${loanId}</strong> do cliente <strong>${clienteNome}</strong> foi cancelado pois o cliente não assinou dentro do prazo estabelecido.</p>
        <p>Se desejar, uma nova proposta pode ser enviada.</p>
        <a href="${APP_URL}/emprestimos"
           style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
          Ver contratos
        </a>
        ${EMAIL_FOOTER}
      </div>`;

    await this.sendEmailInterno(consultor.email, subject, html, job.id, job.name, Number(loanId) || 0);
  }

  // ─── Email template ────────────────────────────────────────────────────────

  private async resolveTemplate(job: Job<NotificationJobData>): Promise<{ subject: string; html: string }> {
    const valor = job.data.valorParcela ? formatBRL(job.data.valorParcela) : '';
    const vars: Record<string, string> = {
      clienteNome:    job.data.clienteNome ?? '',
      valorParcela:   valor,
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

    const valor = valorParcela ? formatBRL(valorParcela) : '';

    switch (job.name) {
      case JOB_EMAIL_LEMBRETE:
        return {
          subject: `Lembrete: parcela de ${valor} vence em ${dataVencimento ?? ''}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px"><img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px"><h2 style="color:#111827">Lembrete de Vencimento</h2><p>Olá, <strong>${clienteNome}</strong>!</p><p>Sua parcela de <strong>${valor}</strong> vence em <strong>${dataVencimento ?? ''}</strong>.</p><a href="${PORTAL_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">Pagar agora</a>${EMAIL_FOOTER}</div>`,
        };

      case JOB_EMAIL_CONFIRMACAO:
        return {
          subject: `✅ Pagamento de ${valor} confirmado`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px"><img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px"><h2 style="color:#16a34a">Pagamento Confirmado</h2><p>Olá, <strong>${clienteNome}</strong>!</p><p>Recebemos o seu pagamento de <strong>${valor}</strong>. Obrigado pela pontualidade! 🎉</p><a href="${PORTAL_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">Ver extrato</a>${EMAIL_FOOTER}</div>`,
        };

      case JOB_EMAIL_PORTAL_ATIVADO:
        return {
          subject: isReenvio ? 'SIAFI — Nova senha de acesso ao portal' : 'SIAFI — Seu acesso ao portal foi ativado',
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px"><h2 style="color:#111827">${isReenvio ? 'Nova senha de acesso' : 'Bem-vindo ao Portal SIAFI!'}</h2><p>Olá, <strong>${clienteNome}</strong>!</p><p>${isReenvio ? 'Sua senha foi redefinida. Use a senha temporária abaixo para acessar o portal:' : 'Seu acesso foi criado. Use a senha temporária abaixo para entrar:'}</p><div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0;text-align:center"><span style="font-size:24px;font-weight:bold;letter-spacing:4px">${senhaTemporaria ?? ''}</span></div><p style="color:#ef4444;font-size:14px">⚠️ Troque sua senha imediatamente após o primeiro acesso.</p><a href="${PORTAL_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">Acessar portal</a>${EMAIL_FOOTER}</div>`,
        };

      case JOB_EMAIL_COBRANCA_ANTECIPADA:
        return {
          subject: `Lembrete: parcela de ${valor} vence em ${dataVencimento ?? ''}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px"><img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px"><h2 style="color:#1e40af">Aviso de Vencimento</h2><p>Olá, <strong>${clienteNome}</strong>!</p><p>Sua parcela de <strong>${valor}</strong> vence em <strong>${dataVencimento ?? ''}</strong>.</p><p>O boleto está em anexo neste e-mail. Você também pode pagar via PIX pelo portal:</p><a href="${PORTAL_URL}" style="display:inline-block;background:#1e40af;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">Acessar portal</a>${EMAIL_FOOTER}</div>`,
        };

      case JOB_EMAIL_LINK_ACESSO: {
        const { linkAcesso, isAtivacao } = job.data;
        const titulo    = isAtivacao ? 'Bem-vindo ao Portal SIAFI!' : 'Link de acesso ao portal';
        const subtexto  = isAtivacao
          ? 'Seu acesso foi criado. Clique no botão abaixo para definir sua senha e acessar o portal:'
          : 'Clique no botão abaixo para redefinir sua senha de acesso ao portal:';
        return {
          subject: isAtivacao ? 'SIAFI — Ative sua conta' : 'SIAFI — Link de acesso ao portal',
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
              <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
              <h2 style="color:#111827">${titulo}</h2>
              <p>Olá, <strong>${clienteNome}</strong>!</p>
              <p>${subtexto}</p>
              <div style="margin:24px 0;text-align:center">
                <a href="${linkAcesso ?? '#'}"
                   style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
                  ${isAtivacao ? 'Definir minha senha' : 'Acessar portal'}
                </a>
              </div>
              <p style="color:#6b7280;font-size:13px">Este link é válido por <strong>12 horas</strong> e pode ser usado apenas uma vez.</p>
              <p style="color:#6b7280;font-size:13px">Se você não solicitou este acesso, ignore este email.</p>
              ${EMAIL_FOOTER}
            </div>`,
        };
      }

      case JOB_EMAIL_ACEITE_CONTRATO: {
        const { linkAcesso, needsPasswordSetup, principalAmount, numeroParcelas, loanId } = job.data;
        const valorContrato = principalAmount ? formatBRL(principalAmount) : '';
        const detalhesHtml  = valorContrato
          ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:16px 0">
               <p style="margin:0;font-size:14px;color:#0369a1"><strong>Detalhes do contrato</strong></p>
               <p style="margin:4px 0 0;font-size:14px">Valor: <strong>${valorContrato}</strong>${numeroParcelas ? ` em <strong>${numeroParcelas}x</strong>` : ''}</p>
             </div>`
          : '';

        if (needsPasswordSetup) {
          return {
            subject: 'SIAFI — Proposta aprovada! Ative sua conta para assinar',
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
                <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
                <h2 style="color:#16a34a">🎉 Sua proposta foi aprovada!</h2>
                <p>Olá, <strong>${clienteNome}</strong>!</p>
                ${detalhesHtml}
                <p>Para acessar e <strong>assinar seu contrato</strong>, você precisa primeiro ativar sua conta no portal. Clique no botão abaixo:</p>
                <div style="margin:24px 0;text-align:center">
                  <a href="${linkAcesso ?? '#'}"
                     style="display:inline-block;background:#16a34a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
                    Ativar conta e assinar contrato
                  </a>
                </div>
                <p style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px;color:#713f12;font-size:14px">
                  📋 Após definir sua senha, acesse a seção <strong>Contratos</strong> no portal para revisar os termos e assinar digitalmente.
                </p>
                <p style="color:#6b7280;font-size:13px">Este link é válido por <strong>12 horas</strong> e pode ser usado apenas uma vez.</p>
                ${EMAIL_FOOTER}
              </div>`,
          };
        } else {
          return {
            subject: 'SIAFI — Seu contrato está aguardando assinatura',
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
                <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
                <h2 style="color:#16a34a">🎉 Sua proposta foi aprovada!</h2>
                <p>Olá, <strong>${clienteNome}</strong>!</p>
                ${detalhesHtml}
                <p>Seu contrato está disponível para assinatura. Acesse o portal para revisar os termos e assinar digitalmente:</p>
                <div style="margin:24px 0;text-align:center">
                  <a href="${linkAcesso ?? `${APP_URL}/portal/contratos/${loanId ?? ''}`}"
                     style="display:inline-block;background:#16a34a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
                    Assinar contrato
                  </a>
                </div>
                ${EMAIL_FOOTER}
              </div>`,
          };
        }
      }

      case JOB_EMAIL_CAPITAL_LIBERADO: {
        const { principalAmount, loanId } = job.data;
        const valorLib = principalAmount ? formatBRL(principalAmount) : '';
        return {
          subject: `SIAFI — Capital liberado! Contrato #${loanId ?? ''} está ativo`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
              <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
              <h2 style="color:#16a34a">✅ Capital liberado!</h2>
              <p>Olá, <strong>${clienteNome}</strong>!</p>
              <p>O valor de <strong>${valorLib}</strong> referente ao seu contrato <strong>#${loanId ?? ''}</strong> foi liberado e seu empréstimo está <strong>ativo</strong>.</p>
              <p>Acesse o portal para acompanhar o cronograma de parcelas:</p>
              <div style="margin:24px 0;text-align:center">
                <a href="${APP_URL}/portal/contratos/${loanId ?? ''}"
                   style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
                  Ver contrato
                </a>
              </div>
              ${EMAIL_FOOTER}
            </div>`,
        };
      }

      case JOB_INTENCAO_REJEITADA: {
        const { templateVars } = job.data;
        const motivoTipo = templateVars?.motivoTipo ?? 'análise interna';
        return {
          subject: 'SIAFI — Informação sobre sua solicitação de empréstimo',
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
              <img src="${LOGO_URL}" alt="Lidera" style="height:40px;margin-bottom:24px">
              <h2 style="color:#111827">Resultado da análise</h2>
              <p>Olá, <strong>${clienteNome}</strong>!</p>
              <p>Após análise da sua solicitação de empréstimo, infelizmente não foi possível aprovar a proposta neste momento.</p>
              <p style="color:#6b7280;font-size:14px">Motivo: ${motivoTipo}</p>
              <p>Se tiver dúvidas ou quiser mais informações, entre em contato com nossa equipe:</p>
              <a href="${PORTAL_URL}/suporte"
                 style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
                Falar com suporte
              </a>
              ${EMAIL_FOOTER}
            </div>`,
        };
      }

      default:
        return { subject: `Notificação Lidera — ${job.name}`, html: `<p>Olá, ${clienteNome}!</p>` };
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async sendEmail(to: string, subject: string, html: string, attachments?: any[]): Promise<string> {
    const host = process.env.SMTP_HOST ?? process.env.MAIL_HOST;
    const port = +(process.env.SMTP_PORT ?? process.env.MAIL_PORT ?? 587);
    const user = process.env.SMTP_USER ?? process.env.MAIL_USER;
    const pass = process.env.SMTP_PASS ?? process.env.MAIL_PASS;
    const from = process.env.SMTP_FROM ?? `"SIAFI — Lidera" <${user ?? ''}>`;

    if (!host || !user || !pass) {
      throw new Error(`SMTP não configurado — host=${host} user=${user} pass=${pass ? '***' : 'VAZIO'}`);
    }

    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    const info = await transporter.sendMail({ from, to, subject, html, attachments });
    this.logger.log(`Email enviado → ${to} | subject: ${subject} | messageId: ${info.messageId}`);
    return info.messageId as string;
  }

  // Envia email para usuário interno (financeiro/consultor/admin) e registra no auditLog.
  // Não cria registro em Notification (que é voltado para comunicações com clientes).
  private async sendEmailInterno(
    to: string,
    subject: string,
    html: string,
    jobId: string | undefined,
    jobName: string,
    entidadeId: number,
  ): Promise<void> {
    let messageId: string | undefined;
    try {
      messageId = await this.sendEmail(to, subject, html);
    } catch (err: any) {
      await this.prisma.auditLog.create({
        data: { acao: 'EMAIL_INTERNO_FALHOU', entidade: 'email', entidadeId, contexto: { jobId, jobName, destinatario: to, assunto: subject, erro: err?.message } as any },
      }).catch(() => {});
      throw err;
    }

    await this.prisma.auditLog.create({
      data: { acao: 'EMAIL_INTERNO_ENVIADO', entidade: 'email', entidadeId, contexto: { jobId, jobName, destinatario: to, assunto: subject, messageId } as any },
    }).catch(() => {});
  }

  private async sendWhatsApp(phone: string, message: string): Promise<void> {
    const apiUrl   = process.env.EVOLUTION_API_URL ?? process.env.WHATSAPP_API_URL;
    const apiKey   = process.env.EVOLUTION_API_KEY ?? process.env.WHATSAPP_API_KEY;
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
    this.logger.error(`Job ${job.name} (id=${job.id}) falhou definitivamente após ${job.attemptsMade} tentativas: ${error.message}`);

    await this.prisma.auditLog.create({
      data: {
        acao: `${job.name.toUpperCase().replace(/\./g, '_')}_FALHOU`,
        entidade: 'queue',
        contexto: { jobId: job.id, jobName: job.name, erro: error.message, clientId: job.data.clientId, tentativas: job.attemptsMade } as any,
      },
    }).catch(() => {});
  }
}
