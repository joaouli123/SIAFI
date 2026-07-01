import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class RegistrarComissaoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor: number;

  @IsDateString()
  dataPagamento: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}
