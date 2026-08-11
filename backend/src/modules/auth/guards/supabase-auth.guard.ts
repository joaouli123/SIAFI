import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SupabaseService } from '../../../supabase/supabase.service';

export interface RequestUser {
  id: number;
  supabaseId: string;
  username: string;
  nome: string;
  role: string;
  tipo: 'operador' | 'cliente';
  aal?: string;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Token não fornecido');

    const { data: { user: supabaseUser }, error } =
      await this.supabase.admin.auth.getUser(token);

    if (error || !supabaseUser) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const aal = this.extractAal(token);
    const role = (supabaseUser.app_metadata?.role as string) || '';
    const prismaId = supabaseUser.app_metadata?.prismaId as number | undefined;

    let resolvedUser: RequestUser;

    if (prismaId && role) {
      // Fast path: todos os dados no JWT, sem consulta ao banco
      resolvedUser = {
        id: prismaId,
        supabaseId: supabaseUser.id,
        username: (supabaseUser.user_metadata?.username as string) || '',
        nome: (supabaseUser.user_metadata?.nome as string) || '',
        role,
        tipo: role === 'cliente' ? 'cliente' : 'operador',
        aal,
      };
    } else {
      // Fallback: lookup duplo — users → clients
      resolvedUser = await this.resolverUsuario(supabaseUser.id, supabaseUser.email ?? '', aal);
    }

    // Verificar MFA — admin, financeiro e consultor exigem aal2
    // DISABLE_MFA=true suspende a exigência neste ambiente (ver auth.service.ts)
    const mfaObrigatorio =
      process.env.DISABLE_MFA !== 'true' &&
      ['admin', 'financeiro', 'consultor'].includes(resolvedUser.role);
    if (mfaObrigatorio && aal !== 'aal2') {
      const fatoresVerificados = supabaseUser.factors?.some(
        (f: { status: string }) => f.status === 'verified',
      ) ?? false;

      if (fatoresVerificados) {
        // MFA configurado mas não completado nesta sessão
        throw new UnauthorizedException('MFA obrigatório — complete o desafio TOTP');
      }
      // MFA ainda não configurado — o frontend deve redirecionar para /mfa-setup
      // Não bloqueamos aqui para permitir o redirecionamento
    }

    req.user = resolvedUser;
    return true;
  }

  // ─── Resolução dupla: users → clients ────────────────────────────────────

  private async resolverUsuario(
    supabaseId: string,
    supabaseEmail: string,
    aal: string,
  ): Promise<RequestUser> {
    // 1. Buscar em users por supabaseId
    const operador = await this.prisma.user.findFirst({
      where: { supabaseId, active: true },
      select: { id: true, username: true, nome: true, role: true },
    });

    if (operador) {
      return {
        id: operador.id,
        supabaseId,
        username: operador.username,
        nome: operador.nome,
        role: operador.role,
        tipo: 'operador',
        aal,
      };
    }

    // 2. Fallback por email (Google OAuth — supabaseId ainda não vinculado)
    if (supabaseEmail) {
      const operadorPorEmail = await this.prisma.user.findFirst({
        where: { email: supabaseEmail, active: true },
        select: { id: true, username: true, nome: true, role: true, supabaseId: true },
      });

      if (operadorPorEmail) {
        // Sincronizar supabaseId se ainda não vinculado
        if (!operadorPorEmail.supabaseId) {
          await this.prisma.user.update({
            where: { id: operadorPorEmail.id },
            data: { supabaseId },
          });
          await this.supabase.admin.auth.admin.updateUserById(supabaseId, {
            app_metadata: { role: operadorPorEmail.role, prismaId: operadorPorEmail.id },
          });
        }
        return {
          id: operadorPorEmail.id,
          supabaseId,
          username: operadorPorEmail.username,
          nome: operadorPorEmail.nome,
          role: operadorPorEmail.role,
          tipo: 'operador',
          aal,
        };
      }
    }

    // 3. Buscar em clients por supabaseId (portal ativo)
    const cliente = await this.prisma.client.findFirst({
      where: { supabaseId, active: true, portalAtivo: true },
      select: { id: true, nome: true, email: true, supabaseId: true },
    });

    if (cliente) {
      return {
        id: cliente.id,
        supabaseId,
        username: '',
        nome: cliente.nome,
        role: 'cliente',
        tipo: 'cliente',
        aal,
      };
    }

    // 4. Fallback por email em clients (Google OAuth de clientes)
    if (supabaseEmail) {
      const clientePorEmail = await this.prisma.client.findFirst({
        where: { email: supabaseEmail, active: true, portalAtivo: true },
        select: { id: true, nome: true, supabaseId: true },
      });

      if (clientePorEmail) {
        if (!clientePorEmail.supabaseId) {
          await this.prisma.client.update({
            where: { id: clientePorEmail.id },
            data: { supabaseId },
          });
        }
        return {
          id: clientePorEmail.id,
          supabaseId,
          username: '',
          nome: clientePorEmail.nome,
          role: 'cliente',
          tipo: 'cliente',
          aal,
        };
      }
    }

    // 5. Conta não reconhecida — registrar tentativa e negar acesso
    await this.prisma.auditLog.create({
      data: {
        acao: 'ACESSO_NEGADO_DESCONHECIDO',
        dados: { supabaseId, email: supabaseEmail },
      },
    }).catch(() => {}); // AuditLog é best-effort — não bloquear o fluxo

    throw new ForbiddenException(
      'Conta não autorizada. Acesso restrito a usuários cadastrados.',
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private extractToken(req: { headers?: { authorization?: string } }): string | null {
    const auth = req.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }

  private extractAal(token: string): string {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      );
      return (payload.aal as string) || 'aal1';
    } catch {
      return 'aal1';
    }
  }
}
