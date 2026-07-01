import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PdfService } from '../pdf/pdf.service';
import { Formato, RelCol, RelData } from './relatorios.types';

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

@Injectable()
export class ReportExportService {
  constructor(private readonly pdf: PdfService) {}

  async exportar(data: RelData, formato: Formato): Promise<ExportResult> {
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `${data.key}-${stamp}`;
    switch (formato) {
      case 'pdf':  return { buffer: await this.pdfBuffer(data), contentType: 'application/pdf', filename: `${base}.pdf` };
      case 'xlsx': return { buffer: await this.xlsx(data), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${base}.xlsx` };
      case 'csv':  return { buffer: Buffer.from('﻿' + this.csv(data), 'utf8'), contentType: 'text/csv; charset=utf-8', filename: `${base}.csv` };
      case 'xml':  return { buffer: Buffer.from(this.xml(data), 'utf8'), contentType: 'application/xml; charset=utf-8', filename: `${base}.xml` };
      case 'txt':  return { buffer: Buffer.from(this.txt(data), 'utf8'), contentType: 'text/plain; charset=utf-8', filename: `${base}.txt` };
      case 'html': return { buffer: Buffer.from(this.htmlDoc(data), 'utf8'), contentType: 'text/html; charset=utf-8', filename: `${base}.html` };
    }
  }

  // ─── Formatação de células ──────────────────────────────────────────────────

  private display(value: unknown, tipo?: RelCol['tipo']): string {
    if (value === null || value === undefined || value === '') return tipo && tipo !== 'texto' ? '' : '';
    switch (tipo) {
      case 'moeda':   return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      case 'numero':  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'inteiro': return Number(value).toLocaleString('pt-BR');
      case 'percent': return `${Number(value).toLocaleString('pt-BR')}%`;
      case 'data':    return new Date(value as string).toLocaleDateString('pt-BR');
      default:        return String(value);
    }
  }

  private raw(value: unknown, tipo?: RelCol['tipo']): string {
    if (value === null || value === undefined) return '';
    switch (tipo) {
      case 'moeda':
      case 'numero':  return Number(value).toFixed(2);
      case 'inteiro': return String(Number(value));
      case 'percent': return String(Number(value));
      case 'data':    return new Date(value as string).toISOString().slice(0, 10);
      default:        return String(value);
    }
  }

  // ─── CSV (separador ; — amigável ao Excel pt-BR) ─────────────────────────────

  private csv(d: RelData): string {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const linhas: string[] = [];
    linhas.push(d.colunas.map((c) => esc(c.label)).join(';'));
    for (const row of d.linhas) {
      linhas.push(d.colunas.map((c) => esc(this.raw(row[c.key], c.tipo))).join(';'));
    }
    if (d.totais) {
      linhas.push(d.colunas.map((c) => esc(this.raw(d.totais![c.key], c.tipo))).join(';'));
    }
    return linhas.join('\r\n');
  }

  // ─── XML ─────────────────────────────────────────────────────────────────────

  private xml(d: RelData): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const linhaXml = (row: Record<string, unknown>) =>
      `    <linha>\n` +
      d.colunas.map((c) => `      <${c.key}>${esc(this.raw(row[c.key], c.tipo))}</${c.key}>`).join('\n') +
      `\n    </linha>`;
    const partes = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<relatorio chave="${esc(d.key)}">`,
      `  <titulo>${esc(d.titulo)}</titulo>`,
      d.subtitulo ? `  <subtitulo>${esc(d.subtitulo)}</subtitulo>` : '',
      d.periodo ? `  <periodo>${esc(d.periodo)}</periodo>` : '',
      `  <linhas>`,
      d.linhas.map(linhaXml).join('\n'),
      `  </linhas>`,
      d.totais ? `  <totais>\n` + d.colunas.filter((c) => d.totais![c.key] !== undefined).map((c) => `    <${c.key}>${esc(this.raw(d.totais![c.key], c.tipo))}</${c.key}>`).join('\n') + `\n  </totais>` : '',
      `</relatorio>`,
    ].filter(Boolean);
    return partes.join('\n');
  }

  // ─── TXT (largura fixa, monoespaçado) ────────────────────────────────────────

  private txt(d: RelData): string {
    const cells = (getter: (c: RelCol) => string) => d.colunas.map(getter);
    const headers = cells((c) => c.label);
    const body = d.linhas.map((row) => cells((c) => this.display(row[c.key], c.tipo)));
    const totalRow = d.totais ? cells((c) => this.display(d.totais![c.key], c.tipo)) : null;

    const widths = d.colunas.map((c, i) => {
      const vals = [headers[i], ...body.map((r) => r[i]), ...(totalRow ? [totalRow[i]] : [])];
      return Math.max(...vals.map((v) => v.length));
    });
    const isNum = (c: RelCol) => c.tipo && c.tipo !== 'texto' && c.tipo !== 'data';
    const pad = (s: string, i: number) => isNum(d.colunas[i]) ? s.padStart(widths[i]) : s.padEnd(widths[i]);
    const line = (arr: string[]) => arr.map((s, i) => pad(s, i)).join('  ');

    const out: string[] = [];
    out.push(d.titulo.toUpperCase());
    if (d.subtitulo) out.push(d.subtitulo);
    if (d.periodo) out.push(`Período: ${d.periodo}`);
    out.push(`Gerado em ${new Date().toLocaleString('pt-BR')}`);
    out.push('');
    out.push(line(headers));
    out.push(widths.map((w) => '-'.repeat(w)).join('  '));
    body.forEach((r) => out.push(line(r)));
    if (totalRow) {
      out.push(widths.map((w) => '-'.repeat(w)).join('  '));
      out.push(line(totalRow));
    }
    return out.join('\r\n');
  }

  // ─── Gráfico de barras (SVG, com linha de base no zero) ──────────────────────

  private barChartSvg(d: RelData): string {
    const g = d.grafico!;
    const tipo = d.colunas.find((c) => c.key === g.valorKey)?.tipo;
    const rows = d.linhas.slice(0, 20);
    if (!rows.length) return '';

    const vals = rows.map((r) => Number(r[g.valorKey] ?? 0));
    const maxPos = Math.max(0, ...vals);
    const maxNeg = Math.max(0, ...vals.map((v) => -v));
    const span = maxPos + maxNeg || 1;

    const W = 760, H = 260, padTop = 28, padBottom = 56, padX = 10;
    const plotW = W - padX * 2;
    const plotH = H - padTop - padBottom;
    const zeroY = padTop + (maxPos / span) * plotH;
    const slot = plotW / rows.length;
    const bw = Math.max(6, Math.min(60, slot * 0.6));
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const trunc = (s: string) => (s.length > 12 ? s.slice(0, 11) + '…' : s);

    let svg = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="font-family:Arial,sans-serif">`;
    svg += `<line x1="${padX}" y1="${zeroY}" x2="${W - padX}" y2="${zeroY}" stroke="#9ca3af" stroke-width="1"/>`;
    rows.forEach((r, i) => {
      const v = vals[i];
      const h = (Math.abs(v) / span) * plotH;
      const x = padX + slot * i + (slot - bw) / 2;
      const y = v >= 0 ? zeroY - h : zeroY;
      const cor = v >= 0 ? '#1e40af' : '#dc2626';
      svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="2" fill="${cor}"/>`;
      // valor acima/abaixo da barra
      const valTxt = this.display(v, tipo);
      const vy = v >= 0 ? y - 4 : y + h + 11;
      svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${vy.toFixed(1)}" font-size="9" fill="#374151" text-anchor="middle">${esc(valTxt)}</text>`;
      // rótulo da categoria
      const lbl = esc(trunc(String(r[g.categoriaKey] ?? '')));
      svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${(H - padBottom + 16).toFixed(1)}" font-size="9" fill="#6b7280" text-anchor="end" transform="rotate(-35 ${(x + bw / 2).toFixed(1)} ${(H - padBottom + 16).toFixed(1)})">${lbl}</text>`;
    });
    svg += `</svg>`;
    return `<div class="grafico"><p class="grafico-titulo">${esc(g.titulo)}</p>${svg}</div>`;
  }

  // ─── HTML (tabela renderizada) ───────────────────────────────────────────────

  private tabelaHtml(d: RelData): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const align = (c: RelCol) => (c.tipo && c.tipo !== 'texto' && c.tipo !== 'data' ? 'right' : 'left');
    const th = d.colunas.map((c) => `<th style="text-align:${align(c)}">${esc(c.label)}</th>`).join('');
    const trs = d.linhas.map((row) =>
      `<tr>${d.colunas.map((c) => `<td style="text-align:${align(c)}">${esc(this.display(row[c.key], c.tipo))}</td>`).join('')}</tr>`,
    ).join('');
    const tfoot = d.totais
      ? `<tfoot><tr>${d.colunas.map((c) => `<td style="text-align:${align(c)}"><strong>${esc(this.display(d.totais![c.key], c.tipo))}</strong></td>`).join('')}</tr></tfoot>`
      : '';
    const resumo = d.resumo?.length
      ? `<div class="resumo">${d.resumo.map((r) => `<div class="kpi"><span class="kpi-label">${esc(r.label)}</span><span class="kpi-valor">${esc(r.valor)}</span></div>`).join('')}</div>`
      : '';
    const grafico = d.grafico ? this.barChartSvg(d) : '';
    return `${resumo}${grafico}<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody>${tfoot}</table>`;
  }

  private htmlDoc(d: RelData): string {
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${d.titulo}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 8px; }
  thead th { background: #1e40af; color: #fff; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tfoot td { background: #eef2ff; }
  .resumo { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 14px; }
  .kpi-label { display: block; color: #6b7280; font-size: 11px; }
  .kpi-valor { font-size: 16px; font-weight: bold; }
  .grafico { margin: 8px 0 20px; }
  .grafico-titulo { font-size: 13px; font-weight: bold; margin-bottom: 4px; }
</style></head><body>
<h1>${d.titulo}</h1>
<div class="sub">${[d.subtitulo, d.periodo ? `Período: ${d.periodo}` : '', `Gerado em ${new Date().toLocaleString('pt-BR')}`].filter(Boolean).join(' · ')}</div>
${this.tabelaHtml(d)}
</body></html>`;
  }

  // ─── PDF (HTML + identidade visual da empresa via PdfService) ─────────────────

  private async pdfBuffer(d: RelData): Promise<Buffer> {
    const corpo = `
      <style>
        table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 8px; }
        th, td { border: 1px solid #d1d5db; padding: 4px 6px; }
        thead th { background: #1e40af; color: #fff; }
        tbody tr:nth-child(even) { background: #f3f4f6; }
        tfoot td { background: #eef2ff; font-weight: bold; }
        .resumo { display: flex; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
        .kpi { border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 10px; }
        .kpi-label { display: block; color: #6b7280; font-size: 9px; }
        .kpi-valor { font-size: 13px; font-weight: bold; }
        .grafico { margin: 6px 0 14px; }
        .grafico-titulo { font-size: 11px; font-weight: bold; margin-bottom: 2px; }
      </style>
      ${this.tabelaHtml(d)}
    `;
    const html = await this.pdf.montarHtml(corpo, {
      titulo: d.titulo,
      subtitulo: [d.subtitulo, d.periodo ? `Período: ${d.periodo}` : ''].filter(Boolean).join(' · ') || undefined,
    });
    return this.pdf.gerarBuffer(html);
  }

  // ─── XLSX ──────────────────────────────────────────────────────────────────

  private async xlsx(d: RelData): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIAFI — Lidera';
    wb.created = new Date();
    const ws = wb.addWorksheet(d.titulo.slice(0, 28));

    ws.columns = d.colunas.map((c) => ({
      header: c.label,
      key: c.key,
      width: Math.max(12, Math.min(40, c.label.length + 4)),
    }));

    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    header.alignment = { vertical: 'middle', horizontal: 'center' };

    const cellValue = (value: unknown, tipo?: RelCol['tipo']) => {
      if (value === null || value === undefined || value === '') return null;
      if (tipo === 'moeda' || tipo === 'numero' || tipo === 'inteiro') return Number(value);
      if (tipo === 'percent') return `${Number(value)}%`;
      if (tipo === 'data') return new Date(value as string);
      return String(value);
    };

    for (const row of d.linhas) {
      const r: Record<string, unknown> = {};
      d.colunas.forEach((c) => (r[c.key] = cellValue(row[c.key], c.tipo)));
      ws.addRow(r);
    }
    if (d.totais) {
      const r: Record<string, unknown> = {};
      d.colunas.forEach((c) => (r[c.key] = cellValue(d.totais![c.key], c.tipo)));
      const totalRow = ws.addRow(r);
      totalRow.font = { bold: true };
    }

    // Formatos numéricos por coluna
    d.colunas.forEach((c, idx) => {
      const col = ws.getColumn(idx + 1);
      if (c.tipo === 'moeda') col.numFmt = 'R$ #,##0.00';
      else if (c.tipo === 'numero') col.numFmt = '#,##0.00';
      else if (c.tipo === 'inteiro') col.numFmt = '#,##0';
      else if (c.tipo === 'data') col.numFmt = 'dd/mm/yyyy';
    });

    const ab = await wb.xlsx.writeBuffer();
    return Buffer.from(ab);
  }

  // ─── ZIP de vários relatórios no mesmo formato ───────────────────────────────

  async zip(datas: RelData[], formato: Formato): Promise<ExportResult> {
    const zip = new JSZip();
    for (const d of datas) {
      const { buffer, filename } = await this.exportar(d, formato);
      zip.file(filename, buffer);
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const stamp = new Date().toISOString().slice(0, 10);
    return { buffer, contentType: 'application/zip', filename: `relatorios-${formato}-${stamp}.zip` };
  }
}
