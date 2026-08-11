import { Injectable } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import type { ExecutionContext } from '@nestjs/common';

/**
 * Guard for the /auth/me endpoint.
 * Same as SupabaseAuthGuard but does NOT enforce aal2 for MFA roles.
 * This allows users with aal1 tokens (who still need to complete MFA) to
 * fetch their user profile so the frontend can show the MFA challenge screen.
 */
@Injectable()
export class MeGuard extends SupabaseAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = (this as any).extractToken(req);
    if (!token) {
      const { UnauthorizedException } = await import('@nestjs/common');
      throw new UnauthorizedException('Token não fornecido');
    }

    const { data: { user: supabaseUser }, error } =
      await (this as any).supabase.admin.auth.getUser(token);

    if (error || !supabaseUser) {
      const { UnauthorizedException } = await import('@nestjs/common');
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const aal = (this as any).extractAal(token);
    const role = (supabaseUser.app_metadata?.role as string) || '';
    const prismaId = supabaseUser.app_metadata?.prismaId as number | undefined;

    let resolvedUser: any;

    if (prismaId && role) {
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
      resolvedUser = await (this as any).resolverUsuario(
        supabaseUser.id,
        supabaseUser.email ?? '',
        aal,
      );
    }

    // ⚠️ INTENTIONALLY skip MFA enforcement here.
    // /auth/me must work with aal1 tokens so the frontend can identify the
    // user and decide whether to show the MFA challenge screen or let them in.

    req.user = resolvedUser;
    return true;
  }
}
