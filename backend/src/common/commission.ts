import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Data a partir da qual a comissão do consultor passa a ser PROPORCIONAL.
 *
 * Regra "daqui pra frente" (decidida com o cliente): parcelas cujo PRIMEIRO pagamento
 * ocorre nesta data ou depois têm o capital rateado proporcionalmente ao quanto foi pago
 * em cada mês — assim a comissão do consultor não fica concentrada num único mês quando a
 * parcela é paga aos poucos. Parcelas que JÁ estavam sendo pagas antes desta data mantêm a
 * regra anterior (capital-primeiro), para não alterar comissões já apuradas/pagas.
 *
 * Gate por PARCELA (não por baixa): se qualquer baixa da parcela é anterior a esta data, a
 * parcela inteira continua no capital-primeiro. Isso garante que capital + lucro sempre
 * fechem exatamente, o que uma mistura de regras na mesma parcela quebraria.
 *
 * Pode ser sobrescrita por ambiente (COMISSAO_PROPORCIONAL_DESDE=YYYY-MM-DD).
 */
export const COMISSAO_PROPORCIONAL_DESDE: Date = new Date(
  process.env.COMISSAO_PROPORCIONAL_DESDE || '2026-07-24T00:00:00-03:00',
);

const D = (v: unknown) => new Decimal((v ?? 0).toString());
const r2 = (v: Decimal) => parseFloat(v.toDecimalPlaces(2).toString());

/** Aceita number, string ou Decimal (do Prisma ou do decimal.js) — tudo vira Decimal via D(). */
export type Numerico = number | string | { toString(): string } | null | undefined;

/** Uma baixa (Payment) com o mínimo necessário para o rateio. */
export interface BaixaInput {
  id?: number;
  valorPago: Numerico;
  /** Débito total da parcela COM encargos no momento da baixa (Payment.valorDevido). */
  valorDevido?: Numerico;
  desconto?: Numerico;
  dataPagamento: Date | string;
  /** Snapshot opcional da comissão usada nesta baixa. */
  comissaoPercentual?: Numerico;
  comissaoAdministradorPercentual?: Numerico;
}

export interface ParcelaParams {
  principalPayback: Numerico;
  installmentAmount: Numerico;
  comissaoPercentual?: Numerico;
  comissaoAdministradorPercentual?: Numerico;
  /**
   * Simulacao "e se o percentual fosse outro": quando definido, manda em tudo —
   * ignora o snapshot da baixa e o percentual do contrato. Serve a tela de
   * Recebimentos, onde se digita o percentual e os totais recalculam na hora.
   * Nao grava nada: o historico continua com o percentual da epoca.
   */
  overrideComissaoPercentual?: Numerico;
  overrideComissaoAdministradorPercentual?: Numerico;
}

export interface Split {
  capital: number;
  lucro: number;
  comissao: number;
  comissaoAdministrador: number;
  lucroEmpresa: number;
  comissaoPercentual: number;
  comissaoAdministradorPercentual: number;
}

/**
 * Rateia TODAS as baixas de uma parcela em capital × lucro e calcula a comissão.
 * Retorna um Split por baixa, na mesma ordem recebida.
 *
 * Proporcional (regra atual): cada baixa leva a fatia do capital correspondente ao que ela
 * paga do DÉBITO ATUALIZADO (valor da parcela + multa + mora no dia do pagamento):
 *
 *     capital = capitalRestante × valorPago / dívidaRestante
 *
 * A baixa que quita a parcela absorve todo o capital restante, de modo que Σcapital fecha
 * exatamente no principal da parcela. Assim o capital — e portanto o lucro e a comissão —
 * é distribuído entre os meses em que o dinheiro efetivamente entrou.
 *
 * Capital-primeiro (regra anterior, para parcelas já em andamento antes da virada): o lucro
 * só começa depois de o principal ter sido inteiramente reposto.
 *
 * O capital de uma baixa nunca passa do que foi pago nela (lucro nunca fica negativo). Se a
 * parcela for quitada por menos que o débito com encargos — o sistema dá a parcela por paga
 * assim que o valor dela é coberto, dispensando os encargos restantes — pode sobrar capital
 * não alocado; nesse caso o excedente fica fora do rateio em vez de virar lucro negativo.
 */
