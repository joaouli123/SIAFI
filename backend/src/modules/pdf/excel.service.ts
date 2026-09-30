import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import type { PaymentFilterDto } from '../payments/dto/payment-filter.dto';
import * as ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { dataLocal, fimDoDiaUtc, inicioDoDiaUtc } from '../../common/data';
import { filtroAvalista, filtroCliente } from '../../common/busca';
import type { Response } from 'express';

const BRL = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const DT = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const CPF = (v: string | null | undefined) =>
  v && v.length === 11 ? v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (v ?? '');

// A planilha vai para fora do sistema: 'aguardando_liberacao' nao e rotulo de
// relatorio, e o mesmo texto que a tela mostra evita conferencia cruzada.
const STATUS_LOAN: Record<string, string> = {
  aguardando_aceite: 'Aguardando aceite',
  aguardando_liberacao: 'Aguardando liberacao',
  ativo: 'Ativo',
  inadimplente: 'Inadimplente',
  quitado: 'Quitado',
  cancelado: 'Cancelado',
};

const PERIODICIDADE: Record<string, string> = { mensal: 'Mensal', quinzenal: 'Quinzenal', semanal: 'Semanal' };
// Parcelas semanais/quinzenais ficam prontas mas escondidas ate o cliente contratar.
const PERIODICIDADE_ATIVA = false;

