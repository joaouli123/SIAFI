import {
  Controller,
  Post,
  Get,
  Delete,
  Req,
  Res,
  Body,
  Param,
  Ip,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MeGuard } from './guards/me.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { ValidateGoogleDto } from './dto/validate-google.dto';

interface CurrentUserPayload {
  id: number;
  supabaseId: string;
  username: string;
  role: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * POST /api/auth/login
   * Aceita username, e-mail ou CPF como identificador.
   * Autentica localmente (bcrypt) + via Supabase Auth.
   * Retorna Supabase access_token + seta refresh_token como httpOnly cookie.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.loginComEmailOuCpf(body.identificador, body.password, res);
  }

  /**
   * POST /api/auth/validate-google
   * Chamado pelo callback OAuth logo após exchangeCodeForSession.
   * Verifica se o email está pré-cadastrado; se não, deleta a conta do Supabase e retorna 403.
   * Não usa JwtAuthGuard — a sessão ainda não existe quando este endpoint é chamado.
   */
  @Post('validate-google')
  @HttpCode(HttpStatus.OK)
  async validateGoogle(@Body() dto: ValidateGoogleDto, @Ip() ip: string) {
    return this.authService.validateGoogleOAuth(dto.email, dto.supabaseUserId, ip);
  }

  /**
   * POST /api/auth/refresh
   * Renova a sessão via Supabase usando o httpOnly cookie.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Body() body: { refreshToken?: string }) {
    const cookies = req.cookies as Record<string, string>;
    const refreshToken = body?.refreshToken || cookies['refresh_token'];
    if (!refreshToken) throw new UnauthorizedException('Refresh token ausente');
    return this.authService.refresh(refreshToken);
  }

  /**
   * POST /api/auth/logout
   * Revoga a sessão Supabase e limpa o cookie.
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.authService.logout(user.supabaseId);
    res.clearCookie('refresh_token', {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    });
    return { message: 'Sessão encerrada com sucesso' };
  }

  /**
   * GET /api/auth/me
   * Retorna dados do usuário autenticado.
   */
  @UseGuards(MeGuard)
  @Get('me')
  async me(@CurrentUser() user: CurrentUserPayload) {
    const full = await this.usersService.findById(user.id);
    if (!full) throw new NotFoundException('Usuário não encontrado');
    const aal = (user as any).aal ?? 'aal1';
    const mfaRoles = ['admin', 'financeiro', 'consultor'];
    // needsMfa = role requires MFA but session is still aal1
    // DISABLE_MFA=true suspende a exigência neste ambiente (ver auth.service.ts)
    const needsMfa = process.env.DISABLE_MFA !== 'true' && mfaRoles.includes(full.role) && aal !== 'aal2';
    return { id: full.id, username: full.username, nome: full.nome, role: full.role, aal, needsMfa };
  }

  /**
   * POST /api/auth/redefinir-senha
   * Após o usuário trocar a senha no Supabase (link de recuperação), sincroniza
   * o hash bcrypt em public.users — o login de operadores valida primeiro esse
   * hash e só depois o Supabase; sem a sincronia a nova senha não funcionaria.
   * MeGuard: aceita token aal1 (a sessão de recovery não passa pelo MFA).
   */
  @UseGuards(MeGuard)
  @Post('redefinir-senha')
  @HttpCode(HttpStatus.OK)
  async redefinirSenha(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { novaSenha?: string },
  ) {
    if (!body?.novaSenha || body.novaSenha.length < 8) {
      throw new BadRequestException('Senha inválida');
    }
    await this.authService.sincronizarSenhaLocal(user.id, body.novaSenha);
    return { message: 'Senha sincronizada' };
  }

  // ─── MFA ─────────────────────────────────────────────────────────────────

  /**
   * GET /api/auth/mfa/factors
   * Lista os fatores MFA do usuário autenticado.
   */
  @UseGuards(MeGuard)
  @Get('mfa/factors')
  async mfaFactors(@CurrentUser() user: CurrentUserPayload) {
    return this.mfaService.listFactors(user.supabaseId);
  }

  /**
   * POST /api/auth/mfa/verify
   * Proxies Supabase MFA challenge + verify server-side.
   * Uses MeGuard so aal1 tokens are accepted.
   * Returns aal2 accessToken + refreshToken on success.
   */
  @UseGuards(MeGuard)
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async mfaVerify(
    @Req() req: Request & { user: any },
    @Body() body: { factorId: string; code: string },
  ) {
    const authHeader = (req as any).headers?.authorization as string | undefined;
    const userToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!userToken) throw new UnauthorizedException('Token não fornecido');
    return this.authService.mfaVerify(userToken, body.factorId, body.code);
  }


  /**
   * DELETE /api/auth/mfa/factors/:factorId
   * Remove um fator MFA (admin — reseta MFA do usuário).
   */
  @UseGuards(JwtAuthGuard)
  @Delete('mfa/factors/:factorId')
  @HttpCode(HttpStatus.OK)
  async mfaDeleteFactor(
    @CurrentUser() user: CurrentUserPayload,
    @Param('factorId') factorId: string,
  ) {
    await this.mfaService.deleteFactor(user.supabaseId, factorId);
    return { message: 'Fator MFA removido' };
  }

  /**
   * GET /api/auth/mfa/required
   * Informa se MFA é obrigatório para a role do usuário autenticado.
   */
  @UseGuards(JwtAuthGuard)
  @Get('mfa/required')
  async mfaRequired(@CurrentUser() user: CurrentUserPayload) {
    return {
      required: this.mfaService.roleRequiresMfa(user.role),
      temPrazo: this.mfaService.roleTemPrazoMfa(user.role),
    };
  }
}
