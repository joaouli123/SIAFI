import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import type { Response } from 'express';

export interface AuthenticatedUser {
  id: number;
  username: string;
  nome: string;
  role: string;
}

export interface CreateOperatorDto {
  nome: string;
  username: string;
  email?: string;
  password: string;
  role: UserRole;
}

export interface MfaStatus {
  required: boolean;
  prazoExpirado: boolean;
  loginsRestantes: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  // ─── Login principal (username OU email) ──────────────────────────────────

  async loginComEmailOuCpf(
    identificador: string,
    password: string,
    res: Response,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    user: { id: number; nome: string; role: string };
    needsMfa?: boolean;
    setupMfaRequired?: boolean;
    mfaStatus?: MfaStatus;
  }> {
    // 1. Buscar em users por username OU email
    const dbUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: identificador }, { email: identificador }],
        active: true,
      },
    });

    // Fallback: verificar se é cliente do portal
    if (!dbUser) {
      return this.loginAsCliente(identificador, password, res);
    }

    // 2. Verificar bloqueio por tentativas excessivas
    if (dbUser.lockedUntil && dbUser.lockedUntil > new Date()) {
      throw new UnauthorizedException('Conta temporariamente bloqueada. Tente novamente mais tarde.');
    }

    // 3. Validar senha bcrypt
    const isMatch = await bcrypt.compare(password, dbUser.password);
    if (!isMatch) {
      await this.registrarFalhaLogin(dbUser.id);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // 4. Resetar contador de falhas após login bem-sucedido
    if (dbUser.failedLoginAttempts > 0) {
      await this.prisma.user.update({
        where: { id: dbUser.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
    } else {
      await this.prisma.user.update({
        where: { id: dbUser.id },
        data: { lastLoginAt: new Date() },
      });
    }

    const email = this.toSupabaseEmail(dbUser.username);

    // 5. Auto-sync para Supabase Auth se ainda não sincronizado
    if (!dbUser.supabaseId) {
      await this.syncToSupabase(
        { id: dbUser.id, username: dbUser.username, nome: dbUser.nome, role: dbUser.role },
        password,
        email,
      );
    }

    // 6. Autenticar via Supabase
    let { data, error } = await this.supabase.admin.auth.signInWithPassword({ email, password });

    // A senha já passou no bcrypt local (passo 3): se o Supabase recusa, é o
    // lado dele que está dessincronizado — conta com e-mail antigo após rename
    // de username, senha trocada direto no banco, ou supabaseId apontando para
    // uma conta removida. Nesses casos trocar a senha na tela nunca resolvia,
    // porque atualizava a conta vinculada e não a que o login procura.
    // Ressincroniza pelo e-mail atual e tenta uma única vez mais.
    if (error || !data.session) {
      await this.syncToSupabase(
        { id: dbUser.id, username: dbUser.username, nome: dbUser.nome, role: dbUser.role },
        password,
        email,
      );
      ({ data, error } = await this.supabase.admin.auth.signInWithPassword({ email, password }));
    }

    if (error || !data.session) {
      throw new UnauthorizedException('Falha na autenticação Supabase');
    }

    const { access_token, refresh_token } = data.session;

    // 7. Gravar refresh token em httpOnly cookie
    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    // 8. Verificar estado do MFA
    const aal = this.extractAal(access_token);
    const fatoresVerificados = data.session.user?.factors?.some(
      (f: { status: string }) => f.status === 'verified',
    ) ?? false;

    // Roles que exigem MFA imediato (sem prazo de graça)
    // DISABLE_MFA=true suspende a exigência de MFA neste ambiente (ex: banco de
    // testes) sem afetar produção, onde essa env var não é definida.
    const mfaDesativado = process.env.DISABLE_MFA === 'true';
    const mfaImediato = !mfaDesativado && ['admin', 'financeiro', 'consultor'].includes(dbUser.role);

    // MFA configurado mas ainda em aal1 → precisa do challenge
    const needsMfa = !mfaDesativado && fatoresVerificados && aal !== 'aal2';

    // Role exige MFA mas usuário ainda não configurou
    const setupMfaRequired = mfaImediato && !fatoresVerificados;

    // 9. Verificar prazo de graça de MFA (caixa)
    const mfaStatus = await this.verificarPrazoMfa(dbUser.id, dbUser.role, 'user');

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      user: { id: dbUser.id, nome: dbUser.nome, role: dbUser.role },
      ...(needsMfa ? { needsMfa: true } : {}),
      ...(setupMfaRequired ? { setupMfaRequired: true } : {}),
      ...(mfaStatus ? { mfaStatus } : {}),
    };
  }

  // ─── Validação de token Google OAuth ──────────────────────────────────────
  // Chamado pelo endpoint POST /api/auth/validate-google logo após o callback.
  // Garante que apenas emails pré-cadastrados em users ou clients têm acesso.
  // Se não autorizado: deleta a conta do Supabase ANTES de lançar 403.

  async validateGoogleOAuth(
    email: string,
    supabaseUserId: string,
    ip?: string,
  ): Promise<{ tipo: 'operador' | 'cliente'; role: string; prismaId: number }> {

    // 1. Verificar em users (operadores)
    const operador = await this.prisma.user.findFirst({
      where: { email, active: true },
      select: { id: true, role: true, supabaseId: true },
    });

    if (operador) {
      // supabaseId já vinculado a outro token — possível conta duplicada/suspeita
      if (operador.supabaseId && operador.supabaseId !== supabaseUserId) {
        await this.revogarEAuditar(supabaseUserId, email, 'GOOGLE_SUPABASE_ID_MISMATCH', ip);
        throw new ForbiddenException('Acesso não autorizado.');
      }

      // Primeiro login com Google — vincular supabaseId
      if (!operador.supabaseId) {
        await this.prisma.user.update({
          where: { id: operador.id },
          data: { supabaseId: supabaseUserId },
        });
        await this.supabase.admin.auth.admin.updateUserById(supabaseUserId, {
          app_metadata: { role: operador.role, prismaId: operador.id, tipo: 'operador' },
        });
      }

      return { tipo: 'operador', role: operador.role, prismaId: operador.id };
    }

    // 2. Verificar em clients (portal ativo)
    const cliente = await this.prisma.client.findFirst({
      where: { email, active: true, portalAtivo: true },
      select: { id: true, supabaseId: true },
    });

    if (cliente) {
      if (cliente.supabaseId && cliente.supabaseId !== supabaseUserId) {
        await this.revogarEAuditar(supabaseUserId, email, 'GOOGLE_SUPABASE_ID_MISMATCH_CLIENT', ip);
        throw new ForbiddenException('Acesso não autorizado.');
      }

      if (!cliente.supabaseId) {
        await this.prisma.client.update({
          where: { id: cliente.id },
          data: { supabaseId: supabaseUserId },
        });
        await this.supabase.admin.auth.admin.updateUserById(supabaseUserId, {
          app_metadata: { role: 'cliente', clientId: cliente.id, tipo: 'cliente' },
        });
      }

      return { tipo: 'cliente', role: 'cliente', prismaId: cliente.id };
    }

    // 3. Email não cadastrado nem em users nem em clients — deletar e negar
    await this.revogarEAuditar(supabaseUserId, email, 'GOOGLE_EMAIL_NAO_CADASTRADO', ip);
    throw new ForbiddenException(
      'Acesso não autorizado. Esta conta Google não está cadastrada no sistema.',
    );
  }

  // Deleta a conta do Supabase Auth e registra no AuditLog.
  // deleteUser SEMPRE antes de lançar exception — nunca deixar conta órfã.
  private async revogarEAuditar(
    supabaseUserId: string,
    email: string,
    motivo: string,
    ip?: string,
  ): Promise<void> {
    try {
      await this.supabase.admin.auth.admin.deleteUser(supabaseUserId);
    } catch (err) {
      console.error(`[Auth] Falha ao deletar conta Supabase ${supabaseUserId}:`, err);
    }

    await this.prisma.auditLog.create({
      data: {
        acao: motivo,
        entidade: 'auth',
        dados: { email, supabaseUserId, timestamp: new Date().toISOString() },
        ip: ip ?? null,
      },
    }).catch(() => {});
  }

  // ─── Verificar prazo de graça do MFA ──────────────────────────────────────

  async verificarPrazoMfa(
    userId: number,
    role: string,
    tipo: 'user' | 'client',
  ): Promise<MfaStatus | null> {
    // admin, financeiro, consultor: MFA obrigatório — sem prazo de graça
    if (['admin', 'financeiro', 'consultor'].includes(role)) {
      return { required: true, prazoExpirado: true, loginsRestantes: 0 };
    }

    // caixa, cliente: prazo de 5 logins para configurar
    if (['caixa', 'cliente'].includes(role)) {
      let mfaEnabled: boolean;
      let mfaLoginCount: number;

      if (tipo === 'user') {
        const u = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { mfaEnabled: true, mfaLoginCount: true },
        });
        mfaEnabled = u?.mfaEnabled ?? false;
        mfaLoginCount = u?.mfaLoginCount ?? 0;

        if (!mfaEnabled) {
          await this.prisma.user.update({
            where: { id: userId },
            data: { mfaLoginCount: { increment: 1 } },
          });
        }
      } else {
        const c = await this.prisma.client.findUnique({
          where: { id: userId },
          select: { mfaEnabled: true, mfaLoginCount: true },
        });
        mfaEnabled = c?.mfaEnabled ?? false;
        mfaLoginCount = c?.mfaLoginCount ?? 0;

        if (!mfaEnabled) {
          await this.prisma.client.update({
            where: { id: userId },
            data: { mfaLoginCount: { increment: 1 } },
          });
        }
      }

      // Já configurado — sem status de graça
      if (mfaEnabled) return null;

      const loginsRestantes = Math.max(0, 5 - mfaLoginCount);
      return {
        required: loginsRestantes <= 0,
        prazoExpirado: loginsRestantes <= 0,
        loginsRestantes,
      };
    }

    return null;
  }

  // ─── Login de cliente do portal ──────────────────────────────────────────

  private async loginAsCliente(
    email: string,
    password: string,
    res: Response,
  ) {
    const client = await this.prisma.client.findFirst({
      where: { email, active: true, portalAtivo: true },
    });
    if (!client) throw new UnauthorizedException('Credenciais inválidas');

    const { data, error } = await this.supabase.admin.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const { access_token, refresh_token } = data.session;

    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    await this.prisma.client.update({
      where: { id: client.id },
      data: { ultimoAcessoPortal: new Date() },
    }).catch(() => {});

    const aal = this.extractAal(access_token);
    const fatoresVerificados = data.session.user?.factors?.some(
      (f: { status: string }) => f.status === 'verified',
    ) ?? false;
    const needsMfa = process.env.DISABLE_MFA !== 'true' && fatoresVerificados && aal !== 'aal2';
    const mfaStatus = await this.verificarPrazoMfa(client.id, 'cliente', 'client');

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      user: { id: client.id, nome: client.nome, role: 'cliente' },
      ...(needsMfa ? { needsMfa: true } : {}),
      ...(mfaStatus ? { mfaStatus } : {}),
    };
  }

  // ─── validateUser (compatibilidade com LocalStrategy / Passport) ─────────

  async validateUser(username: string, password: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, { email: username }],
        active: true,
      },
    });
    if (!user) return null;
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;
    const { password: _pw, ...result } = user;
    return result as unknown as AuthenticatedUser;
  }

  // ─── Refresh ──────────────────────────────────────────────────────────────

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const { data, error } = await this.supabase.admin.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  // ─── MFA Challenge + Verify (server-side proxy) ───────────────────────────

  async mfaVerify(
    userAccessToken: string,
    factorId: string,
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    // The apikey header accepts either anon key or service role key
    const API_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Step 1: create challenge (requires user's aal1 token as Authorization)
    const challengeRes = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/challenge`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
        apikey: API_KEY,
        'Content-Type': 'application/json',
      },
    });
    if (!challengeRes.ok) {
      const err = await challengeRes.json().catch(() => ({}));
      throw new UnauthorizedException(err.error_description ?? 'Falha ao criar desafio MFA');
    }
    const { id: challengeId } = await challengeRes.json();

    // Step 2: verify code — returns a new aal2 session
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
        apikey: API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ challenge_id: challengeId, code }),
    });
    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      throw new UnauthorizedException(err.error_description ?? err.message ?? 'Código MFA inválido');
    }
    const session = await verifyRes.json();
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
  }


  // ─── Logout ───────────────────────────────────────────────────────────────

  /** Revoga a sessão Supabase do JWT informado (admin.signOut espera o JWT, não o user id). */
  async logout(jwt: string): Promise<void> {
    try {
      await this.supabase.admin.auth.admin.signOut(jwt, 'local');
    } catch {
      // Best-effort — client removes cookie regardless
    }
  }

  // ─── Create Operator ──────────────────────────────────────────────────────

  async createOperator(dto: CreateOperatorDto): Promise<{
    id: number;
    username: string;
    nome: string;
    role: UserRole;
  }> {
    const email = this.toSupabaseEmail(dto.username);

    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException('Username já está em uso');

    if (dto.email) {
      const emailExisting = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExisting) throw new ConflictException('E-mail já está em uso');
    }

    // Criar no Supabase Auth
    const { data: authData, error } = await this.supabase.admin.auth.admin.createUser({
      email,
      password: dto.password,
      email_confirm: true,
      app_metadata: { role: dto.role },
      user_metadata: { nome: dto.nome, username: dto.username },
    });

    if (error) {
      throw new InternalServerErrorException(`Erro Supabase: ${error.message}`);
    }

    const supabaseId = authData.user.id;

    const hashedPw = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        nome: dto.nome,
        username: dto.username,
        email: dto.email ?? null,
        password: hashedPw,
        role: dto.role,
        supabaseId,
      },
    });

    // Atualizar app_metadata com prismaId para lookup rápido no guard
    await this.supabase.admin.auth.admin.updateUserById(supabaseId, {
      app_metadata: { role: dto.role, prismaId: user.id },
    });

    return { id: user.id, username: user.username, nome: user.nome, role: user.role };
  }

  // ─── Sync Role ────────────────────────────────────────────────────────────

  async syncRole(supabaseId: string, role: UserRole): Promise<void> {
    await this.supabase.admin.auth.admin.updateUserById(supabaseId, {
      app_metadata: { role },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Sincroniza a senha em public.users após troca via link de recuperação
   * (a tela /redefinir-senha atualiza o Supabase; aqui gravamos o bcrypt local
   * que loginComEmailOuCpf valida antes do Supabase). Zera bloqueio por falhas.
   */
  async sincronizarSenhaLocal(userId: number, novaSenha: string): Promise<void> {
    const hashed = await bcrypt.hash(novaSenha, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  /**
   * Redefine a senha de um operador a partir da sessão de recovery (aal1).
   * A troca via cliente Supabase (`updateUser`) exige aal2 quando a conta tem
   * MFA verificado — o link de recuperação nunca chega em aal2, então a
   * operação é feita server-side com a chave admin e o hash local é
   * sincronizado. Sessões antigas são derrubadas.
   */
  async redefinirSenhaOperador(userId: number, supabaseId: string, novaSenha: string, jwt?: string): Promise<void> {
    if (!supabaseId) throw new UnauthorizedException('Sessão inválida');
    const { error } = await this.supabase.admin.auth.admin.updateUserById(supabaseId, { password: novaSenha });
    if (error) throw new InternalServerErrorException(`Falha ao atualizar a senha: ${error.message}`);
    await this.sincronizarSenhaLocal(userId, novaSenha);
    // Encerra todas as sessões do usuário (inclusive a de recovery) — o próximo
    // acesso exige a nova senha e o MFA normalmente.
    if (jwt) await this.supabase.admin.auth.admin.signOut(jwt, 'global').catch(() => {});
  }

  // ─── Esqueci minha senha ─────────────────────────────────────────────────

  /**
   * Fluxo público de recuperação de senha. Aceita username OU e-mail de
   * contato do operador. Sempre resolve sem erro (não revela se a conta existe).
   * Gera link de recovery no Supabase para `${username}@siafi.local` e envia
   * ao e-mail de contato cadastrado (User.email); sem e-mail cadastrado, o
   * pedido é ignorado silenciosamente e auditado para o admin.
   */
  async solicitarRecuperacaoSenha(identificador: string): Promise<void> {
    const ident = (identificador ?? '').trim();
    if (!ident) return;

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: ident }, { email: ident }], active: true },
    });
    if (!user) return;

    // Destino: e-mail de contato real. O e-mail interno *@siafi.local nunca
    // é entregável — só serve de identidade no Supabase.
    const destino = user.email && !user.email.endsWith('@siafi.local') ? user.email : null;
    if (!destino) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          acao: 'PASSWORD_RECOVERY_SEM_EMAIL',
          entidade: 'User',
          entidadeId: user.id,
          dados: { username: user.username, motivo: 'operador sem e-mail de contato cadastrado' } as any,
        },
      }).catch(() => {});
      return;
    }

    const supabaseEmail = this.toSupabaseEmail(user.username);
    if (!user.supabaseId) {
      // Conta ainda não sincronizada no Supabase (nunca logou): sem link possível
      return;
    }

    const appUrl = process.env.APP_URL ?? 'https://2wm.siafi.app.br';
    const { data, error } = await this.supabase.admin.auth.admin.generateLink({
      type: 'recovery',
      email: supabaseEmail,
      options: { redirectTo: `${appUrl}/redefinir-senha` },
    });
    if (error || !data?.properties?.action_link) return;
    const link = data.properties.action_link as string;

    await this.enviarEmailRecuperacao(destino, user.nome, user.username, link, appUrl);
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        acao: 'PASSWORD_RECOVERY_SOLICITADA',
        entidade: 'User',
        entidadeId: user.id,
        dados: { username: user.username, destino } as any,
      },
    }).catch(() => {});
  }

  private async enviarEmailRecuperacao(
    to: string, nome: string, username: string, link: string, appUrl: string,
  ): Promise<void> {
    const host = process.env.SMTP_HOST ?? process.env.MAIL_HOST;
    const port = +(process.env.SMTP_PORT ?? process.env.MAIL_PORT ?? 587);
    const user = process.env.SMTP_USER ?? process.env.MAIL_USER;
    const pass = process.env.SMTP_PASS ?? process.env.MAIL_PASS;
    const from = process.env.SMTP_FROM ?? `"SIAFI" <${user ?? ''}>`;
    if (!host || !user || !pass) throw new InternalServerErrorException('SMTP não configurado');

    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    await transporter.sendMail({
      from, to,
      subject: 'SIAFI — redefinição de senha',
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <img src="${appUrl}/logo.png" alt="SIAFI" style="height:40px;margin-bottom:24px">
        <h2 style="color:#1d4ed8;margin:0 0 12px">Redefinição de senha</h2>
        <p>Olá, <strong>${nome}</strong>. Recebemos um pedido para redefinir a senha do usuário <code>${username}</code>.</p>
        <p style="margin:24px 0"><a href="${link}" style="background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Redefinir minha senha</a></p>
        <p style="font-size:12px;color:#777">O link expira em 1 hora e só pode ser usado uma vez. Se você não pediu isso, ignore este e-mail — sua senha atual continua válida.</p>
        <p style="font-size:12px;color:#777">Se o botão não funcionar, copie e cole no navegador:<br><span style="word-break:break-all">${link}</span></p>
      </div>`,
    });
  }

  // listUsers() devolve só a primeira página (50 contas por padrão). Com o
  // portal do cliente ativo isso passa do limite e contas existentes deixam de
  // ser encontradas, gerando duplicata ou erro de e-mail já cadastrado.
  private async buscarContaPorEmail(
    email: string,
  ): Promise<{ id: string; email?: string } | undefined> {
    const alvo = email.toLowerCase();
    for (let page = 1; page <= 40; page++) {
      const { data } = await this.supabase.admin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      const users = (data as { users?: { id: string; email?: string }[] } | null)?.users ?? [];
      const achou = users.find((u) => (u.email ?? '').toLowerCase() === alvo);
      if (achou) return achou;
      if (users.length < 200) return undefined;
    }
    return undefined;
  }

  toSupabaseEmail(username: string): string {
    // O Supabase grava e-mail sempre em minúsculas. Montar o endereço com o
    // username cru fazia toda comparação por e-mail falhar para quem tem
    // maiúscula no nome (ex.: Bruno.Teste), quebrando o login e a sincronização.
    return `${username.toLowerCase()}@siafi.local`;
  }

  extractAal(token: string): string {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      return (payload.aal as string) || 'aal1';
    } catch {
      return 'aal1';
    }
  }

  private async registrarFalhaLogin(userId: number): Promise<void> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true },
    });
    const novasFilhas = (u?.failedLoginAttempts ?? 0) + 1;
    // Bloquear por 15 minutos após 5 tentativas
    const lockedUntil = novasFilhas >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: novasFilhas, lockedUntil },
    });
  }

  private async syncToSupabase(
    user: AuthenticatedUser,
    rawPassword: string,
    email: string,
  ): Promise<void> {
    const existing = await this.buscarContaPorEmail(email);

    let supabaseId: string;

    if (existing) {
      supabaseId = existing.id;
      await this.supabase.admin.auth.admin.updateUserById(supabaseId, {
        password: rawPassword,
        app_metadata: { role: user.role, prismaId: user.id },
        user_metadata: { nome: user.nome, username: user.username },
      });
    } else {
      const { data, error } = await this.supabase.admin.auth.admin.createUser({
        email,
        password: rawPassword,
        email_confirm: true,
        app_metadata: { role: user.role, prismaId: user.id },
        user_metadata: { nome: user.nome, username: user.username },
      });
      if (error || !data.user) {
        throw new InternalServerErrorException(`Sync Supabase falhou: ${error?.message}`);
      }
      supabaseId = data.user.id;
    }

    // supabaseId é único: se outra linha ainda aponta para esta conta, o vínculo
    // dela está obsoleto — o e-mail deriva do username, que é único, então a
    // conta só pode pertencer a quem tem o username correspondente.
    const vinculoAntigo = await this.prisma.user.findFirst({
      where: { supabaseId, id: { not: user.id } },
      select: { id: true },
    });
    if (vinculoAntigo) {
      await this.prisma.user.update({
        where: { id: vinculoAntigo.id },
        data: { supabaseId: null },
      });
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { supabaseId } });
  }
}
