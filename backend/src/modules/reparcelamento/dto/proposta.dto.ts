import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { PERIODICIDADES, type Periodicidade } from '../../../common/utils/date.utils';

export class PropostaDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  novoValorPrincipal: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  novoTargetProfit: number;

  @IsInt()
  @Min(1)
  @Max(360)
  novoNumeroParcelas: number;

  @IsDateString()
  novaDataInicio: string;

  @IsOptional()
  @IsIn(PERIODICIDADES)
  novaPeriodicidade?: Periodicidade;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  multaAplicada?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  moraAplicada?: number;

  @IsOptional()
  @IsString()
  observacaoFinanceiro?: string;
}
