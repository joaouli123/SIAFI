import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

const STATUSES = ['pendente', 'parcialmente_pago', 'pago', 'atrasado', 'cancelado'] as const;

export class InstallmentFilterDto {
  @IsOptional()
  @IsIn(STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  loanId?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  // 'true' → apenas parcelas em aberto (não pagas/canceladas)
  @IsOptional()
  @IsString()
  aberto?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}
