import { IsIn, IsInt, IsOptional, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ClientFilterDto extends PaginationDto {
  @IsOptional()
  @IsIn(['active', 'inactive', ''])
  status?: 'active' | 'inactive' | '';

  // Filtro por consultor (admin/financeiro) — filtra clientes pela carteira do consultor
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  consultorId?: number;
}
