import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export const CANAIS_TRATATIVA = [
  'telefone',
  'whatsapp',
  'visita',
  'presencial',
  'email',
  'outro',
];

export class CreateTratativaDto {
  @IsString()
  @IsIn(CANAIS_TRATATIVA)
  canal: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'Descreva a tratativa' })
  @MaxLength(2000)
  descricao: string;
}
