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
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateLoanDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  // Capital entregue ao cliente — sai do caixa da Lidera
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  principalAmount: number;

  // Lucro total absoluto desejado no contrato — obrigatório
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  targetProfit: number;

  @IsInt()
  @Min(1)
  @Max(360)
  numeroParcelas: number;

  // Data de início/assinatura do contrato (referência; saída do capital)
  @IsDateString()
  dataInicio: string;

  // Data de vencimento da 1ª parcela. Se omitida, usa o comportamento padrão
  // (1 mês após dataInicio, respeitando diaVencimento).
  @IsOptional()
  @IsDateString()
  dataPrimeiroVencimento?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  metodoPagamento?: PaymentMethod;

  @IsOptional()
  @IsString()
  observacoes?: string;

  // Dia fixo de vencimento (1–28); null = usa o dia de dataInicio
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  diaVencimento?: number;

  // Multa por atraso override do empréstimo (% sobre saldo); null = fallback settings
  // Máx. 9.99 (limite da coluna Decimal(5,4) no banco — evita overflow no save).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(9.99)
  multaPercentual?: number;

  // Mora diária override (% ao dia); null = fallback settings
  // Máx. 9.99 (limite da coluna Decimal(7,6) no banco).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(9.99)
  moraDiariaPercentual?: number;

  // Comissão do consultor: % sobre o lucro (netGain) de cada parcela
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  comissaoPercentual?: number;

  // Desconto na quitação total do contrato (% sobre o lucro a vencer)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  descontoQuitacaoPercentual?: number;

  // Antecedência para envio da cobrança (dias antes do vencimento)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  diasAntecedenciaCobranca?: number;

  @IsOptional()
  @IsBoolean()
  cobrarWhatsapp?: boolean;

  @IsOptional()
  @IsBoolean()
  cobrarEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  cobrarPortal?: boolean;

}
