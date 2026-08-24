import { Prisma } from '@prisma/client';

/**
 * Postgres resolve LIKE respeitando caixa, entao `contains` sem `mode` faz quem
 * digita "maria" nao achar "Maria": a tela responde "nenhum cliente encontrado"
 * com o cadastro na frente. CPF e whatsapp sao gravados so com digitos, entao
 * "502.627.691-15" copiado do documento tambem nunca casava.
 */
export function filtroCliente(search: string): Prisma.ClientWhereInput[] {
  const texto = search.trim();
  const or: Prisma.ClientWhereInput[] = [
    { nome: { contains: texto, mode: 'insensitive' } },
  ];
  const digitos = texto.replace(/\D/g, '');
  if (digitos) {
    or.push({ cpf: { contains: digitos } }, { whatsapp: { contains: digitos } });
  }
  return or;
}
