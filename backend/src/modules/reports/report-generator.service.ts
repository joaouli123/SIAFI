import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RelData } from './relatorios.types';

export interface RelParams {
  startDate?: string;
  endDate?: string;
  mes?: string;   // YYYY-MM
  status?: string;
  clientId?: string;
}

const n = (v: unknown): number => Number(v ?? 0);

// Faixas de aging compartilhadas (carteira / PDD)
const FAIXAS = ['A vencer', '1-30 dias', '31-60 dias', '61-90 dias', '90+ dias'] as const;
const PDD_RATE: Record<string, number> = {
  'A vencer': 0, '1-30 dias': 5, '31-60 dias': 20, '61-90 dias': 50, '90+ dias': 100,
};
function faixaDe(diasAtraso: number): string {
  if (diasAtraso <= 0) return 'A vencer';
  if (diasAtraso <= 30) return '1-30 dias';
  if (diasAtraso <= 60) return '31-60 dias';
  if (diasAtraso <= 90) return '61-90 dias';
  return '90+ dias';
}

@Injectable()
export class ReportGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async gerar(key: string, params: RelParams): Promise<RelData> {
    switch (key) {
      case 'carteira-contratos':   return this.carteiraContratos(params);
      case 'aging-carteira':       return this.aging(params, false);
      case 'inadimplencia':        return this.inadimplencia();
      case 'provisao-pdd':         return this.aging(params, true);
      case 'clientes-risco':       return this.clientesRisco();
      case 'dre-periodo':          return this.dre(params);
      case 'fluxo-caixa':          return this.fluxoCaixa(params);
      case 'faturamento-consultor':return this.faturamentoConsultor(params);
      case 'recebimentos-metodo':  return this.recebimentosMetodo(params);
      case 'projecao-recebiveis':  return this.projecaoRecebiveis();
      case 'comissao-acumulada':   return this.comissaoAcumulada();
      case 'descontos-concedidos': return this.descontosConcedidos(params);
      case 'renegociacoes-reparcelamentos': return this.renegReparc(params);
      case 'auditoria-operacoes':  return this.auditoria(params);
      case 'extrato-cliente':      return this.extratoCliente(params);
      default:
        throw new BadRequestException(`Relatório desconhecido: ${key}`);
    }
  }

  // ─── Helpers de período ─────────────────────────────────────────────────────

  private resolvePeriodo(p: RelParams): { start: Date; end: Date; label: string } {
    if (p.mes) {
      const [ano, mes] = p.mes.split('-').map(Number);
      return {
        start: new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0)),
        end: new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999)),
        label: p.mes,
      };
    }
    const hoje = new Date();
    const start = p.startDate ? new Date(p.startDate + 'T00:00:00') : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const end = p.endDate ? new Date(p.endDate + 'T23:59:59.999') : new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);
    const f = (d: Date) => d.toLocaleDateString('pt-BR');
    return { start, end, label: `${f(start)} a ${f(end)}` };
  }

  private diasAtraso(dataVencimento: Date | string): number {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const venc = new Date(dataVencimento); venc.setHours(0, 0, 0, 0);
    return Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000);
  }

  // ─── 1. Carteira de Contratos ───────────────────────────────────────────────

  private async carteiraContratos(p: RelParams): Promise<RelData> {
    const where: Record<string, unknown> = p.status
      ? { status: p.status }
      : { status: { not: 'cancelado' } };

    const loans = await this.prisma.loan.findMany({
      where,
      orderBy: { id: 'desc' },
      include: {
        client: { select: { nome: true } },
        consultor: { select: { nome: true } },
        installments: { select: { installmentAmount: true, totalPago: true } },
      },
    });

    const linhas = loans.map((l) => {
      const total = l.installments.reduce((s, i) => s + n(i.installmentAmount), 0);
      const recebido = l.installments.reduce((s, i) => s + n(i.totalPago), 0);
      return {
        contrato: l.id,
        cliente: l.client.nome,
        consultor: l.consultor?.nome ?? '—',
        principal: n(l.principalAmount),
        lucro: n(l.targetProfit),
        total,
        recebido,
        saldo: total - recebido,
        parcelas: l.numeroParcelas,
        status: l.status,
      };
    });

    const soma = (k: string) => linhas.reduce((s, r) => s + n(r[k as keyof typeof r]), 0);

    return {
      key: 'carteira-contratos',
      titulo: 'Carteira de Contratos',
      subtitulo: `${linhas.length} contrato(s)`,
      colunas: [
        { key: 'contrato', label: 'Contrato', tipo: 'inteiro' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'consultor', label: 'Consultor' },
        { key: 'principal', label: 'Capital', tipo: 'moeda' },
        { key: 'lucro', label: 'Lucro Alvo', tipo: 'moeda' },
        { key: 'total', label: 'Total a Receber', tipo: 'moeda' },
        { key: 'recebido', label: 'Recebido', tipo: 'moeda' },
        { key: 'saldo', label: 'Saldo', tipo: 'moeda' },
        { key: 'parcelas', label: 'Parcelas', tipo: 'inteiro' },
        { key: 'status', label: 'Status' },
      ],
      linhas,
      totais: {
        cliente: 'TOTAL',
        principal: soma('principal'),
        lucro: soma('lucro'),
        total: soma('total'),
        recebido: soma('recebido'),
        saldo: soma('saldo'),
      },
    };
  }

  // ─── 2. Aging / 4. PDD (compartilham a apuração de faixas) ───────────────────

  private async aging(_p: RelParams, comProvisao: boolean): Promise<RelData> {
    const insts = await this.prisma.installment.findMany({
      where: { status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] } },
      select: { installmentAmount: true, totalPago: true, dataVencimento: true },
    });

    const acc: Record<string, { qtd: number; saldo: number }> = {};
    FAIXAS.forEach((f) => (acc[f] = { qtd: 0, saldo: 0 }));

    for (const i of insts) {
      const saldo = Math.max(0, n(i.installmentAmount) - n(i.totalPago));
      if (saldo <= 0) continue;
      const faixa = faixaDe(this.diasAtraso(i.dataVencimento));
      acc[faixa].qtd += 1;
      acc[faixa].saldo += saldo;
    }

    if (comProvisao) {
      const linhas = FAIXAS.map((f) => {
        const rate = PDD_RATE[f];
        return {
          faixa: f,
          qtd: acc[f].qtd,
          saldo: acc[f].saldo,
          taxa: rate,
          provisao: (acc[f].saldo * rate) / 100,
        };
      });
      return {
        key: 'provisao-pdd',
        titulo: 'Provisão para Perdas (PDD)',
        subtitulo: 'Modelo simplificado por faixa de atraso',
        colunas: [
          { key: 'faixa', label: 'Faixa' },
          { key: 'qtd', label: 'Parcelas', tipo: 'inteiro' },
          { key: 'saldo', label: 'Saldo em Aberto', tipo: 'moeda' },
          { key: 'taxa', label: 'Provisão %', tipo: 'percent' },
          { key: 'provisao', label: 'Provisão (R$)', tipo: 'moeda' },
        ],
        linhas,
        totais: {
          faixa: 'TOTAL',
          qtd: linhas.reduce((s, r) => s + r.qtd, 0),
          saldo: linhas.reduce((s, r) => s + r.saldo, 0),
          provisao: linhas.reduce((s, r) => s + r.provisao, 0),
        },
        grafico: { titulo: 'Provisão por faixa', categoriaKey: 'faixa', valorKey: 'provisao' },
      };
    }

    const linhas = FAIXAS.map((f) => ({ faixa: f, qtd: acc[f].qtd, saldo: acc[f].saldo }));
    return {
      key: 'aging-carteira',
      titulo: 'Aging da Carteira',
      subtitulo: 'Saldo a receber por faixa de vencimento',
      colunas: [
        { key: 'faixa', label: 'Faixa' },
        { key: 'qtd', label: 'Parcelas', tipo: 'inteiro' },
        { key: 'saldo', label: 'Saldo', tipo: 'moeda' },
      ],
      linhas,
      totais: {
        faixa: 'TOTAL',
        qtd: linhas.reduce((s, r) => s + r.qtd, 0),
        saldo: linhas.reduce((s, r) => s + r.saldo, 0),
      },
      grafico: { titulo: 'Saldo por faixa de vencimento', categoriaKey: 'faixa', valorKey: 'saldo' },
    };
  }

  // ─── 3. Inadimplência Detalhada ──────────────────────────────────────────────

  private async inadimplencia(): Promise<RelData> {
    const insts = await this.prisma.installment.findMany({
      where: { status: 'atrasado' },
      orderBy: { dataVencimento: 'asc' },
      include: { loan: { include: { client: { select: { nome: true, whatsapp: true } } } } },
    });

    const linhas = insts.map((i) => {
      const saldo = Math.max(0, n(i.installmentAmount) - n(i.totalPago));
      const multa = n(i.valorMulta);
      const mora = n(i.valorMora);
      return {
        cliente: i.loan.client.nome,
        whatsapp: i.loan.client.whatsapp ?? '—',
        contrato: i.loan.id,
        parcela: i.numero,
        vencimento: i.dataVencimento,
        dias: this.diasAtraso(i.dataVencimento),
        saldo,
        multa,
        mora,
        total: saldo + multa + mora,
      };
    });

    const soma = (k: string) => linhas.reduce((s, r) => s + n(r[k as keyof typeof r]), 0);
    return {
      key: 'inadimplencia',
      titulo: 'Inadimplência Detalhada',
      subtitulo: `${linhas.length} parcela(s) em atraso`,
      colunas: [
        { key: 'cliente', label: 'Cliente' },
        { key: 'whatsapp', label: 'WhatsApp' },
        { key: 'contrato', label: 'Contrato', tipo: 'inteiro' },
        { key: 'parcela', label: 'Parc.', tipo: 'inteiro' },
        { key: 'vencimento', label: 'Vencimento', tipo: 'data' },
        { key: 'dias', label: 'Dias Atraso', tipo: 'inteiro' },
        { key: 'saldo', label: 'Saldo', tipo: 'moeda' },
        { key: 'multa', label: 'Multa', tipo: 'moeda' },
        { key: 'mora', label: 'Mora', tipo: 'moeda' },
        { key: 'total', label: 'Total Devido', tipo: 'moeda' },
      ],
      linhas,
      totais: { cliente: 'TOTAL', saldo: soma('saldo'), multa: soma('multa'), mora: soma('mora'), total: soma('total') },
    };
  }

  // ─── 5. Clientes & Risco ──────────────────────────────────────────────────────

  private async clientesRisco(): Promise<RelData> {
    const clients = await this.prisma.client.findMany({
      where: { active: true },
      orderBy: { nome: 'asc' },
      select: {
        nome: true, cpf: true, cidade: true, estado: true,
        scoreNumerico: true, riskLevel: true,
        loans: {
          where: { status: { in: ['ativo', 'inadimplente'] } },
          select: { installments: { select: { installmentAmount: true, totalPago: true, status: true } } },
        },
      },
    });

    const linhas = clients.map((c) => {
      let saldo = 0;
      for (const l of c.loans) {
        for (const i of l.installments) {
          if (i.status !== 'pago' && i.status !== 'cancelado') {
            saldo += Math.max(0, n(i.installmentAmount) - n(i.totalPago));
          }
        }
      }
      return {
        cliente: c.nome,
        cpf: c.cpf ?? '—',
        cidade: [c.cidade, c.estado].filter(Boolean).join('/') || '—',
        score: c.scoreNumerico ?? 0,
        risco: c.riskLevel,
        contratos: c.loans.length,
        saldo,
      };
    });

    return {
      key: 'clientes-risco',
      titulo: 'Clientes & Risco',
      subtitulo: `${linhas.length} cliente(s) ativo(s)`,
      colunas: [
        { key: 'cliente', label: 'Cliente' },
        { key: 'cpf', label: 'CPF' },
        { key: 'cidade', label: 'Cidade/UF' },
        { key: 'score', label: 'Score', tipo: 'inteiro' },
        { key: 'risco', label: 'Risco' },
        { key: 'contratos', label: 'Contratos Ativos', tipo: 'inteiro' },
        { key: 'saldo', label: 'Saldo Devedor', tipo: 'moeda' },
      ],
      linhas,
      totais: { cliente: 'TOTAL', contratos: linhas.reduce((s, r) => s + r.contratos, 0), saldo: linhas.reduce((s, r) => s + r.saldo, 0) },
    };
  }

  // ─── 6. DRE do Período ──────────────────────────────────────────────────────

  private async dre(p: RelParams): Promise<RelData> {
    const { start, end, label } = this.resolvePeriodo(p);

    const [parcelasPagas, saidas, descontosAgg] = await Promise.all([
      this.prisma.installment.findMany({
        where: { status: 'pago', updatedAt: { gte: start, lte: end } },
        select: { netGain: true, principalPayback: true, totalPago: true, loan: { select: { comissaoPercentual: true } } },
      }),
      this.prisma.transaction.findMany({
        where: { tipo: 'saida', data: { gte: start, lte: end } },
        select: { valor: true, categoria: true },
      }),
      this.prisma.payment.aggregate({
        where: { descontoTipo: 'saldo', dataPagamento: { gte: start, lte: end } },
        _sum: { desconto: true },
      }),
    ]);

    const lucro = parcelasPagas.reduce((s, i) => s + n(i.netGain), 0);
    const recuperacao = parcelasPagas.reduce((s, i) => s + n(i.principalPayback), 0);
    const comissao = parcelasPagas.reduce((s, i) => s + (Math.max(0, n(i.totalPago) - n(i.principalPayback)) * n(i.loan.comissaoPercentual)) / 100, 0);
    const descontos = n(descontosAgg._sum.desconto);
    const capitalLiberado = saidas.filter((t) => t.categoria === 'Liberação de Empréstimo').reduce((s, t) => s + n(t.valor), 0);
    // 'Comissão Consultor' já entra por competência acima (comissao); não contar de novo como despesa de caixa (dupla contagem).
    const despesas = saidas.filter((t) => t.categoria !== 'Liberação de Empréstimo' && t.categoria !== 'Estorno' && t.categoria !== 'Comissão Consultor').reduce((s, t) => s + n(t.valor), 0);
    const lucroLiqComissao = lucro - comissao;
    const resultado = lucroLiqComissao - descontos - despesas;

    const linhas = [
      { conta: 'Lucro bruto realizado (juros recebidos)', valor: lucro },
      { conta: '(−) Comissões de consultores', valor: -comissao },
      { conta: '(=) Lucro líquido de comissões', valor: lucroLiqComissao },
      { conta: '(−) Descontos concedidos', valor: -descontos },
      { conta: '(−) Despesas operacionais (caixa)', valor: -despesas },
      { conta: '(=) Resultado do período', valor: resultado },
      { conta: 'Informativo: Recuperação de capital', valor: recuperacao },
      { conta: 'Informativo: Capital liberado (saída)', valor: capitalLiberado },
    ];

    return {
      key: 'dre-periodo',
      titulo: 'Demonstrativo de Resultado (DRE)',
      subtitulo: 'Resultado simplificado do período',
      periodo: label,
      colunas: [
        { key: 'conta', label: 'Conta' },
        { key: 'valor', label: 'Valor', tipo: 'moeda' },
      ],
      linhas,
      resumo: [
        { label: 'Lucro realizado', valor: this.brl(lucro) },
        { label: 'Comissões', valor: this.brl(comissao) },
        { label: 'Resultado do período', valor: this.brl(resultado) },
      ],
    };
  }

  // ─── 7. Fluxo de Caixa por Categoria ─────────────────────────────────────────

  private async fluxoCaixa(p: RelParams): Promise<RelData> {
    const { start, end, label } = this.resolvePeriodo(p);
    const txs = await this.prisma.transaction.findMany({
      where: { data: { gte: start, lte: end } },
      select: { tipo: true, valor: true, categoria: true },
    });

    const acc: Record<string, { entradas: number; saidas: number }> = {};
    for (const t of txs) {
      const cat = t.categoria ?? 'Sem categoria';
      acc[cat] ??= { entradas: 0, saidas: 0 };
      if (t.tipo === 'entrada') acc[cat].entradas += n(t.valor);
      else acc[cat].saidas += n(t.valor);
    }

    const linhas = Object.entries(acc)
      .map(([categoria, v]) => ({ categoria, entradas: v.entradas, saidas: v.saidas, saldo: v.entradas - v.saidas }))
      .sort((a, b) => b.saldo - a.saldo);

    const tE = linhas.reduce((s, r) => s + r.entradas, 0);
    const tS = linhas.reduce((s, r) => s + r.saidas, 0);
    return {
      key: 'fluxo-caixa',
      titulo: 'Fluxo de Caixa por Categoria',
      periodo: label,
      colunas: [
        { key: 'categoria', label: 'Categoria' },
        { key: 'entradas', label: 'Entradas', tipo: 'moeda' },
        { key: 'saidas', label: 'Saídas', tipo: 'moeda' },
        { key: 'saldo', label: 'Saldo', tipo: 'moeda' },
      ],
      linhas,
      totais: { categoria: 'TOTAL', entradas: tE, saidas: tS, saldo: tE - tS },
      resumo: [
        { label: 'Total Entradas', valor: this.brl(tE) },
        { label: 'Total Saídas', valor: this.brl(tS) },
        { label: 'Saldo Líquido', valor: this.brl(tE - tS) },
      ],
      grafico: { titulo: 'Saldo por categoria', categoriaKey: 'categoria', valorKey: 'saldo' },
    };
  }

  // ─── 8. Faturamento por Consultor ────────────────────────────────────────────

  private async faturamentoConsultor(p: RelParams): Promise<RelData> {
    const { start, end, label } = this.resolvePeriodo(p);
    const [parcelas, pagamentos] = await Promise.all([
      this.prisma.installment.findMany({
        where: { status: 'pago', updatedAt: { gte: start, lte: end } },
        select: {
          installmentAmount: true, netGain: true, principalPayback: true, totalPago: true,
          loan: { select: { comissaoPercentual: true, client: { select: { consultor: { select: { nome: true } } } } } },
        },
      }),
      // Comissões efetivamente pagas ao consultor no período
      this.prisma.comissaoPagamento.findMany({
        where: { dataPagamento: { gte: start, lte: end } },
        select: { valor: true, loan: { select: { client: { select: { consultor: { select: { nome: true } } } } } } },
      }),
    ]);

    const acc: Record<string, { recebido: number; lucro: number; comissao: number; comissaoPaga: number; capital: number; qtd: number }> = {};
    const ent = (nome: string) => (acc[nome] ??= { recebido: 0, lucro: 0, comissao: 0, comissaoPaga: 0, capital: 0, qtd: 0 });
    for (const i of parcelas) {
      const e = ent(i.loan.client?.consultor?.nome ?? 'Sem consultor');
      const lucro = Math.max(0, n(i.totalPago) - n(i.principalPayback));
      e.recebido += n(i.installmentAmount);
      e.lucro += lucro;
      e.comissao += (lucro * n(i.loan.comissaoPercentual)) / 100;
      e.capital += n(i.principalPayback);
      e.qtd += 1;
    }
    for (const pg of pagamentos) {
      ent(pg.loan.client?.consultor?.nome ?? 'Sem consultor').comissaoPaga += n(pg.valor);
    }

    const linhas = Object.entries(acc).map(([consultor, v]) => ({
      consultor, qtd: v.qtd, recebido: v.recebido, lucro: v.lucro,
      comissao: v.comissao, comissaoPaga: v.comissaoPaga, comissaoSaldo: v.comissao - v.comissaoPaga,
      lucroLiquido: v.lucro - v.comissao, capital: v.capital,
    })).sort((a, b) => b.lucro - a.lucro);

    const soma = (k: string) => linhas.reduce((s, r) => s + n(r[k as keyof typeof r]), 0);
    return {
      key: 'faturamento-consultor',
      titulo: 'Faturamento por Consultor',
      periodo: label,
      colunas: [
        { key: 'consultor', label: 'Consultor' },
        { key: 'qtd', label: 'Parcelas', tipo: 'inteiro' },
        { key: 'recebido', label: 'Recebido', tipo: 'moeda' },
        { key: 'lucro', label: 'Lucro', tipo: 'moeda' },
        { key: 'comissao', label: 'Comissão Devida', tipo: 'moeda' },
        { key: 'comissaoPaga', label: 'Comissão Paga', tipo: 'moeda' },
        { key: 'comissaoSaldo', label: 'Saldo Comissão', tipo: 'moeda' },
        { key: 'lucroLiquido', label: 'Lucro Líquido', tipo: 'moeda' },
        { key: 'capital', label: 'Capital Rec.', tipo: 'moeda' },
      ],
      linhas,
      totais: {
        consultor: 'TOTAL', qtd: soma('qtd'), recebido: soma('recebido'), lucro: soma('lucro'),
        comissao: soma('comissao'), comissaoPaga: soma('comissaoPaga'), comissaoSaldo: soma('comissaoSaldo'),
        lucroLiquido: soma('lucroLiquido'), capital: soma('capital'),
      },
      grafico: { titulo: 'Lucro por consultor', categoriaKey: 'consultor', valorKey: 'lucro' },
    };
  }

  // ─── 9. Recebimentos por Método e Conta ──────────────────────────────────────

  private async recebimentosMetodo(p: RelParams): Promise<RelData> {
    const { start, end, label } = this.resolvePeriodo(p);
    const pagamentos = await this.prisma.payment.findMany({
      where: { dataPagamento: { gte: start, lte: end } },
      select: { valorPago: true, metodoPagamento: true, contaDestino: true },
    });

    const acc: Record<string, { metodo: string; conta: string; qtd: number; total: number }> = {};
    for (const p2 of pagamentos) {
      const conta = p2.contaDestino ?? '—';
      const chave = `${p2.metodoPagamento}||${conta}`;
      acc[chave] ??= { metodo: p2.metodoPagamento, conta, qtd: 0, total: 0 };
      acc[chave].qtd += 1;
      acc[chave].total += n(p2.valorPago);
    }

    const linhas = Object.values(acc).sort((a, b) => b.total - a.total);
    return {
      key: 'recebimentos-metodo',
      titulo: 'Recebimentos por Método e Conta',
      periodo: label,
      colunas: [
        { key: 'metodo', label: 'Método' },
        { key: 'conta', label: 'Conta/Banco' },
        { key: 'qtd', label: 'Qtd', tipo: 'inteiro' },
        { key: 'total', label: 'Total Recebido', tipo: 'moeda' },
      ],
      linhas,
      totais: { metodo: 'TOTAL', qtd: linhas.reduce((s, r) => s + r.qtd, 0), total: linhas.reduce((s, r) => s + r.total, 0) },
    };
  }

  // ─── 10. Projeção de Recebíveis ──────────────────────────────────────────────

  private async projecaoRecebiveis(): Promise<RelData> {
    const insts = await this.prisma.installment.findMany({
      where: { status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] } },
      select: { installmentAmount: true, totalPago: true, dataVencimento: true },
    });

    const acc: Record<string, { qtd: number; valor: number }> = {};
    for (const i of insts) {
      const saldo = Math.max(0, n(i.installmentAmount) - n(i.totalPago));
      if (saldo <= 0) continue;
      const d = new Date(i.dataVencimento);
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      acc[mes] ??= { qtd: 0, valor: 0 };
      acc[mes].qtd += 1;
      acc[mes].valor += saldo;
    }

    const linhas = Object.entries(acc)
      .map(([mes, v]) => ({ mes, qtd: v.qtd, valor: v.valor }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    return {
      key: 'projecao-recebiveis',
      titulo: 'Projeção de Recebíveis',
      subtitulo: 'Parcelas em aberto por mês de vencimento',
      colunas: [
        { key: 'mes', label: 'Mês (vencimento)' },
        { key: 'qtd', label: 'Parcelas', tipo: 'inteiro' },
        { key: 'valor', label: 'Valor Previsto', tipo: 'moeda' },
      ],
      linhas,
      totais: { mes: 'TOTAL', qtd: linhas.reduce((s, r) => s + r.qtd, 0), valor: linhas.reduce((s, r) => s + r.valor, 0) },
      grafico: { titulo: 'Recebíveis por mês', categoriaKey: 'mes', valorKey: 'valor' },
    };
  }

  // ─── Comissão por Contrato (acumulada até hoje) ──────────────────────────────

  private async comissaoAcumulada(): Promise<RelData> {
    const loans = await this.prisma.loan.findMany({
      where: { comissaoPercentual: { gt: 0 }, status: { not: 'cancelado' } },
      orderBy: { id: 'asc' },
      select: {
        id: true, status: true, targetProfit: true, comissaoPercentual: true,
        client: { select: { nome: true } },
        consultor: { select: { nome: true } },
        installments: { select: { totalPago: true, principalPayback: true } },
        comissaoPagamentos: { select: { valor: true } },
      },
    });

    const linhas = loans.map((l) => {
      const pct = n(l.comissaoPercentual);
      const prevista = (n(l.targetProfit) * pct) / 100;
      const realizada = l.installments.reduce(
        (s, i) => s + (Math.max(0, n(i.totalPago) - n(i.principalPayback)) * pct) / 100, 0,
      );
      const paga = l.comissaoPagamentos.reduce((s, c) => s + n(c.valor), 0);
      const saldo = realizada - paga;
      const status = paga <= 0 ? 'A pagar' : saldo <= 0.005 ? 'Quitada' : 'Parcial';
      return {
        contrato: l.id,
        cliente: l.client.nome,
        consultor: l.consultor?.nome ?? '—',
        percentual: pct,
        prevista,
        realizada,
        paga,
        saldo,
        status,
      };
    });

    const soma = (k: string) => linhas.reduce((s, r) => s + n(r[k as keyof typeof r]), 0);
    return {
      key: 'comissao-acumulada',
      titulo: 'Comissão por Contrato (acumulada)',
      subtitulo: `${linhas.length} contrato(s) com comissão`,
      colunas: [
        { key: 'contrato', label: 'Contrato', tipo: 'inteiro' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'consultor', label: 'Consultor' },
        { key: 'percentual', label: '% Lucro', tipo: 'percent' },
        { key: 'prevista', label: 'Prevista', tipo: 'moeda' },
        { key: 'realizada', label: 'Realizada', tipo: 'moeda' },
        { key: 'paga', label: 'Paga', tipo: 'moeda' },
        { key: 'saldo', label: 'Saldo a Pagar', tipo: 'moeda' },
        { key: 'status', label: 'Status' },
      ],
      linhas,
      totais: {
        cliente: 'TOTAL',
        prevista: soma('prevista'), realizada: soma('realizada'),
        paga: soma('paga'), saldo: soma('saldo'),
      },
    };
  }

  // ─── Descontos Concedidos ────────────────────────────────────────────────────

  private async descontosConcedidos(p: RelParams): Promise<RelData> {
    const { start, end, label } = this.resolvePeriodo(p);
    const pagamentos = await this.prisma.payment.findMany({
      where: { desconto: { gt: 0 }, dataPagamento: { gte: start, lte: end } },
      orderBy: { dataPagamento: 'desc' },
      include: {
        installment: { select: { numero: true, loan: { select: { id: true, client: { select: { nome: true } } } } } },
      },
    });

    const linhas = pagamentos.map((pg) => ({
      data: pg.dataPagamento,
      cliente: pg.installment.loan.client.nome,
      contrato: pg.installment.loan.id,
      parcela: pg.installment.numero,
      tipo: pg.descontoTipo === 'encargos' ? 'Encargos' : 'Saldo',
      valorPago: n(pg.valorPago),
      desconto: n(pg.desconto),
      motivo: pg.descontoMotivo ?? '—',
    }));

    return {
      key: 'descontos-concedidos',
      titulo: 'Descontos Concedidos',
      subtitulo: `${linhas.length} baixa(s) com desconto`,
      periodo: label,
      colunas: [
        { key: 'data', label: 'Data', tipo: 'data' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'contrato', label: 'Contrato', tipo: 'inteiro' },
        { key: 'parcela', label: 'Parc.', tipo: 'inteiro' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'valorPago', label: 'Valor Pago', tipo: 'moeda' },
        { key: 'desconto', label: 'Desconto', tipo: 'moeda' },
        { key: 'motivo', label: 'Motivo' },
      ],
      linhas,
      totais: {
        cliente: 'TOTAL',
        valorPago: linhas.reduce((s, r) => s + n(r.valorPago), 0),
        desconto: linhas.reduce((s, r) => s + n(r.desconto), 0),
      },
    };
  }

  // ─── 11. Renegociações & Reparcelamentos ─────────────────────────────────────

  private async renegReparc(p: RelParams): Promise<RelData> {
    const { start, end, label } = this.resolvePeriodo(p);
    const [renegs, reparcs] = await Promise.all([
      this.prisma.renegociacao.findMany({
        where: { createdAt: { gte: start, lte: end } },
        orderBy: { createdAt: 'desc' },
        include: { loan: { include: { client: { select: { nome: true } } } } },
      }),
      this.prisma.solicitacaoReparcelamento.findMany({
        where: { createdAt: { gte: start, lte: end } },
        orderBy: { createdAt: 'desc' },
        include: { client: { select: { nome: true } } },
      }),
    ]);

    const linhas = [
      ...renegs.map((r) => ({
        tipo: 'Renegociação',
        data: r.createdAt,
        cliente: r.loan.client.nome,
        contrato: r.loanId,
        valor: n(r.valorTotal),
        parcelas: r.numeroParcelas,
        status: 'efetivada',
      })),
      ...reparcs.map((r) => ({
        tipo: 'Reparcelamento',
        data: r.createdAt,
        cliente: r.client.nome,
        contrato: r.loanId,
        valor: n(r.novoValorPrincipal),
        parcelas: r.novoNumeroParcelas ?? 0,
        status: r.status,
      })),
    ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    return {
      key: 'renegociacoes-reparcelamentos',
      titulo: 'Renegociações & Reparcelamentos',
      periodo: label,
      colunas: [
        { key: 'tipo', label: 'Tipo' },
        { key: 'data', label: 'Data', tipo: 'data' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'contrato', label: 'Contrato', tipo: 'inteiro' },
        { key: 'valor', label: 'Valor', tipo: 'moeda' },
        { key: 'parcelas', label: 'Parcelas', tipo: 'inteiro' },
        { key: 'status', label: 'Status' },
      ],
      linhas,
      totais: { tipo: 'TOTAL', valor: linhas.reduce((s, r) => s + n(r.valor), 0) },
    };
  }

  // ─── 12. Auditoria de Operações ──────────────────────────────────────────────

  private async auditoria(p: RelParams): Promise<RelData> {
    const { start, end, label } = this.resolvePeriodo(p);
    const logs = await this.prisma.auditLog.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: { user: { select: { nome: true } } },
    });

    const linhas = logs.map((l) => ({
      data: l.createdAt,
      usuario: l.user?.nome ?? '—',
      acao: l.acao,
      entidade: l.entidade ?? '—',
      registro: l.entidadeId ?? '',
      ip: l.ip ?? '—',
    }));

    return {
      key: 'auditoria-operacoes',
      titulo: 'Auditoria de Operações',
      subtitulo: `${linhas.length} registro(s)`,
      periodo: label,
      colunas: [
        { key: 'data', label: 'Data/Hora', tipo: 'data' },
        { key: 'usuario', label: 'Usuário' },
        { key: 'acao', label: 'Ação' },
        { key: 'entidade', label: 'Entidade' },
        { key: 'registro', label: 'ID', tipo: 'inteiro' },
        { key: 'ip', label: 'IP' },
      ],
      linhas,
    };
  }

  // ─── 13. Extrato por Cliente ─────────────────────────────────────────────────

  private async extratoCliente(p: RelParams): Promise<RelData> {
    const clientId = Number(p.clientId);
    if (!clientId) throw new BadRequestException('Selecione um cliente para gerar o extrato.');

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        nome: true, cpf: true,
        loans: {
          orderBy: { id: 'asc' },
          select: {
            id: true, status: true, principalAmount: true, totalReceivable: true,
            installments: {
              orderBy: { numero: 'asc' },
              select: {
                numero: true, dataVencimento: true, installmentAmount: true, totalPago: true, status: true,
                payments: { orderBy: { dataPagamento: 'asc' }, select: { valorPago: true, dataPagamento: true, metodoPagamento: true } },
              },
            },
          },
        },
      },
    });
    if (!client) throw new BadRequestException('Cliente não encontrado.');

    const linhas: Record<string, unknown>[] = [];
    for (const l of client.loans) {
      for (const i of l.installments) {
        const ultimoPgto = i.payments[i.payments.length - 1];
        linhas.push({
          contrato: l.id,
          parcela: i.numero,
          vencimento: i.dataVencimento,
          valor: n(i.installmentAmount),
          pago: n(i.totalPago),
          saldo: Math.max(0, n(i.installmentAmount) - n(i.totalPago)),
          status: i.status,
          dataPgto: ultimoPgto?.dataPagamento ?? null,
          metodo: ultimoPgto?.metodoPagamento ?? '—',
        });
      }
    }

    return {
      key: 'extrato-cliente',
      titulo: 'Extrato do Cliente',
      subtitulo: `${client.nome}${client.cpf ? ` · CPF ${client.cpf}` : ''}`,
      colunas: [
        { key: 'contrato', label: 'Contrato', tipo: 'inteiro' },
        { key: 'parcela', label: 'Parc.', tipo: 'inteiro' },
        { key: 'vencimento', label: 'Vencimento', tipo: 'data' },
        { key: 'valor', label: 'Valor', tipo: 'moeda' },
        { key: 'pago', label: 'Pago', tipo: 'moeda' },
        { key: 'saldo', label: 'Saldo', tipo: 'moeda' },
        { key: 'status', label: 'Status' },
        { key: 'dataPgto', label: 'Últ. Pgto', tipo: 'data' },
        { key: 'metodo', label: 'Método' },
      ],
      linhas,
      totais: {
        contrato: 'TOTAL',
        valor: linhas.reduce((s, r) => s + n(r.valor), 0),
        pago: linhas.reduce((s, r) => s + n(r.pago), 0),
        saldo: linhas.reduce((s, r) => s + n(r.saldo), 0),
      },
    };
  }

  private brl(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
