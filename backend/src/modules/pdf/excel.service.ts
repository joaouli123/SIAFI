import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import type { Response } from 'express';

const BRL = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const DT = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

@Injectable()
export class ExcelService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Relatório de Contratos ───────────────────────────────────────────────

  async exportarContratos(status: string | undefined, res: Response): Promise<void> {
    const loans = await this.prisma.loan.findMany({
      where: status ? { status: status as any } : undefined,
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
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'CPF', key: 'cpf', width: 16 },
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

    loans.forEach((l) => {
      const pagas = l.installments.filter((i) => i.status === 'pago').length;
      const atrasadas = l.installments.filter((i) => i.status === 'atrasado').length;
      const totalRecebido = l.installments.reduce((s, i) => s + Number(i.totalPago), 0);
      const valorParcela = l.installments[0]?.installmentAmount ?? 0;
      const totalPagar = l.installments.reduce((s, i) => s + Number(i.installmentAmount), 0);

      ws.addRow({
        id: l.id,
        cliente: l.client.nome,
        cpf: l.client.cpf ?? '',
        whatsapp: l.client.whatsapp ?? '',
        cidade: l.client.cidade ?? '',
        estado: l.client.estado ?? '',
        valor: BRL(Number(l.principalAmount)),
        parcelas: l.numeroParcelas,
        valorParcela: BRL(Number(valorParcela)),
        totalPagar: BRL(totalPagar),
        dataInicio: DT(l.dataInicio),
        status: l.status,
        pagas,
        atrasadas,
        totalRecebido: BRL(totalRecebido),
      });
    });

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

  async exportarInadimplentes(res: Response): Promise<void> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const installments = await this.prisma.installment.findMany({
      where: { status: 'atrasado' },
      orderBy: { dataVencimento: 'asc' },
      include: {
        loan: {
          include: {
            client: {
              select: { nome: true, cpf: true, whatsapp: true, cidade: true, estado: true },
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
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'WhatsApp', key: 'tel', width: 16 },
      { header: 'Cidade', key: 'cidade', width: 20 },
      { header: 'Contrato', key: 'contrato', width: 12 },
      { header: 'Parcela', key: 'parcela', width: 10 },
      { header: 'Vencimento', key: 'venc', width: 14 },
      { header: 'Dias Atraso', key: 'dias', width: 12 },
      { header: 'Valor', key: 'valor', width: 14 },
      { header: 'Multa', key: 'multa', width: 12 },
      { header: 'Mora', key: 'mora', width: 12 },
      { header: 'Total Devido', key: 'total', width: 14 },
    ];
    this.styleHeader(ws);

    installments.forEach((inst) => {
      const venc = new Date(inst.dataVencimento);
      venc.setHours(0, 0, 0, 0);
      const dias = Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
      const saldo = Math.max(0, Number(inst.installmentAmount) - Number(inst.totalPago));
      const total = saldo + Number(inst.valorMulta) + Number(inst.valorMora);

      ws.addRow({
        cliente: inst.loan.client.nome,
        cpf: inst.loan.client.cpf ?? '',
        tel: inst.loan.client.whatsapp ?? '',
        cidade: inst.loan.client.cidade ?? '',
        contrato: inst.loan.id,
        parcela: inst.numero,
        venc: DT(inst.dataVencimento),
        dias,
        valor: BRL(saldo),
        multa: BRL(Number(inst.valorMulta)),
        mora: BRL(Number(inst.valorMora)),
        total: BRL(total),
      });
    });

    this.sendWorkbook(wb, res, `inadimplentes-${Date.now()}.xlsx`);
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