@Injectable()
export class ExcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  // ─── Relatório de Contratos ───────────────────────────────────────────────

  /**
   * O filtro tem que ser o MESMO de LoansService.findAll. Planilha que ignora a
   * busca e o periodo da tela devolve a carteira inteira, e quem exportou so
   * descobre a divergencia depois de mandar o arquivo pra frente.
   */
  async exportarContratos(
    filtros: { status?: string; search?: string; inicioDe?: string; inicioAte?: string },
    res: Response,
  ): Promise<void> {
    const { status, search, inicioDe, inicioAte } = filtros;

    const where: Prisma.LoanWhereInput = {};
    if (status) where.status = status as any;
    if (search) where.client = { OR: filtroCliente(search) };
    if (inicioDe || inicioAte) {
      where.dataInicio = {};
      if (inicioDe) (where.dataInicio as Prisma.DateTimeFilter).gte = inicioDoDiaUtc(inicioDe);
      if (inicioAte) (where.dataInicio as Prisma.DateTimeFilter).lte = fimDoDiaUtc(inicioAte);
    }

    const loans = await this.prisma.loan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { nome: true, cpf: true, whatsapp: true, cidade: true, estado: true } },
        installments: {
          select: { status: true, installmentAmount: true, totalPago: true, dataVencimento: true },
        },
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIAFI — Lidera';
    wb.created = new Date();

    const ws = wb.addWorksheet('Contratos');

    ws.columns = [
      { header: 'Contrato', key: 'id', width: 12 },
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'WhatsApp', key: 'whatsapp', width: 16 },
      { header: 'Cidade', key: 'cidade', width: 20 },
      { header: 'Estado', key: 'estado', width: 8 },
      { header: 'Valor Emprestado', key: 'valor', width: 18 },
      { header: 'Parcelas', key: 'parcelas', width: 10 },
      { header: 'Valor Parcela', key: 'valorParcela', width: 16 },
      { header: 'Total a Pagar', key: 'totalPagar', width: 16 },
      { header: 'Data Início', key: 'dataInicio', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Pagas', key: 'pagas', width: 10 },
      { header: 'Atrasadas', key: 'atrasadas', width: 12 },
      { header: 'Total Recebido', key: 'totalRecebido', width: 16 },
    ];

    this.styleHeader(ws);

    // Valor como TEXTO ('R$ 3.300,00') impede somar, ordenar e filtrar no Excel:
    // quem recebe a planilha tem que redigitar tudo. Vai numero cru com formato.
    const COL_MOEDA = ['valor', 'valorParcela', 'totalPagar', 'totalRecebido'];
    COL_MOEDA.forEach((k) => (ws.getColumn(k).numFmt = 'R$ #,##0.00'));
    ws.getColumn('dataInicio').numFmt = 'dd/mm/yyyy';
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    let somaValor = 0;
    let somaTotalPagar = 0;
    let somaRecebido = 0;

    loans.forEach((l) => {
      const pagas = l.installments.filter((i) => i.status === 'pago').length;
      const atrasadas = l.installments.filter((i) => i.status === 'atrasado').length;
      const totalRecebido = l.installments.reduce((s, i) => s + Number(i.totalPago), 0);
      const valorParcela = Number(l.installments[0]?.installmentAmount ?? 0);
      const totalPagar = l.installments.reduce((s, i) => s + Number(i.installmentAmount), 0);
      const principal = Number(l.principalAmount);

      somaValor += principal;
      somaTotalPagar += totalPagar;
      somaRecebido += totalRecebido;

      ws.addRow({
        id: l.id,
        cpf: CPF(l.client.cpf),
        cliente: l.client.nome,
        whatsapp: l.client.whatsapp ?? '',
        cidade: l.client.cidade ?? '',
        estado: l.client.estado ?? '',
        valor: principal,
        parcelas: l.numeroParcelas,
        valorParcela,
        totalPagar,
        dataInicio: l.dataInicio,
        status: STATUS_LOAN[l.status] ?? l.status,
        pagas,
        atrasadas,
        totalRecebido,
      });
    });

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: ws.columnCount } };

    if (loans.length) {
      ws.addRow({});
      const total = ws.addRow({
        cliente: `TOTAL — ${loans.length} contrato(s)`,
        valor: somaValor,
        totalPagar: somaTotalPagar,
        totalRecebido: somaRecebido,
      });
      total.font = { bold: true };
    }

    this.sendWorkbook(wb, res, `contratos-${Date.now()}.xlsx`);
  }

  // ─── Relatório de Movimentação ────────────────────────────────────────────

  async exportarMovimentacao(startDate: string, endDate: string, res: Response): Promise<void> {
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
            include: { loan: { include: { client: { select: { nome: true } } } } },
          },
        },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIAFI — Lidera';
    wb.created = new Date();

    // Aba: Pagamentos de Parcelas
    const wsPgto = wb.addWorksheet('Pagamentos');
    wsPgto.columns = [
      { header: 'ID Pgto', key: 'id', width: 10 },
      { header: 'Data', key: 'data', width: 14 },
      { header: 'Cliente', key: 'cliente', width: 28 },
      { header: 'Contrato', key: 'contrato', width: 12 },
      { header: 'Parcela', key: 'parcela', width: 10 },
      { header: 'Valor Pago', key: 'valor', width: 16 },
      { header: 'Método', key: 'metodo', width: 16 },
      { header: 'Observação', key: 'obs', width: 30 },
    ];
    this.styleHeader(wsPgto);
    payments.forEach((p) => {
      wsPgto.addRow({
        id: p.id,
        data: DT(p.dataPagamento),
        cliente: p.installment.loan.client.nome,
        contrato: p.installment.loan.id,
        parcela: p.installment.numero,
        valor: BRL(Number(p.valorPago)),
        metodo: p.metodoPagamento,
        obs: p.observacao ?? '',
      });
    });

    // Aba: Caixa / Transações
    const wsTx = wb.addWorksheet('Caixa');
    wsTx.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Data', key: 'data', width: 14 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Valor', key: 'valor', width: 16 },
      { header: 'Descrição', key: 'desc', width: 40 },
      { header: 'Categoria', key: 'cat', width: 24 },
      { header: 'Operador', key: 'op', width: 24 },
    ];
    this.styleHeader(wsTx);
    transactions.forEach((t) => {
      wsTx.addRow({
        id: t.id,
        data: DT(t.data),
        tipo: t.tipo,
        valor: BRL(Number(t.valor)),
        desc: t.descricao,
        cat: t.categoria ?? '',
        op: (t as any).user?.nome ?? '',
      });
    });

    this.sendWorkbook(wb, res, `movimentacao-${Date.now()}.xlsx`);
  }

  // ─── Relatório de Inadimplentes ───────────────────────────────────────────

  async exportarInadimplentes(
    res: Response,
    filtro: {
      search?: string;
      startDate?: string;
      endDate?: string;
      consultorId?: number;
    } = {},
  ): Promise<void> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // Mesmos filtros da tela /inadimplentes: a planilha e a conferencia do que
    // esta na frente do operador, nao a carteira inteira toda vez.
    const where: Prisma.InstallmentWhereInput = { status: 'atrasado' };
    // Busca e consultor caem os dois em where.loan; montar separado evita que o
    // segundo apague o primeiro quando o operador usa os dois ao mesmo tempo.
    const loanWhere: Prisma.LoanWhereInput = {};
    if (filtro.consultorId) loanWhere.client = { consultorId: filtro.consultorId };
    const busca = filtro.search?.trim();
    if (busca) {
      // A tela compara o termo com nome/CPF/telefone ja normalizados no navegador.
      // Reproduzir isso no Prisma nao da: telefone e gravado com espaco e hifen, e
      // 'contains' de digitos nunca casa. Sao ~500 clientes — filtrar em memoria
      // garante que a planilha traga exatamente as mesmas linhas da tela.
      // Sem acento dos dois lados, igual a tela: 42 dos 518 clientes tem acento
      // no nome e o operador digita sem.
      const semAcento = (v: string) =>
        v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const termo = semAcento(busca);
      const digitos = busca.replace(/\D/g, '');
      const clientes = await this.prisma.client.findMany({
        select: { id: true, nome: true, cpf: true, whatsapp: true },
      });
      const ids = clientes
        .filter(
          (c) =>
            semAcento(c.nome ?? '').includes(termo) ||
            (!!digitos &&
              ((c.cpf ?? '').replace(/\D/g, '').includes(digitos) ||
                (c.whatsapp ?? '').replace(/\D/g, '').includes(digitos))),
        )
        .map((c) => c.id);
      loanWhere.clientId = { in: ids };
    }
    if (Object.keys(loanWhere).length) where.loan = loanWhere;
    if (filtro.startDate || filtro.endDate) {
      // A tela lista CONTRATOS e conta o atraso pelo vencimento em aberto mais antigo.
      // Filtrar parcela a parcela responde outra pergunta: no 1o semestre de 2026 a tela
      // mostrava 48 clientes e a planilha trazia 84, porque contratos com atraso mais
      // velho tambem tem parcelas vencendo dentro do periodo. O periodo escolhe os
      // contratos, e a planilha traz todas as parcelas em atraso deles — assim a soma
      // da planilha fecha com o 'Total em Atraso' do card.
      const ini = filtro.startDate ? dataLocal(filtro.startDate) : null;
      const fim = filtro.endDate
        ? new Date(`${filtro.endDate}T23:59:59.999`)
        : null;
      const emAtraso = await this.prisma.installment.findMany({
        where: { status: 'atrasado' },
        select: { loanId: true, dataVencimento: true },
      });
      const maisAntiga = new Map<number, Date>();
      for (const i of emAtraso) {
        const atual = maisAntiga.get(i.loanId);
        if (!atual || i.dataVencimento < atual)
          maisAntiga.set(i.loanId, i.dataVencimento);
      }
      where.loanId = {
        in: [...maisAntiga.entries()]
          .filter(([, d]) => (!ini || d >= ini) && (!fim || d <= fim))
          .map(([loanId]) => loanId),
      };
    }

    const installments = await this.prisma.installment.findMany({
      where,
      orderBy: { dataVencimento: 'asc' },
      include: {
        loan: {
          include: {
            client: {
              select: {
                nome: true,
                cpf: true,
                whatsapp: true,
                cidade: true,
                estado: true,
                consultor: { select: { nome: true } },
                observacoes: true,
                tratativas: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: {
                    canal: true,
                    descricao: true,
                    createdAt: true,
                    user: { select: { nome: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIAFI — Lidera';
    wb.created = new Date();

    const ws = wb.addWorksheet('Inadimplentes');
    ws.columns = [
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'WhatsApp', key: 'tel', width: 16 },
      { header: 'Cidade', key: 'cidade', width: 20 },
      { header: 'Consultor', key: 'consultor', width: 24 },
      { header: 'Contrato', key: 'contrato', width: 12 },
      { header: 'Parcela', key: 'parcela', width: 10 },
      { header: 'Vencimento', key: 'venc', width: 14 },
      { header: 'Dias Atraso', key: 'dias', width: 12 },
      { header: 'Valor', key: 'valor', width: 14 },
      { header: 'Multa', key: 'multa', width: 12 },
      { header: 'Mora', key: 'mora', width: 12 },
      { header: 'Total Devido', key: 'total', width: 14 },
      { header: 'Ultima Tratativa', key: 'tratativaData', width: 14 },
      { header: 'Tratativa', key: 'tratativa', width: 60 },
      { header: 'Observacoes', key: 'obs', width: 40 },
    ];
    this.styleHeader(ws);
    ['valor', 'multa', 'mora', 'total'].forEach((k) => (ws.getColumn(k).numFmt = 'R$ #,##0.00'));
    ws.getColumn('venc').numFmt = 'dd/mm/yyyy';
    ws.getColumn('tratativaData').numFmt = 'dd/mm/yyyy';
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    installments.forEach((inst) => {
      const ultima = inst.loan.client.tratativas[0];
      const venc = new Date(inst.dataVencimento);
      venc.setHours(0, 0, 0, 0);
      const dias = Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
      const saldo = Math.max(0, Number(inst.installmentAmount) - Number(inst.totalPago));
      const total = saldo + Number(inst.valorMulta) + Number(inst.valorMora);

      ws.addRow({
        cpf: CPF(inst.loan.client.cpf),
        cliente: inst.loan.client.nome,
        tel: inst.loan.client.whatsapp ?? '',
        cidade: inst.loan.client.cidade ?? '',
        consultor: inst.loan.client.consultor?.nome ?? '',
        contrato: inst.loan.id,
        parcela: inst.numero,
        venc: inst.dataVencimento,
        dias,
        valor: saldo,
        multa: Number(inst.valorMulta),
        mora: Number(inst.valorMora),
        total,
        tratativaData: ultima?.createdAt ?? null,
        tratativa: ultima
          ? `${ultima.canal} (${ultima.user?.nome ?? ''}): ${ultima.descricao}`
          : '',
        obs: [inst.loan.client.observacoes, inst.loan.observacoes].filter(Boolean).join(' | '),
      });
    });

    this.sendWorkbook(wb, res, `inadimplentes-${Date.now()}.xlsx`);
  }

  // ─── Recebimentos (mesma consulta da tela, sem paginacao) ─────────────────

  async exportarRecebimentos(
    filter: PaymentFilterDto,
    role: string | undefined,
    res: Response,
  ): Promise<void> {
    // Reusa findAll pra que a planilha traga exatamente o que a tela mostra:
    // mesmos filtros, mesma divisao capital/lucro/comissao, mesmos totais.
    const resultado = (await this.payments.findAll(
      { ...filter, page: 1, limit: 100000 },
      role,
    )) as {
      data: Array<{
        id: number;
        valorPago: unknown;
        desconto: unknown;
        dataPagamento: Date;
        metodoPagamento: string;
        contaDestino: string | null;
        observacao: string | null;
        estornado: boolean;
        installment: {
          numero: number;
          dataVencimento: Date;
          loan: {
            id: number;
            client: { nome: string; cpf: string | null; consultor: { nome: string } | null };
          };
        };
        split: {
          capital: number;
          lucro: number;
          comissao: number;
          comissaoAdministrador: number;
          lucroEmpresa: number;
        } | null;
      }>;
      totais?: Record<string, number>;
    };

    const verSplit = role !== 'caixa';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIAFI — Lidera';
    wb.created = new Date();

    const ws = wb.addWorksheet('Recebimentos');
    // Ordem pedida pela administracao (16/09): data do pagamento entre a parcela e
    // o valor, e metodo/conta depois da divisao do lucro, antes da situacao.
    ws.columns = [
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'Cliente', key: 'cliente', width: 32 },
      { header: 'Consultor', key: 'consultor', width: 22 },
      { header: 'Contrato', key: 'contrato', width: 10 },
      { header: 'Vencimento', key: 'vencimento', width: 12 },
      { header: 'Parcela', key: 'parcela', width: 9 },
      { header: 'Data Pagamento', key: 'data', width: 15 },
      { header: 'Valor Pago', key: 'valor', width: 14 },
      { header: 'Desconto', key: 'desconto', width: 12 },
      ...(verSplit
        ? [
            { header: 'Capital', key: 'capital', width: 14 },
            { header: 'Lucro', key: 'lucro', width: 14 },
            { header: 'Comissao Consultor', key: 'comissao', width: 18 },
            { header: 'Comissao Administrador', key: 'comissaoAdm', width: 20 },
            { header: 'Lucro Empresa', key: 'lucroEmpresa', width: 16 },
          ]
        : []),
      { header: 'Metodo Recebimento', key: 'metodo', width: 18 },
      { header: 'Conta Recebedora', key: 'conta', width: 20 },
      { header: 'Situacao', key: 'situacao', width: 12 },
      { header: 'Observacao', key: 'obs', width: 40 },
    ];
    this.styleHeader(ws);
    ['valor', 'desconto', 'capital', 'lucro', 'comissao', 'comissaoAdm', 'lucroEmpresa'].forEach(
      (k) => (ws.getColumn(k).numFmt = 'R$ #,##0.00'),
    );
    ws.getColumn('data').numFmt = 'dd/mm/yyyy';
    ws.getColumn('vencimento').numFmt = 'dd/mm/yyyy';
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (const p of resultado.data) {
      ws.addRow({
        data: p.dataPagamento,
        cpf: CPF(p.installment.loan.client.cpf),
        cliente: p.installment.loan.client.nome,
        consultor: p.installment.loan.client.consultor?.nome ?? '',
        contrato: p.installment.loan.id,
        vencimento: p.installment.dataVencimento,
        parcela: p.installment.numero,
        valor: Number(p.valorPago),
        desconto: Number(p.desconto),
        metodo: p.metodoPagamento,
        conta: p.contaDestino ?? '',
        ...(verSplit && p.split
          ? {
              capital: p.split.capital,
              lucro: p.split.lucro,
              comissao: p.split.comissao,
              comissaoAdm: p.split.comissaoAdministrador,
              lucroEmpresa: p.split.lucroEmpresa,
            }
          : {}),
        situacao: p.estornado ? 'Estornado' : 'Ativo',
        obs: p.observacao ?? '',
      });
    }

    const t = resultado.totais;
    if (t) {
      ws.addRow({});
      const linha = ws.addRow({
        cliente: 'TOTAL DO PERIODO (baixas ativas)',
        valor: t.recebido,
        desconto: t.desconto,
        ...(verSplit
          ? {
              capital: t.capital ?? 0,
              lucro: t.lucro ?? 0,
              comissao: t.comissao ?? 0,
              comissaoAdm: t.comissaoAdministrador ?? 0,
              lucroEmpresa: t.lucroEmpresa ?? 0,
            }
          : {}),
      });
      linha.font = { bold: true };
    }

    this.sendWorkbook(wb, res, `recebimentos-${Date.now()}.xlsx`);
  }

  // ─── Relação de Clientes (mesma consulta da tela, sem paginação) ──────────

  /**
   * O filtro tem que ser o MESMO de ClientsService.findAll — a planilha serve para
   * imprimir a carteira de UM consultor, e exportar a base inteira depois de filtrar
   * na tela obrigaria a refiltrar tudo de novo do outro lado.
   */
  async exportarClientes(
    filtros: { search?: string; status?: string; consultorId?: number; avalista?: string },
    res: Response,
  ): Promise<void> {
    const where: Prisma.ClientWhereInput = {};
    if (filtros.consultorId) where.consultorId = filtros.consultorId;
    if (filtros.status === 'active') where.active = true;
    else if (filtros.status === 'inactive') where.active = false;
    if (filtros.search?.trim()) where.OR = filtroCliente(filtros.search.trim());
    if (filtros.avalista?.trim()) Object.assign(where, filtroAvalista(filtros.avalista));

    const clientes = await this.prisma.client.findMany({
      where,
      orderBy: { nome: 'asc' },
      include: {
        consultor: { select: { nome: true } },
        meusAvalistas: { select: { nome: true }, orderBy: { id: 'asc' } },
        _count: { select: { loans: { where: { status: { not: 'cancelado' } } } } },
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIAFI — Lidera';
    wb.created = new Date();

    const ws = wb.addWorksheet('Clientes');
    ws.columns = [
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'Cliente', key: 'nome', width: 32 },
      { header: 'WhatsApp', key: 'whatsapp', width: 16 },
      { header: 'E-mail', key: 'email', width: 28 },
      { header: 'Cidade', key: 'cidade', width: 20 },
      { header: 'UF', key: 'estado', width: 6 },
      { header: 'Consultor', key: 'consultor', width: 24 },
      { header: 'Avalista', key: 'avalista', width: 30 },
      { header: 'Contratos', key: 'contratos', width: 11 },
      { header: 'Cadastro', key: 'cadastro', width: 14 },
      { header: 'Portal', key: 'portal', width: 12 },
      { header: 'Status', key: 'status', width: 10 },
    ];
    this.styleHeader(ws);
    ws.getColumn('cadastro').numFmt = 'dd/mm/yyyy';
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    clientes.forEach((c) => {
      ws.addRow({
        cpf: CPF(c.cpf),
        nome: c.nome,
        whatsapp: c.whatsapp ?? '',
        email: c.email ?? '',
        cidade: c.cidade ?? '',
        estado: c.estado ?? '',
        consultor: c.consultor?.nome ?? 'Sem consultor',
        avalista: c.meusAvalistas.map((a) => a.nome).join(', '),
        contratos: c._count.loans,
        cadastro: c.createdAt,
        portal: c.portalAtivo ? 'Ativo' : c.supabaseId ? 'Desativado' : 'Sem acesso',
        status: c.active ? 'Ativo' : 'Inativo',
      });
    });

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: ws.columnCount } };

    if (clientes.length) {
      ws.addRow({});
      const total = ws.addRow({
        nome: `TOTAL — ${clientes.length} cliente(s)`,
        contratos: clientes.reduce((s, c) => s + c._count.loans, 0),
      });
      total.font = { bold: true };
    }

    this.sendWorkbook(wb, res, `clientes-${Date.now()}.xlsx`);
  }

  async exportarRenegociacoes(res: Response): Promise<void> {
    const lista = await this.prisma.renegociacao.findMany({
      orderBy: { createdAt: 'desc' },
      include: { loan: { select: { id: true, client: { select: { nome: true, cpf: true } } } } },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIAFI — Lidera';
    wb.created = new Date();
    const ws = wb.addWorksheet('Renegociacoes');
    ws.columns = [
      { header: 'Data', key: 'data', width: 12 },
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'Cliente', key: 'cliente', width: 32 },
      { header: 'Contrato', key: 'contrato', width: 10 },
      { header: 'Valor Total', key: 'valor', width: 16 },
      { header: 'Parcelas', key: 'parcelas', width: 10 },
      ...(PERIODICIDADE_ATIVA ? [{ header: 'Periodicidade', key: 'periodicidade', width: 13 }] : []),
      { header: 'Taxa (% a.m.)', key: 'taxa', width: 13 },
      { header: 'Inicio', key: 'inicio', width: 12 },
      { header: 'Valor Descontado', key: 'desconto', width: 16 },
      { header: 'Motivo', key: 'motivo', width: 28 },
      { header: 'Observacoes', key: 'obs', width: 40 },
    ];
    this.styleHeader(ws);
    ['data', 'inicio'].forEach((k) => (ws.getColumn(k).numFmt = 'dd/mm/yyyy'));
    ['valor', 'desconto'].forEach((k) => (ws.getColumn(k).numFmt = '"R$" #,##0.00'));
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    lista.forEach((r) => {
      ws.addRow({
        data: r.createdAt,
        cpf: CPF(r.loan?.client?.cpf),
        cliente: r.loan?.client?.nome ?? '',
        contrato: r.loanId,
        valor: Number(r.valorTotal),
        parcelas: r.numeroParcelas,
        periodicidade: PERIODICIDADE[r.periodicidade] ?? r.periodicidade,
        taxa: Number(r.taxaJuros),
        inicio: r.dataInicio,
        desconto: r.valorDescontado != null ? Number(r.valorDescontado) : null,
        motivo: r.motivoRenegociacao ?? '',
        obs: r.observacoes ?? '',
      });
    });

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: ws.columnCount } };
    if (lista.length) {
      ws.addRow({});
      const total = ws.addRow({
        cliente: `TOTAL — ${lista.length} renegociacao(oes)`,
        valor: lista.reduce((s, r) => s + Number(r.valorTotal), 0),
        desconto: lista.reduce((s, r) => s + Number(r.valorDescontado ?? 0), 0),
      });
      total.font = { bold: true };
    }

    this.sendWorkbook(wb, res, `renegociacoes-${Date.now()}.xlsx`);
  }

  async exportarReparcelamentos(filtros: { status?: string }, res: Response): Promise<void> {
    const lista = await this.prisma.solicitacaoReparcelamento.findMany({
      where: filtros.status ? { status: filtros.status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { nome: true, cpf: true } },
        consultor: { select: { nome: true } },
        loan: { select: { principalAmount: true, totalReceivable: true, numeroParcelas: true } },
      },
    });

    const TIPO: Record<string, string> = {
      prorrogacao: 'Prorrogacao',
      reducao_parcelas: 'Reducao de parcelas',
      aumento_prazo: 'Aumento de prazo',
    };
    const STATUS: Record<string, string> = {
      pendente: 'Pendente',
      proposta_enviada: 'Proposta enviada',
      aprovado: 'Aprovado (2a instancia)',
      executado: 'Executado',
      rejeitado: 'Rejeitado',
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIAFI — Lidera';
    wb.created = new Date();
    const ws = wb.addWorksheet('Reparcelamentos');
    ws.columns = [
      { header: 'Data', key: 'data', width: 12 },
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'Cliente', key: 'cliente', width: 32 },
      { header: 'Contrato', key: 'contrato', width: 10 },
      { header: 'Consultor', key: 'consultor', width: 24 },
      { header: 'Tipo', key: 'tipo', width: 20 },
      { header: 'Motivo', key: 'motivo', width: 36 },
      { header: 'Capital Original', key: 'capital', width: 16 },
      { header: 'Total Original', key: 'totalOrig', width: 16 },
      { header: 'Parcelas Originais', key: 'parcOrig', width: 12 },
      { header: 'Novo Capital', key: 'novoCapital', width: 16 },
      { header: 'Novo Lucro', key: 'novoLucro', width: 16 },
      { header: 'Novas Parcelas', key: 'novasParc', width: 12 },
      ...(PERIODICIDADE_ATIVA ? [{ header: 'Periodicidade', key: 'novaPer', width: 13 }] : []),
      { header: 'Novo Inicio', key: 'novoInicio', width: 12 },
      { header: 'Novo Contrato', key: 'novoLoan', width: 12 },
      { header: 'Status', key: 'status', width: 22 },
    ];
    this.styleHeader(ws);
    ['data', 'novoInicio'].forEach((k) => (ws.getColumn(k).numFmt = 'dd/mm/yyyy'));
    ['capital', 'totalOrig', 'novoCapital', 'novoLucro'].forEach((k) => (ws.getColumn(k).numFmt = '"R$" #,##0.00'));
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const num = (v: unknown) => (v == null ? null : Number(v));
    lista.forEach((s) => {
      ws.addRow({
        data: s.createdAt,
        cpf: CPF(s.client?.cpf),
        cliente: s.client?.nome ?? '',
        contrato: s.loanId,
        consultor: s.consultor?.nome ?? '',
        tipo: TIPO[s.tipo] ?? s.tipo,
        motivo: s.motivoCliente ?? '',
        capital: num(s.loan?.principalAmount),
        totalOrig: num(s.loan?.totalReceivable),
        parcOrig: s.loan?.numeroParcelas ?? null,
        novoCapital: num(s.novoValorPrincipal),
        novoLucro: num(s.novoTargetProfit),
        novasParc: s.novoNumeroParcelas ?? null,
        novaPer: s.novaPeriodicidade ? PERIODICIDADE[s.novaPeriodicidade] ?? s.novaPeriodicidade : '',
        novoInicio: s.novaDataInicio ?? null,
        novoLoan: s.novoLoanId ?? null,
        status: STATUS[s.status] ?? s.status,
      });
    });

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: ws.columnCount } };
    if (lista.length) {
      ws.addRow({});
      const total = ws.addRow({
        cliente: `TOTAL — ${lista.length} solicitacao(oes)`,
        capital: lista.reduce((t, s) => t + Number(s.loan?.principalAmount ?? 0), 0),
        totalOrig: lista.reduce((t, s) => t + Number(s.loan?.totalReceivable ?? 0), 0),
        novoCapital: lista.reduce((t, s) => t + Number(s.novoValorPrincipal ?? 0), 0),
        novoLucro: lista.reduce((t, s) => t + Number(s.novoTargetProfit ?? 0), 0),
      });
      total.font = { bold: true };
    }

    this.sendWorkbook(wb, res, `reparcelamentos-${Date.now()}.xlsx`);
  }

  // ─── Helper ───────────────────────────────────────────────────────────────

  private styleHeader(ws: ExcelJS.Worksheet) {
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    header.height = 20;
  }

  private async sendWorkbook(wb: ExcelJS.Workbook, res: Response, filename: string) {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  }
}
