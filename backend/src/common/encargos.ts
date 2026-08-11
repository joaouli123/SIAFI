import Decimal from 'decimal.js';
import type { Numerico } from './commission';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const D = (v: unknown) => new Decimal((v ?? 0).toString());
const r2 = (v: Decimal) => parseFloat(v.toDecimalPlaces(2).toString());
const MS_DIA = 1000 * 60 * 60 * 24;

const meiaNoite = (d: Date | string): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const diasEntre = (de: Date, ate: Date): number =>
  Math.max(0, Math.floor((ate.getTime() - de.getTime()) / MS_DIA));

/** Baixa (Payment) com o mínimo necessário para fatiar a mora no tempo. */
export interface BaixaEncargo {
  dataPagamento: Date | string;
  valorPago: Numerico;
  estornado?: boolean | null;
}

export interface ParcelaEncargo {
  installmentAmount: Numerico;
  totalPago: Numerico;
  saldoDevedor?: Numerico;
  dataVencimento: Date | string;
  payments?: BaixaEncargo[] | null;
}

export interface Encargos {
  saldo: number;
  valorMulta: number;
  valorMora: number;
  totalDevido: number;
  diasAtraso: number;
}

/**
 * Mora acumulada por TRECHOS: em cada intervalo (vencimento → baixa → ... → hoje) a mora
 * corre sobre o saldo que existia naquele período. Recalcular tudo sobre o saldo de hoje
 * apagaria retroativamente a mora que já tinha corrido sobre um saldo maior — era isso que
 * fazia o total da parcela CAIR depois de um pagamento parcial (701,40 → 586,56 em vez de
 * 401,40 numa parcela de 500 com baixa de 300).
 */
function moraPorTrechos(
  inst: ParcelaEncargo,
  moraDiaPerc: number,
  venc: Date,
  hoje: Date,
  saldo: number,
): number {
  const taxa = D(moraDiaPerc).dividedBy(100);
  const face = D(inst.installmentAmount);

  const baixas = (inst.payments ?? [])
    .filter((p) => !p.estornado)
    .map((p) => ({ data: meiaNoite(p.dataPagamento), valor: D(p.valorPago) }))
    .sort((a, b) => a.data.getTime() - b.data.getTime());

  // O fatiamento só é confiável se as baixas explicam o saldo atual. Se a lista não foi
  // carregada pelo chamador, cai na conta simples sobre o saldo (comportamento antigo).
  const abatido = baixas.reduce((s, b) => s.plus(b.valor), D(0));
  if (face.minus(abatido).minus(saldo).abs().greaterThan(0.01)) {
    return r2(D(saldo).times(taxa).times(diasEntre(venc, hoje)));
  }

  let mora = D(0);
  let saldoCorrente = face;
  let cursor = venc;

  for (const b of baixas) {
    const fim = b.data.getTime() > hoje.getTime() ? hoje : b.data;
    if (fim.getTime() > cursor.getTime()) {
      if (saldoCorrente.greaterThan(0)) {
        mora = mora.plus(saldoCorrente.times(taxa).times(diasEntre(cursor, fim)));
      }
      cursor = fim;
    }
    saldoCorrente = Decimal.max(0, saldoCorrente.minus(b.valor));
  }

  if (saldoCorrente.greaterThan(0) && hoje.getTime() > cursor.getTime()) {
    mora = mora.plus(saldoCorrente.times(taxa).times(diasEntre(cursor, hoje)));
  }

  return r2(mora);
}

/**
 * Fórmula ÚNICA de encargos do sistema.
 * Multa: uma única vez sobre o valor da parcela. Mora: diária sobre o saldo de cada período.
 */
export function calcularEncargos(
  inst: ParcelaEncargo,
  multaPerc: number,
  moraDiaPerc: number,
  hoje: Date,
): Encargos {
  const venc = meiaNoite(inst.dataVencimento);
  const hojeZero = meiaNoite(hoje);

  const face = D(inst.installmentAmount);
  const saldoCalculado = face.minus(D(inst.totalPago));
  const saldoGravado = inst.saldoDevedor == null ? null : D(inst.saldoDevedor);

  // saldoDevedor só vale como "dívida atual com encargos" quando uma baixa o escreveu.
  // O schema aplica @default(0), então parcela que nunca recebeu baixa chega aqui com 0 —
  // e isso fazia a parcela inteira valer zero: sumia da carteira, o PIX saía com R$ 0,00 e
  // qualquer baixa era recusada por "excede o total devido com encargos (0,00)".
  const baixasCarregadas = Array.isArray(inst.payments);
  const semBaixaViva = baixasCarregadas && !inst.payments!.some((p) => !p.estornado);
  const naoInicializado =
    saldoGravado != null &&
    saldoGravado.lte(0.005) &&
    D(inst.totalPago).lte(0.005) &&
    face.greaterThan(0.005);

  const saldoRegistrado =
    saldoGravado == null || semBaixaViva || naoInicializado ? null : saldoGravado;
  const saldoDecimal = saldoRegistrado == null ? saldoCalculado : saldoRegistrado;
  const saldo = Math.max(0, r2(saldoDecimal));
  const diasAtraso = saldo > 0 ? diasEntre(venc, hojeZero) : 0;

  if (diasAtraso < 1) {
    return { saldo, valorMulta: 0, valorMora: 0, totalDevido: saldo, diasAtraso };
  }

  const baixas = (inst.payments ?? [])
    .filter((p) => !p.estornado)
    .map((p) => ({ data: meiaNoite(p.dataPagamento), valor: D(p.valorPago) }))
    .sort((a, b) => a.data.getTime() - b.data.getTime());
  const abatido = baixas.reduce((s, b) => s.plus(b.valor), D(0));
  const saldoExplicadoPelasBaixas = face.minus(abatido);
  const saldoRegistradoEhDividaAtual =
    saldoRegistrado != null && saldoRegistrado.minus(saldoExplicadoPelasBaixas).abs().greaterThan(0.01);

  if (saldoRegistradoEhDividaAtual) {
    const ultimaBaixa = baixas.length ? baixas[baixas.length - 1].data : venc;
    const baseMora = ultimaBaixa.getTime() > venc.getTime() ? ultimaBaixa : venc;
    const diasMora = diasEntre(baseMora, hojeZero);
    const valorMulta = ultimaBaixa.getTime() > venc.getTime()
      ? 0
      : r2(D(saldo).times(multaPerc).dividedBy(100));
    const valorMora = r2(D(saldo).times(moraDiaPerc).dividedBy(100).times(diasMora));
    return {
      saldo,
      valorMulta,
      valorMora,
      totalDevido: r2(D(saldo).plus(valorMulta).plus(valorMora)),
      diasAtraso,
    };
  }

  const valorMulta = r2(face.times(multaPerc).dividedBy(100));
  const valorMora = moraPorTrechos(inst, moraDiaPerc, venc, hojeZero, saldo);
  const totalDevido = r2(D(saldo).plus(valorMulta).plus(valorMora));

  return { saldo, valorMulta, valorMora, totalDevido, diasAtraso };
}
