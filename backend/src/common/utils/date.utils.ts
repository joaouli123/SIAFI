/**
 * Datas de vencimento sao DIA de calendario, nao instante. Gravar ao MEIO-DIA UTC
 * mantem o mesmo dia em qualquer fuso (de UTC-11 a UTC+11) e segue a convencao da
 * base (2.951 parcelas e 572 contratos ja estao em 12:00Z).
 *
 * `new Date(ano, mes, dia)` grava meia-noite LOCAL, que no container UTC vira 00:00Z:
 * ao reabrir o contrato o formulario convertia esse instante para Brasilia (UTC-3) e
 * mostrava o dia ANTERIOR; salvando de novo, o dia caia mais um. O log de auditoria do
 * contrato #367 registra 09 -> 08 -> 07 -> 06 em quatro edicoes.
 */
function diaAoMeioDiaUTC(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes, dia, 12, 0, 0, 0));
}

/**
 * Adds N months to a date, clamping to the last valid day of the target month.
 *
 * Native JS Date.setMonth() overflows: Jan 31 + 1 month = Mar 3 (not Feb 28).
 * This function avoids that by resetting to day 1, advancing the month,
 * then restoring the original day clamped to the last day of the target month.
 */
export function calcularDataVencimento(
  dataInicio: Date,
  numeroParcela: number,
  diaVencimento?: number | null,
): Date {
  const targetMonth = dataInicio.getMonth() + numeroParcela;
  const targetYear  = dataInicio.getFullYear() + Math.floor(targetMonth / 12);
  const mes         = ((targetMonth % 12) + 12) % 12;
  const ultimoDia   = new Date(targetYear, mes + 1, 0).getDate();

  if (diaVencimento && diaVencimento >= 1 && diaVencimento <= 28) {
    return diaAoMeioDiaUTC(targetYear, mes, Math.min(diaVencimento, ultimoDia));
  }
  return diaAoMeioDiaUTC(targetYear, mes, Math.min(dataInicio.getDate(), ultimoDia));
}

export function addMonthsSafe(base: Date, months: number): Date {
  const result = new Date(base);
  const targetMonth = result.getMonth() + months;
  const targetYear = result.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;

  const lastDayOfTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const day = Math.min(base.getDate(), lastDayOfTargetMonth);

  return diaAoMeioDiaUTC(targetYear, normalizedMonth, day);
}
