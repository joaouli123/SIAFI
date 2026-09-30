import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { PERIODICIDADES, type Periodicidade } from '../../../common/utils/date.utils';

export class CreateRenegociacaoDto {
  @IsInt()
  @IsPositive()
  loanId: number;

  @IsNumber()
  @Min(0.01)
  taxaJuros: number;

  @IsInt()
  @IsPositive()
  numeroParcelas: number;

  @IsDateString()
  dataInicio: string;

  @IsOptional()
  @IsIn(PERIODICIDADES)
  periodicidade?: Periodicidade;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
