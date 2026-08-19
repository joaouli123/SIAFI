import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// O formulário envia string vazia quando o campo opcional fica em branco;
// sem isso o @IsEmail/@IsNumber reprovaria um campo que o usuário nem preencheu.
const vazioParaUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export const ROLES = ['admin', 'financeiro', 'consultor', 'caixa', 'cliente'] as const;

// O login monta o e-mail do Supabase como `${username}@siafi.local`; caractere
// fora deste conjunto gera endereço inválido e a conta nunca é criada.
const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;

export class CreateUserDto {
  @IsString()
  @MinLength(3, { message: 'Nome deve ter ao menos 3 caracteres' })
  nome: string;

  @IsString()
  @MinLength(3, { message: 'Usuário deve ter ao menos 3 caracteres' })
  @Matches(USERNAME_RE, { message: 'Usuário aceita apenas letras, números, ponto, hífen e _' })
  username: string;

  // 8 é o mínimo já exigido na redefinição por e-mail e no formulário da tela.
  @IsString()
  @MinLength(8, { message: 'Senha deve ter ao menos 8 caracteres' })
  password: string;

  @IsIn(ROLES, { message: 'Perfil inválido' })
  role: string;

  @Transform(vazioParaUndefined)
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string | null;

  @Transform(vazioParaUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Comissão deve ser um número' })
  @Min(0)
  @Max(100)
  comissaoPercentual?: number;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Nome deve ter ao menos 3 caracteres' })
  nome?: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Usuário deve ter ao menos 3 caracteres' })
  @Matches(USERNAME_RE, { message: 'Usuário aceita apenas letras, números, ponto, hífen e _' })
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Senha deve ter ao menos 8 caracteres' })
  password?: string;

  @IsOptional()
  @IsIn(ROLES, { message: 'Perfil inválido' })
  role?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @Transform(vazioParaUndefined)
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string | null;

  @Transform(vazioParaUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Comissão deve ser um número' })
  @Min(0)
  @Max(100)
  comissaoPercentual?: number | null;
}