export function splitParcela(payments: BaixaInput[], p: ParcelaParams): Split[] {
  const principal = D(p.principalPayback);
  const amount    = D(p.installmentAmount);
  const proporcional = isProporcional(payments);

  let antes       = new Decimal(0); // Σ valorPago das baixas anteriores
  let descAntes   = new Decimal(0); // Σ descontos das baixas anteriores
  let capitalAcum = new Decimal(0);

  return payments.map((b) => {
    const valorPago = D(b.valorPago);
    const desconto  = D(b.desconto);
    const capitalRestante = Decimal.max(0, principal.minus(capitalAcum));

    let capital: Decimal;
    if (proporcional) {
      // Payment.valorDevido já é o SALDO do débito (parcela + encargos − pago) no dia da baixa.
      // Sem ele (baixas antigas), cai para o saldo do valor de face.
      const dividaRestante = D(b.valorDevido).gt(0)
        ? D(b.valorDevido)
        : Decimal.max(0, amount.minus(antes).minus(descAntes));
      const quitaDividaAtual = valorPago.plus(desconto).gte(dividaRestante.minus(0.005));

      capital = quitaDividaAtual || dividaRestante.lte(0.005)
        ? capitalRestante
        : capitalRestante.times(valorPago).dividedBy(dividaRestante);
    } else {
      const lucroAntes  = Decimal.max(0, antes.minus(principal));
      const lucroDepois = Decimal.max(0, antes.plus(valorPago).minus(principal));
      capital = valorPago.minus(lucroDepois.minus(lucroAntes));
    }

    capital = capital.clampedTo(0, Decimal.min(capitalRestante, valorPago));
    const lucro        = valorPago.minus(capital);
    // Recebimentos novos carregam seu próprio snapshot. Baixas antigas continuam usando
    // a regra do contrato, preservando compatibilidade com o histórico existente.
    const pctBaixa = p.overrideComissaoPercentual != null
      ? D(p.overrideComissaoPercentual)
      : D(b.comissaoPercentual ?? p.comissaoPercentual);
    const pctAdminBaixa = p.overrideComissaoAdministradorPercentual != null
      ? D(p.overrideComissaoAdministradorPercentual)
      : D(b.comissaoAdministradorPercentual ?? p.comissaoAdministradorPercentual);
    const comissao     = lucro.times(pctBaixa).dividedBy(100);
    const comissaoAdministrador = lucro.times(pctAdminBaixa).dividedBy(100);
    // Valores monetarios usam duas casas. Calcula o residual da empresa com
    // esses mesmos valores para a formula fechar exatamente na tela:
    // Lucro Geral - Comissao do Consultor - Comissao do Administrador.
    const capitalArredondado = r2(capital);
    const lucroArredondado = r2(lucro);
    const comissaoArredondada = r2(comissao);
    const comissaoAdministradorArredondada = r2(comissaoAdministrador);
    const lucroEmpresa = D(lucroArredondado)
      .minus(comissaoArredondada)
      .minus(comissaoAdministradorArredondada);

    antes       = antes.plus(valorPago);
    descAntes   = descAntes.plus(desconto);
    capitalAcum = capitalAcum.plus(capital);

    return {
      capital:            capitalArredondado,
      lucro:              lucroArredondado,
      comissao:           comissaoArredondada,
      comissaoAdministrador: comissaoAdministradorArredondada,
      lucroEmpresa:       r2(lucroEmpresa),
      comissaoPercentual: r2(pctBaixa),
      comissaoAdministradorPercentual: r2(pctAdminBaixa),
    };
  });
}

/** Split de UMA baixa da parcela, identificada por id (ou pela posição, se não houver id). */
export function splitBaixa(
  payments: BaixaInput[],
  p: ParcelaParams,
  alvo: { id?: number; index?: number },
): Split {
  const splits = splitParcela(payments, p);
  const idx = alvo.id != null
    ? payments.findIndex((b) => b.id === alvo.id)
    : (alvo.index ?? -1);
  return splits[idx] ?? {
    capital: 0, lucro: 0, comissao: 0, comissaoAdministrador: 0, lucroEmpresa: 0,
    comissaoPercentual: r2(D(p.comissaoPercentual)),
    comissaoAdministradorPercentual: r2(D(p.comissaoAdministradorPercentual)),
  };
}

/**
 * Lucro realizado ACUMULADO de uma parcela (soma do lucro de todas as baixas).
 * Numa parcela quitada o total é igual nas duas regras — o proporcional só muda a
 * distribuição por mês; o que difere é o realizado de parcelas PARCIALMENTE pagas.
 */
