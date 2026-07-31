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
