import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

// MFA enrollment/challenge é feito no frontend via supabase-js.
// Este service expõe helpers de backend: status, listagem e remoção de fatores.
@Injectable()
export class MfaService {
  constructor(private readonly supabase: SupabaseService) {}

  async listFactors(supabaseId: string): Promise<{ factors: Array<{ id: string; factorId: string; status: string; factor_type: string }> }> {
    const { data, error } = await this.supabase.admin.auth.admin.mfa.listFactors({
      userId: supabaseId,
    });
    if (error) throw new BadRequestException('Erro ao listar fatores MFA');
    const factors = (data?.factors ?? []).map((f) => ({
      id: f.id,
      factorId: f.id,
      status: f.status,
      factor_type: f.factor_type,
    }));
    return { factors };
  }

  async deleteFactor(supabaseId: string, factorId: string): Promise<void> {
    const { error } = await this.supabase.admin.auth.admin.mfa.deleteFactor({
      userId: supabaseId,
      id: factorId,
    });
    if (error) throw new BadRequestException('Erro ao remover fator MFA');
  }

  // admin, financeiro e consultor exigem MFA imediato (sem prazo de graça)
  // DISABLE_MFA=true suspende a exigência neste ambiente (ver auth.service.ts)
  roleRequiresMfa(role: string): boolean {
    if (process.env.DISABLE_MFA === 'true') return false;
    return ['admin', 'financeiro', 'consultor'].includes(role);
  }

  // caixa e cliente têm prazo de 5 logins para configurar
  roleTemPrazoMfa(role: string): boolean {
    return ['caixa', 'cliente'].includes(role);
  }
}