export function realizedLucro(payments: BaixaInput[], p: ParcelaParams): number {
  const total = splitParcela(payments, p).reduce((s, x) => s + x.lucro, 0);
  return parseFloat(total.toFixed(2));
}

/** Capital da parcela que ainda não foi recuperado pelas baixas realizadas. */
export function remainingCapital(payments: BaixaInput[], p: ParcelaParams): number {
  const realizado = splitParcela(payments, p)
    .reduce((s, x) => s.plus(x.capital), new Decimal(0));
  return r2(Decimal.max(0, D(p.principalPayback).minus(realizado)));
}

/**
 * Baixas que contam para o rateio: descarta estornadas e ordena cronologicamente
 * (a fatia de capital de uma baixa depende de tudo que veio antes dela).
 */
export function baixasVivas<T extends BaixaInput & { estornado?: boolean; createdAt?: Date | string }>(
  payments: T[] | null | undefined,
): T[] {
  return (payments ?? [])
    .filter((p) => !p.estornado)
    .sort((a, b) => {
      const ta = new Date(a.createdAt ?? a.dataPagamento).getTime();
      const tb = new Date(b.createdAt ?? b.dataPagamento).getTime();
      return ta !== tb ? ta - tb : (a.id ?? 0) - (b.id ?? 0);
    });
}

/** Uma parcela é proporcional se NENHUMA baixa dela é anterior à data de virada. */
export function isProporcional(payments: Array<{ dataPagamento: Date | string }>): boolean {
  return !payments.some((p) => new Date(p.dataPagamento) < COMISSAO_PROPORCIONAL_DESDE);
}

/** Campos que toda consulta precisa trazer das baixas para o rateio funcionar. */
export const BAIXA_SELECT = {
  id: true,
  valorPago: true,
  valorDevido: true,
  desconto: true,
  dataPagamento: true,
  comissaoPercentual: true,
  comissaoAdministradorPercentual: true,
  createdAt: true,
} as const;

export const BAIXA_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

export interface BaixaComputada {
  valorPago: number;
  capital: number;
  lucro: number;
  comissao: number;
  comissaoAdministrador: number;
  lucroEmpresa: number;
  consultorId: number | null;
  consultorNome: string;
  dataPagamento: Date;
}

/**
 * Calcula o split (capital/lucro/comissão) de todas as baixas com dataPagamento no período
 * [start, end], atribuindo cada valor ao MÊS em que o dinheiro entrou (por data do pagamento).
 * O rateio considera TODAS as baixas vivas de cada parcela tocada no período — não só as do
 * período — porque a fatia de capital de uma baixa depende das anteriores.
 */
export async function computeBaixasPeriodo(
  prisma: PrismaService,
  start: Date,
  end: Date,
): Promise<BaixaComputada[]> {
  const installments = await prisma.installment.findMany({
    where: { payments: { some: { dataPagamento: { gte: start, lte: end }, estornado: false } } },
    select: {
      principalPayback:  true,
      installmentAmount: true,
      loan: {
        select: {
          comissaoPercentual: true,
          comissaoAdministradorPercentual: true,
          client: { select: { consultor: { select: { id: true, nome: true } } } },
        },
      },
      payments: {
        where:   { estornado: false },
        select:  BAIXA_SELECT,
        orderBy: BAIXA_ORDER,
      },
    },
  });

  const out: BaixaComputada[] = [];
  for (const inst of installments) {
    const consultor = inst.loan.client?.consultor ?? null;
    const splits = splitParcela(inst.payments, {
      principalPayback:   inst.principalPayback,
      installmentAmount:  inst.installmentAmount,
      comissaoPercentual: inst.loan.comissaoPercentual,
      comissaoAdministradorPercentual: inst.loan.comissaoAdministradorPercentual,
    });
    inst.payments.forEach((pay, i) => {
      const dt = new Date(pay.dataPagamento);
      if (dt < start || dt > end) return;
      const s = splits[i];
      out.push({
        valorPago:     Number(pay.valorPago),
        capital:       s.capital,
        lucro:         s.lucro,
        comissao:      s.comissao,
        comissaoAdministrador: s.comissaoAdministrador,
        lucroEmpresa:  s.lucroEmpresa,
        consultorId:   consultor?.id ?? null,
        consultorNome: consultor?.nome ?? 'Sem consultor',
        dataPagamento: dt,
      });
    });
  }
  return out;
}
