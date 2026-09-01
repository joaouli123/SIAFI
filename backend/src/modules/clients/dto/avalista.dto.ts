import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { plainToInstance } from 'class-transformer';

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

/**
 * No multipart o array de avalistas chega como string JSON, entao o DTO precisa de
 * um @Transform para desserializar. So que o @Transform SUBSTITUI a conversao do
 * @Type: os itens continuavam objetos crus, sem os decorators da classe, e o
 * ValidationPipe (whitelist + forbidNonWhitelisted) recusava cada campo com
 * "avalistas.0.property nome should not exist" — derrubando com 400 todo cadastro
 * ou edicao de cliente que tivesse um avalista preenchido. Instanciar aqui devolve
 * a classe ao validador.
 */
export function paraAvalistas(value: unknown): unknown {
  let bruto = value;
  if (typeof bruto === 'string') {
    try {
      bruto = JSON.parse(bruto);
    } catch {
      return value;
    }
  }
  return Array.isArray(bruto) ? plainToInstance(AvalistaDto, bruto) : bruto;
}
