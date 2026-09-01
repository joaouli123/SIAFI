/**
 * Converte uma data vinda do front ('YYYY-MM-DD') para meia-noite LOCAL.
 *
 * `new Date('2026-07-27')` é interpretado pelo JS como UTC: no fuso de Brasília isso vira
 * 26/07 às 21:00 e joga o registro para o dia ANTERIOR — deslocando contagem de dias de
 * atraso, mora, filtros de período e relatórios. Os vencimentos já eram gravados como
 * meia-noite local (`T00:00:00`); esta função dá o mesmo tratamento às demais datas.
 *
 * Strings com hora, ISO completo ou objetos Date passam sem alteração.
 */
export function dataLocal(v: Date | string): Date {
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return new Date(v);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

/**
 * Converte uma data que representa um DIA de calendario (inicio de contrato,
 * vencimento, nascimento) para o meio-dia UTC.
 *
 * Diferente de dataLocal(), que serve para instantes e para limites de filtro:
 * a meia-noite local vira 00:00Z no container UTC, e reler esse instante no fuso
 * de Brasilia devolve o dia ANTERIOR — foi o que fez a data do contrato recuar
 * um dia a cada edicao. Meio-dia UTC e o mesmo dia em qualquer fuso usual.
 */
export function dataDia(v: Date | string): Date {
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0));
    return dataDia(new Date(v));
  }
  return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), 12, 0, 0, 0));
}

/**
 * Limites de um DIA de calendario em UTC, para filtros por intervalo.
 *
 * Datas de dia sao gravadas as 12:00Z (dataDia) e as historicas as 00:00Z. Montar o
 * limite com new Date('YYYY-MM-DDT00:00:00') usa o fuso do processo: fora de UTC isso
 * deixaria as 00:00Z de fora do proprio dia pedido. Fixar o limite em UTC pega as duas.
 */
export function inicioDoDiaUtc(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return new Date(v);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
}

export function fimDoDiaUtc(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return new Date(v);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999));
}
