import { IsOptional, IsString } from 'class-validator';

export class UpdateInstallmentDto {
  @IsOptional()
  @IsString()
  observacao?: string;
}
