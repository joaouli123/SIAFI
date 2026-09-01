import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class LoanFilterDto extends PaginationDto {
  @IsOptional()
  @IsIn(['ativo', 'quitado', 'cancelado', 'inadimplente', ''])
  status?: 'ativo' | 'quitado' | 'cancelado' | 'inadimplente' | '';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  clientId?: number;

  // Intervalo pela data de INICIO do contrato (nao pelo vencimento das parcelas).
  @IsOptional()
  @IsDateString()
  inicioDe?: string;

  @IsOptional()
  @IsDateString()
  inicioAte?: string;
}
