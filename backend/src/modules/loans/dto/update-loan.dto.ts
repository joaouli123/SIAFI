import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { AvalistaDto } from './avalista.dto';

// Edição de contrato. Campos financeiros (principalAmount, targetProfit,
// numeroParcelas, dataInicio, diaVencimento) disparam regeneração das parcelas
// PENDENTES/ATRASADAS — parcelas pagas/parciais/canceladas são preservadas.
export class UpdateLoanDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  principalAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  targetProfit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(360)
  numeroParcelas?: number;

  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  // Redefine o vencimento da 1ª parcela pendente (regenera o cronograma pendente)
  @IsOptional()
  @IsDateString()
  dataPrimeiroVencimento?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  metodoPagamento?: PaymentMethod;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  diaVencimento?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  multaPercentual?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  moraDiariaPercentual?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  comissaoPercentual?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  descontoQuitacaoPercentual?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  diasAntecedenciaCobranca?: number;

  @IsOptional() @IsBoolean() cobrarWhatsapp?: boolean;
  @IsOptional() @IsBoolean() cobrarEmail?: boolean;
  @IsOptional() @IsBoolean() cobrarPortal?: boolean;

  // Substitui integralmente a lista de avalistas quando enviado
  @IsOptional()
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
