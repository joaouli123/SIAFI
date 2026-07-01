import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class QuitarContratoDto {
  @IsDateString()
  dataPagamento: string;

  @IsOptional()
  @IsIn(['dinheiro', 'pix', 'mercadopago', 'transferencia', 'cheque', 'cartao'])
  metodoPagamento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contaDestino?: string;

  // Sobrescreve o desconto do contrato (% sobre o lucro a vencer)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  descontoPercentual?: number;
}
