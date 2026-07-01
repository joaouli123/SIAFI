import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class AvalistaDto {
  // Quando preenchido, o avalista também é um cliente cadastrado no sistema
  @IsOptional()
  @IsInt()
  @IsPositive()
  clienteId?: number;

  @IsString()
  @MaxLength(150)
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cpf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  parentesco?: string;
}
