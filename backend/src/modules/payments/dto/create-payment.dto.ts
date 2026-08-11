import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsInt()
  @IsPositive()
  installmentId: number;

  // 0 é permitido quando há desconto (ex.: perdão / quitação com desconto total)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valorPago: number;

  @IsDateString()
  dataPagamento: string;

  @IsOptional()
  @IsIn(['dinheiro', 'pix', 'mercadopago', 'transferencia', 'cheque', 'cartao'])
  metodoPagamento: 'dinheiro' | 'pix' | 'mercadopago' | 'transferencia' | 'cheque' | 'cartao' =
    'dinheiro';

  @IsOptional()
  observacao?: string;

  // Conta/banco que recebeu a baixa manual (ex.: "Itaú PJ", "Caixa - dinheiro")
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contaDestino?: string;

  // Desconto concedido nesta baixa
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  desconto?: number;

  @IsOptional()
  @IsIn(['saldo', 'encargos'])
  descontoTipo?: 'saldo' | 'encargos';

  @IsOptional()
  @IsString()
  descontoMotivo?: string;

  // Ajuste permitido somente ao administrador; os valores são congelados nesta baixa.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  comissaoPercentual?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  comissaoAdministradorPercentual?: number;
}
