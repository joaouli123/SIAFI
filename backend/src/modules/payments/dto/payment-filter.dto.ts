import { IsOptional, IsString, IsInt, Min, Max, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  consultorId?: number;

  @IsOptional()
  @IsString()
  contaDestino?: string;

  // Simulacao de percentual na tela de Recebimentos: recalcula os totais sem gravar nada.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  simComissaoPercentual?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  simComissaoAdministradorPercentual?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
