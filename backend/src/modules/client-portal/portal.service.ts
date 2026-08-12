import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  QUEUE_FINANCE_NOTIFICATIONS,
  JOB_WA_PORTAL_ATIVADO,
  JOB_EMAIL_LINK_ACESSO,
  JOB_EMAIL_ACEITE_CONTRATO,
  JOB_WA_ACEITE_CONTRATO,
  JOB_EMAIL_CAPITAL_LIBERADO,
  JOB_WA_CAPITAL_LIBERADO,
} from '../queue/queue.constants';
import type { RequestUser } from '../auth/guards/supabase-auth.guard';

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    @InjectQueue(QUEUE_FINANCE_NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
  ) {}

  // ─── Ativar portal ────────────────────────────────────────────────────────

  async ativarPortal(
    clientId: number,
    operador: RequestUser,
    options: { skipNotificacoes?: boolean } = {},
  ) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, active: true },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    if (operador.role === 'consultor' && client.consultorId !== operador.id) {
      throw new ForbiddenException('Cliente não pertence à sua carteira.');
    }

    if (!client.email) {
      throw new BadRequestException(
        'Cliente não possui email cadastrado. Atualize o cadastro antes de ativar o portal.',
      );
    }

    // Idempotência — já está ativo? Apenas reenvia o link.
    if (client.portalAtivo && client.supabaseId) {
      if (!options.skipNotificacoes) {
        const link = await this.gerarLinkAcesso(client.email);
        await this.enfileirarNotificacoes(client.id, client.nome, client.whatsapp, client.email, link, true);
      }
      return { sucesso: true, mensagem: `Link de acesso reenviado para ${client.email}.`, jaAtivo: true };
    }

    const senhaInterna = this.gerarSenhaTemporaria();

    // Se já tem supabaseId (portal foi desativado) → desbanir + gerar link
    if (client.supabaseId) {
      await this.supabase.admin.auth.admin.updateUserById(client.supabaseId, {
        password: senhaInterna,
        ban_duration: 'none',
        app_metadata: { role: 'cliente', clientId: client.id },
      });

      await this.prisma.client.update({
        where: { id: clientId },
        data: {
          portalAtivo: true,
          portalAtivadoEm: new Date(),
          portalAtivadoPor: operador.id,
          senhaTemporaria: false,
          primeiroAcesso: true,
        },
      });

      await this.registrarAudit(operador.id, 'PORTAL_REATIVADO', clientId, { email: client.email });

      if (!options.skipNotificacoes) {
        const link = await this.gerarLinkAcesso(client.email);
        await this.enfileirarNotificacoes(client.id, client.nome, client.whatsapp, client.email, link, true);
      }

      return { sucesso: true, mensagem: `Portal reativado. Link enviado para ${client.email}.` };
    }

    // Novo usuário no Supabase Auth
    let supabaseUserId: string | null = null;
    try {
      const { data: existingList } = await this.supabase.admin.auth.admin.listUsers();
      const users = (existingList as { users?: { id: string; email?: string }[] } | null)?.users ?? [];
      const existing = users.find(u => u.email === client.email);

      if (existing) {
        supabaseUserId = existing.id;
        await this.supabase.admin.auth.admin.updateUserById(supabaseUserId, {
          password: senhaInterna,
          ban_duration: 'none',
          app_metadata: { role: 'cliente', clientId: client.id },
          email_confirm: true,
        });
      } else {
        const { data, error } = await this.supabase.admin.auth.admin.createUser({
          email: client.email,
          password: senhaInterna,
          email_confirm: true,
          app_metadata: { role: 'cliente', clientId: client.id },
          user_metadata: { nome: client.nome },
        });
        if (error || !data.user) {
          throw new InternalServerErrorException(error?.message ?? 'Erro ao criar usuário Supabase');
        }
        supabaseUserId = data.user.id;
      }

      await this.prisma.client.update({
        where: { id: clientId },
        data: {
          supabaseId: supabaseUserId,
          portalAtivo: true,
          portalAtivadoEm: new Date(),
          portalAtivadoPor: operador.id,
          senhaTemporaria: false,
          primeiroAcesso: true,
        },
      });
    } catch (err) {
      if (supabaseUserId && !client.supabaseId) {
        await this.supabase.admin.auth.admin.deleteUser(supabaseUserId).catch(() => {});
      }
      throw err;
    }

    await this.registrarAudit(operador.id, 'PORTAL_ATIVADO', clientId, {
      email: client.email,
      ativadoPor: operador.nome,
    });

    if (!options.skipNotificacoes) {
      const link = await this.gerarLinkAcesso(client.email);
      await this.enfileirarNotificacoes(client.id, client.nome, client.whatsapp, client.email, link, true);
    }

    return { sucesso: true, mensagem: `Portal ativado. Link enviado para ${client.email}.` };
  }

  // ─── Notificar aceite de contrato ─────────────────────────────────────────
  // Ativa o portal silenciosamente e envia email/WhatsApp específicos para
  // assinatura do contrato, distinguindo primeiro acesso vs. cliente já ativo.

  async notificarAceiteContrato(clientId: number, operador: RequestUser, loanId: number): Promise<unknown> {
    // Lê estado ANTES da ativação: se já tinha conta ativa, cliente já sabe acessar o portal
    const clientAntes = await this.prisma.client.findFirst({
      where: { id: clientId },
      select: { portalAtivo: true, supabaseId: true },
    });
    const jaEraAtivo = !!(clientAntes?.portalAtivo && clientAntes.supabaseId);

    // Garante que a conta Supabase existe e o portal está ativo (sem enviar email genérico)
    const result = await this.ativarPortal(clientId, operador, { skipNotificacoes: true });

    const client = await this.prisma.client.findFirst({
      where: { id: clientId },
      select: { id: true, nome: true, email: true, whatsapp: true, supabaseId: true },
    });

    if (!client?.email) return result;

    // Portal já estava ativo → link para o login; cliente vai em Contratos após autenticar
    // Acabou de ser ativado → recovery link para definir senha antes de acessar o portal
    const needsPasswordSetup = !jaEraAtivo;
    const baseUrl = process.env.APP_URL ?? 'https://2wm.siafi.app.br';
    let link: string;
    if (jaEraAtivo) {
      link = `${baseUrl}/portal/login`;
    } else {
      link = await this.gerarLinkAcesso(client.email);
    }

    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      select: { principalAmount: true, numeroParcelas: true },
    });

    const payload = {
      clientId,
      clienteNome: client.nome,
      clienteEmail: client.email,
      clienteWhatsapp: client.whatsapp ?? undefined,
      loanId,
      linkAcesso: link,
      needsPasswordSetup: needsPasswordSetup,
      principalAmount: loan ? Number(loan.principalAmount) : undefined,
      numeroParcelas: loan?.numeroParcelas ?? undefined,
    };

    if (client.whatsapp) {
      await this.notificationsQueue.add(JOB_WA_ACEITE_CONTRATO, payload).catch(() => {});
    }
    await this.notificationsQueue.add(JOB_EMAIL_ACEITE_CONTRATO, payload).catch(() => {});

    return result;
  }

  // ─── Notificar liberação de capital ──────────────────────────────────────

  async notificarCapitalLiberado(loanId: number): Promise<void> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: { client: { select: { id: true, nome: true, email: true, whatsapp: true } } },
    });
    if (!loan?.client) return;

    const payload = {
      clientId:        loan.client.id,
      clienteNome:     loan.client.nome,
      clienteEmail:    loan.client.email ?? undefined,
      clienteWhatsapp: loan.client.whatsapp ?? undefined,
      loanId,
      principalAmount: Number(loan.principalAmount),
    };

    if (loan.client.whatsapp) {
      await this.notificationsQueue.add(JOB_WA_CAPITAL_LIBERADO, payload).catch(() => {});
    }
    if (loan.client.email) {
      await this.notificationsQueue.add(JOB_EMAIL_CAPITAL_LIBERADO, payload).catch(() => {});
    }
  }

  // ─── Desativar portal ─────────────────────────────────────────────────────

  async desativarPortal(clientId: number, operador: RequestUser, motivo: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, portalAtivo: true },
    });
    if (!client) throw new NotFoundException('Portal não está ativo.');

    if (client.supabaseId) {
      await this.supabase.admin.auth.admin.updateUserById(client.supabaseId, {
        ban_duration: '87600h',
      });
    }

    await this.prisma.client.update({
      where: { id: clientId },
      data: { portalAtivo: false },
    });

    await this.registrarAudit(operador.id, 'PORTAL_DESATIVADO', clientId, { motivo });

    return { sucesso: true };
  }

  // ─── Reativar portal ──────────────────────────────────────────────────────

  async reativarPortal(clientId: number, operador: RequestUser) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, portalAtivo: false, supabaseId: { not: null } },
    });
    if (!client) throw new NotFoundException('Portal não encontrado ou já está ativo.');

    await this.supabase.admin.auth.admin.updateUserById(client.supabaseId!, {
      ban_duration: 'none',
    });

    await this.prisma.client.update({
      where: { id: clientId },
      data: {
        portalAtivo: true,
        portalAtivadoEm: new Date(),
        portalAtivadoPor: operador.id,
      },
    });

    await this.registrarAudit(operador.id, 'PORTAL_REATIVADO', clientId, {});

    return { sucesso: true, mensagem: 'Portal reativado com sucesso.' };
  }

  // ─── Enviar link de redefinição de senha ─────────────────────────────────

  async reenviarSenha(clientId: number, operador: RequestUser) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, portalAtivo: true, active: true },
    });
    if (!client) throw new NotFoundException('Portal não está ativo para este cliente.');

    if (operador.role === 'consultor' && client.consultorId !== operador.id) {
      throw new ForbiddenException('Cliente não pertence à sua carteira.');
    }

    if (!client.email) {
      throw new BadRequestException('Cliente não possui email cadastrado.');
    }

    if (!client.supabaseId) {
      throw new BadRequestException('Cliente não possui conta Supabase vinculada.');
    }

    const link = await this.gerarLinkAcesso(client.email);

    await this.enfileirarNotificacoes(client.id, client.nome, client.whatsapp, client.email, link, false);

    await this.registrarAudit(operador.id, 'PORTAL_LINK_ENVIADO', clientId, {});

    return { sucesso: true, mensagem: `Link de redefinição de senha enviado para ${client.email}.` };
  }

  // ─── Status do portal ─────────────────────────────────────────────────────

  async getStatus(clientId: number, operador: RequestUser) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, active: true },
      select: {
        id: true,
        email: true,
        portalAtivo: true,
        portalAtivadoEm: true,
        portalAtivadoPor: true,
        ultimoAcessoPortal: true,
        mfaEnabled: true,
        mfaLoginCount: true,
        senhaTemporaria: true,
        primeiroAcesso: true,
        supabaseId: true,
        consultorId: true,
      },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    if (operador.role === 'consultor' && client.consultorId !== operador.id) {
      throw new ForbiddenException('Cliente não pertence à sua carteira.');
    }

    return {
      temEmail: !!client.email,
      portalAtivo: client.portalAtivo,
      portalAtivadoEm: client.portalAtivadoEm,
      ultimoAcessoPortal: client.ultimoAcessoPortal,
      mfaEnabled: client.mfaEnabled,
      mfaLoginsRestantes: Math.max(0, 5 - client.mfaLoginCount),
      senhaTemporaria: client.senhaTemporaria,
      primeiroAcesso: client.primeiroAcesso,
      temContaSupabase: !!client.supabaseId,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private gerarSenhaTemporaria(): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%&*';
    const all = upper + lower + digits + special;
    const bytes = crypto.randomBytes(12);
    let senha = '';
    senha += upper[bytes[0] % upper.length];
    senha += lower[bytes[1] % lower.length];
    senha += digits[bytes[2] % digits.length];
    senha += special[bytes[3] % special.length];
    for (let i = 4; i < 12; i++) {
      senha += all[bytes[i] % all.length];
    }
    const arr = senha.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
  }

  private async registrarAudit(
    userId: number,
    acao: string,
    clientId: number,
    dados: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        acao,
        entidade: 'clients',
        entidadeId: clientId,
        dados: dados as any,
      },
    }).catch(() => {});
  }

  private async gerarLinkAcesso(email: string): Promise<string> {
    const redirectTo = `${process.env.APP_URL ?? 'https://2wm.siafi.app.br'}/redefinir-senha`;
    const { data, error } = await this.supabase.admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });
    if (error || !data?.properties?.action_link) {
      throw new InternalServerErrorException(
        `Erro ao gerar link de acesso: ${error?.message ?? 'resposta vazia'}`,
      );
    }
    return data.properties.action_link as string;
  }

  private async enfileirarNotificacoes(
    clientId: number,
    nome: string,
    whatsapp: string | null,
    email: string | null,
    link: string,
    isAtivacao: boolean,
  ) {
    const basePayload = { clientId, clienteNome: nome, clienteWhatsapp: whatsapp ?? undefined, clienteEmail: email ?? undefined };
    if (whatsapp) {
      await this.notificationsQueue.add(JOB_WA_PORTAL_ATIVADO, basePayload).catch(() => {});
    }
    if (email) {
      await this.notificationsQueue.add(JOB_EMAIL_LINK_ACESSO, {
        ...basePayload,
        linkAcesso: link,
        isAtivacao,
      }).catch(() => {});
    }
  }
}
