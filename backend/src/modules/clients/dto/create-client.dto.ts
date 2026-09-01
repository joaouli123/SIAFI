import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  MaxLength,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AvalistaDto, paraAvalistas } from './avalista.dto';

function stripNonDigits(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\D/g, '');
  return value;
}

export class CreateClientDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  nome: string;

  @IsOptional()
  @Transform(({ value }) => stripNonDigits(value))
  @IsString()
  @Matches(/^\d{11}$|^\d{14}$/, { message: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos' })
  cpf?: string;

  @IsOptional()
  @IsString()
  rg?: string;

  @IsOptional()
  @IsDateString()
  dataNascimento?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsString()
  endereco?: string;

  @IsOptional()
  @IsString()
  bairro?: string;

  @IsOptional()
  @IsString()
  cidade?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'Estado deve ter exatamente 2 caracteres' })
  estado?: string;

  @IsOptional()
  @IsString()
  cep?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  notificacoesEmail?: boolean;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  consultorId?: number;

  @IsOptional()
  @Transform(({ value }) => paraAvalistas(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvalistaDto)
  avalistas?: AvalistaDto[];

  @IsOptional() @IsString() @MaxLength(150)
  referencia1Nome?: string;
  @IsOptional() @IsString() @MaxLength(30)
  referencia1Telefone?: string;
  @IsOptional() @IsString() @MaxLength(50)
  referencia1Vinculo?: string;

  @IsOptional() @IsString() @MaxLength(150)
  referencia2Nome?: string;
  @IsOptional() @IsString() @MaxLength(30)
  referencia2Telefone?: string;
  @IsOptional() @IsString() @MaxLength(50)
  referencia2Vinculo?: string;
}
