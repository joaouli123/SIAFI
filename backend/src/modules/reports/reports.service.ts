import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import { computeBaixasPeriodo, BaixaComputada } from '../../common/commission';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMovimentacao(startDate: string, endDate: string): Promise<unknown> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const [transactions, payments] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { data: { gte: start, lte: end } },
        orderBy: { data: 'desc' },
        include: { user: { select: { nome: true } } },
      }),
      this.prisma.payment.findMany({
        where: { dataPagamento: { gte: start, lte: end } },
        orderBy: { dataPagamento: 'desc' },
        include: {
          installment: {
            include: {
              loan: { include: { client: { select: { nome: true } } } },
            },
          },
        },
      }),
    ]);

    const entradas = transactions
      .filter((t) => t.tipo === 'entrada')
      .reduce((s, t) => s + Number(t.valor), 0);
    const saidas = transactions
      .filter((t) => t.tipo === 'saida')
      .reduce((s, t) => s + Number(t.valor), 0);
    const totalPagamentos = payments.reduce((s, p) => s + Number(p.valorPago), 0);

    return {
      transactions,
      payments,
      summary: { entradas, saidas, saldo: entradas - saidas, totalPagamentos },
    };
  }

  async getCarteira(): Promise<unknown> {
    const [loansAtivos, parcelasPagas, parcelasPendentes, totalAtrasados, totalAtivosCount] =
      await Promise.all([
        this.prisma.loan.findMany({
          where: { status: 'ativo' },
          select: { principalAmount: true, targetProfit: true, totalReceivable: true },
        }),
        this.prisma.installment.findMany({
          // Escopo idêntico ao alvo (contratos ativos) — evita misturar realizado de
          // contratos já quitados/cancelados no "a faturar / a recuperar" da carteira.
          where: { status: 'pago', loan: { status: 'ativo' } },
          select: { installmentAmount: true, principalPayback: true, netGain: true },
        }),
        this.prisma.installment.findMany({
          where: { status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] }, loan: { status: 'ativo' } },
          select: { installmentAmount: true, totalPago: true },
        }),
        this.prisma.loan.count({
          where: {
            status: 'ativo',
            installments: { some: { status: 'atrasado' } },
          },
        }),
        this.prisma.loan.count({ where: { status: 'ativo' } }),
      ]);

    // Capital
    const principalEmCarteira = loansAtivos.reduce(
      (acc, l) => acc.plus(l.principalAmount.toString()), new Decimal(0),
    );
    const principalRecuperado = parcelasPagas.reduce(
      (acc, i) => acc.plus(i.principalPayback.toString()), new Decimal(0),
    );
    const principalARecuperar = principalEmCarteira.minus(principalRecuperado);

    // Faturamento
    const targetProfitEmCarteira = loansAtivos.reduce(
      (acc, l) => acc.plus(l.targetProfit.toString()), new Decimal(0),
    );
    const faturamentoRealizado = parcelasPagas.reduce(
      (acc, i) => acc.plus(i.netGain.toString()), new Decimal(0),
    );
    const faturamentoAReceber = targetProfitEmCarteira.minus(faturamentoRealizado);

    // Totais operacionais (manter para compatibilidade com dashboard)
    const totalReceivableAtivo = loansAtivos.reduce(
      (acc, l) => acc.plus(l.totalReceivable.toString()), new Decimal(0),
    );
    const totalRecebido = parcelasPagas.reduce(
      (acc, i) => acc.plus(i.installmentAmount.toString()), new Decimal(0),
    );
    const aReceber = parcelasPendentes.reduce(
      (acc, i) => acc.plus(Decimal.max(0, new Decimal(i.installmentAmount.toString()).minus(i.totalPago.toString()))),
      new Decimal(0),
    );

    return {
      // Capital
      principalEmCarteira:    principalEmCarteira.toFixed(2),
      principalRecuperado:    principalRecuperado.toFixed(2),
      principalARecuperar:    principalARecuperar.toFixed(2),
      // Faturamento
      targetProfitEmCarteira: targetProfitEmCarteira.toFixed(2),
      faturamentoRealizado:   faturamentoRealizado.toFixed(2),
      faturamentoAReceber:    faturamentoAReceber.toFixed(2),
      // Totais operacionais
      totalReceivableAtivo:   totalReceivableAtivo.toFixed(2),
      totalRecebido:          totalRecebido.toFixed(2),
      aReceber:               aReceber.toFixed(2),
      totalAtivos:            totalAtivosCount,
      totalAtrasados,
    };
  }

  async getFaturamentoMensal(mes: string): Promise<unknown> {
    // Intervalo do mês em UTC puro (evita recuo de fuso ao misturar UTC/local)
    const [ano, mesNum] = mes.split('-').map(Number);
    const inicio = new Date(Date.UTC(ano, mesNum - 1, 1, 0, 0, 0, 0));
    const fim    = new Date(Date.UTC(ano, mesNum, 0, 23, 59, 59, 999));

    // Atribui cada valor ao MÊS em que o dinheiro entrou (por data do pagamento),
    // com o capital rateado proporcionalmente (regra "daqui pra frente").
    const baixas = await computeBaixasPeriodo(this.prisma, inicio, fim);

    const faturamentoBruto    = baixas.reduce((s, b) => s.plus(b.lucro),     new Decimal(0));
    const recuperacaoCapital  = baixas.reduce((s, b) => s.plus(b.capital),   new Decimal(0));
    const totalRecebido       = baixas.reduce((s, b) => s.plus(b.valorPago), new Decimal(0));
    const comissaoConsultores = baixas.reduce((s, b) => s.plus(b.comissao),  new Decimal(0));
    const lucroLiquidoEmpresa = faturamentoBruto.minus(comissaoConsultores);

    // Breakdown por consultor
    const porConsultor = this.agruparPorConsultor(baixas);

    return {
      mes,
      totalRecebido:        totalRecebido.toFixed(2),
      faturamentoBruto:     faturamentoBruto.toFixed(2),
      recuperacaoCapital:   recuperacaoCapital.toFixed(2),
      comissaoConsultores:  comissaoConsultores.toFixed(2),
      lucroLiquidoEmpresa:  lucroLiquidoEmpresa.toFixed(2),
      quantidadeParcelas:   baixas.length,
      porConsultor,
    };
  }

  private agruparPorConsultor(baixas: BaixaComputada[]) {
    const mapa = new Map<number | null, {
      id: number | null; nome: string
      totalRecebido:      Decimal
      faturamentoBruto:   Decimal
      recuperacaoCapital: Decimal
      comissao:           Decimal
      quantidadeParcelas: number
    }>();

    for (const b of baixas) {
      const key  = b.consultorId;
      const nome = b.consultorNome;
      const entrada = mapa.get(key) ?? {
        id: key, nome,
        totalRecebido:      new Decimal(0),
        faturamentoBruto:   new Decimal(0),
        recuperacaoCapital: new Decimal(0),
        comissao:           new Decimal(0),
        quantidadeParcelas: 0,
      };
      entrada.totalRecebido      = entrada.totalRecebido.plus(b.valorPago);
      entrada.faturamentoBruto   = entrada.faturamentoBruto.plus(b.lucro);
      entrada.recuperacaoCapital = entrada.recuperacaoCapital.plus(b.capital);
      entrada.comissao           = entrada.comissao.plus(b.comissao);
      entrada.quantidadeParcelas += 1;
      mapa.set(key, entrada);
    }

    return Array.from(mapa.values()).map((c) => ({
      consultorId:        c.id,
      consultorNome:      c.nome,
      totalRecebido:      c.totalRecebido.toFixed(2),
      faturamentoBruto:   c.faturamentoBruto.toFixed(2),
      recuperacaoCapital: c.recuperacaoCapital.toFixed(2),
      comissao:           c.comissao.toFixed(2),
      lucroLiquido:       c.faturamentoBruto.minus(c.comissao).toFixed(2),
      quantidadeParcelas: c.quantidadeParcelas,
    }));
  }

  async getClientes(): Promise<unknown> {
    const clientes = await this.prisma.client.findMany({
      where: { active: true },
      include: {
        loans: {
          where: { status: 'ativo' },
          include: {
            installments: {
              where: { status: { in: ['pendente', 'atrasado'] } },
              orderBy: { dataVencimento: 'asc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { nome: 'asc' },
    });

    return clientes.map((c) => ({
      id: c.id,
      nome: c.nome,
      cpf: c.cpf,
      whatsapp: c.whatsapp,
      emprestimosAtivos: c.loans.length,
      proximaParcela: c.loans[0]?.installments[0] ?? null,
    }));
  }

  async getEvolucao(meses: number): Promise<unknown> {
    const result: Array<{
      mes: string; label: string
      totalRecebido: number; faturamentoBruto: number; recuperacaoCapital: number
      quantidadeParcelas: number; novosContratos: number
    }> = []
    const hoje = new Date()

    for (let i = meses - 1; i >= 0; i--) {
      const ref   = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0)
      const fim    = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999)
      const mes    = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`
      const label  = ref.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        .replace('.', '').replace(/^(.)/, (c) => c.toUpperCase())

      const [baixas, novosPrestamos] = await Promise.all([
        computeBaixasPeriodo(this.prisma, inicio, fim),
        this.prisma.loan.count({ where: { createdAt: { gte: inicio, lte: fim } } }),
      ])

      const totalRecebido      = baixas.reduce((s, b) => s + b.valorPago, 0)
      const faturamentoBruto   = baixas.reduce((s, b) => s + b.lucro, 0)
      const recuperacaoCapital = baixas.reduce((s, b) => s + b.capital, 0)

      result.push({
        mes,
        label,
        totalRecebido:      parseFloat(totalRecebido.toFixed(2)),
        faturamentoBruto:   parseFloat(faturamentoBruto.toFixed(2)),
        recuperacaoCapital: parseFloat(recuperacaoCapital.toFixed(2)),
        quantidadeParcelas: baixas.length,
        novosContratos:     novosPrestamos,
      })
    }

    return result
  }

  async getContratos(status?: string): Promise<unknown> {
    const where = status
      ? { status: status as 'ativo' | 'quitado' | 'cancelado' | 'inadimplente' }
      : {};
    return this.prisma.loan.findMany({
      where,
      include: {
        client: { select: { nome: true, cpf: true, whatsapp: true } },
        _count: { select: { installments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
