import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { EmpresaConfigService } from '../empresa/empresa-config.service';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';

// puppeteer 25 e ESM-only (nao publica build CommonJS). O Nest compila para
// CommonJS, entao um import estatico vira require() e derruba o processo no
// boot com ERR_REQUIRE_ESM. Carrega sob demanda, so quando um PDF e gerado.
type Puppeteer = typeof import('puppeteer').default;
let puppeteerCache: Promise<Puppeteer> | undefined;
function carregarPuppeteer(): Promise<Puppeteer> {
  puppeteerCache ??= import('puppeteer').then((m) => m.default);
  return puppeteerCache;
}

// ─── Formatadores ────────────────────────────────────────────────────────────

function fmt(v: number | string | null | undefined): string {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// ─── Serviço ─────────────────────────────────────────────────────────────────

@Injectable()
export class PdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly empresaConfig: EmpresaConfigService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // NOVO SISTEMA — Puppeteer + HTML
  // ═══════════════════════════════════════════════════════════════════════════

  /** Gera buffer PDF a partir de HTML usando Puppeteer */
  async gerarBuffer(html: string): Promise<Buffer> {
    // On Windows Server the NSSM service may run as SYSTEM (different home dir).
    // Enumerate known Administrator cache paths so Chrome is always found.
    const { existsSync } = await import('fs');
    const candidatos = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      'C:\\Users\\Administrator\\.cache\\puppeteer\\chrome\\win64-148.0.7778.167\\chrome-win64\\chrome.exe',
      'C:\\Users\\Administrator\\.cache\\puppeteer\\chrome\\win64-131.0.6778.204\\chrome-win64\\chrome.exe',
    ].filter(Boolean) as string[];
    const executablePath = candidatos.find(p => existsSync(p));

    const puppeteer = await carregarPuppeteer();
    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format:          'A4',
        printBackground: true,
        margin:          { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  /** Monta HTML completo com cabeçalho e rodapé da empresa */
  async montarHtml(corpo: string, opcoes: {
    titulo:       string
    subtitulo?:   string
    dataGeracao?: Date
    numeroPagina?: number
    totalPaginas?: number
  }): Promise<string> {
    const e      = await this.empresaConfig.get();
    const rodape = await this.empresaConfig.getRodapePdf();
    const data   = opcoes.dataGeracao ?? new Date();

    const logoHtml = e.logoBase64
      ? `<img src="${e.logoBase64}" alt="${e.nomeFantasia || e.nome}" class="logo">`
      : e.logoUrl
        ? `<img src="${e.logoUrl}" alt="${e.nomeFantasia || e.nome}" class="logo">`
        : `<span class="logo-texto">${e.nomeFantasia || e.nome}</span>`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
    color: ${e.corTexto};
    background: #ffffff;
    line-height: 1.5;
  }

  /* ── CABEÇALHO ─────────────────────────────────────────────── */
  .cabecalho {
    background-color: ${e.corPrimaria};
    color: #ffffff;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 22px;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  .cabecalho-esq { display: flex; align-items: center; gap: 12px; }
  .logo { height: 40px; object-fit: contain; }
  .logo-texto { font-size: 16pt; font-weight: 700; color: #fff; }
  .cabecalho-titulo { font-size: 13pt; font-weight: 700; color: #fff; line-height: 1.2; }
  .cabecalho-subtitulo { font-size: 9.5pt; color: rgba(255,255,255,0.85); margin-top: 2px; }
  .cabecalho-dir { text-align: right; font-size: 9pt; color: rgba(255,255,255,0.82); }
  .cabecalho-dir strong { color: #fff; }

  /* ── CORPO ─────────────────────────────────────────────────── */
  .corpo { padding: 0 2px; }

  /* ── SEÇÃO ─────────────────────────────────────────────────── */
  .secao-titulo {
    font-size: 11pt; font-weight: 700; color: ${e.corPrimaria};
    border-bottom: 2px solid ${e.corPrimaria};
    padding-bottom: 4px; margin: 20px 0 12px;
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }

  /* ── TABELAS ────────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9.5pt; }
  thead tr {
    background-color: ${e.corPrimaria}; color: #ffffff;
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }
  thead th { padding: 7px 9px; text-align: left; font-weight: 600; }
  tbody tr:nth-child(even) { background-color: rgba(0,0,0,0.03); }
  tbody td { padding: 6px 9px; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
  tfoot td { padding: 7px 9px; font-weight: 700; border-top: 2px solid ${e.corPrimaria}; }

  /* ── CARDS / CAIXAS ─────────────────────────────────────────── */
  .card { border: 1px solid #e2e2e2; border-radius: 5px; padding: 12px 16px; margin: 10px 0; }
  .card-titulo {
    font-size: 9pt; font-weight: 700; color: ${e.corPrimaria};
    text-transform: uppercase; letter-spacing: 0.5px;
    margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid ${e.corPrimaria};
  }
  .destaque {
    background-color: rgba(0,0,0,0.04);
    border-left: 4px solid ${e.corPrimaria};
    padding: 10px 14px; margin: 10px 0; border-radius: 0 4px 4px 0;
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }

  /* ── GRIDS ─────────────────────────────────────────────────── */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; }

  /* ── CAMPOS ────────────────────────────────────────────────── */
  .campo { margin-bottom: 7px; }
  .campo-label {
    font-size: 8.5pt; font-weight: 700; color: #73726c;
    text-transform: uppercase; letter-spacing: 0.4px;
  }
  .campo-valor { font-size: 10.5pt; color: ${e.corTexto}; margin-top: 1px; }
  .campo-valor-grande { font-size: 16pt; font-weight: 700; color: ${e.corPrimaria}; }

  /* ── BADGES ────────────────────────────────────────────────── */
  .badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 8.5pt; font-weight: 700; }
  .badge-ativo        { background:#dcfce7; color:#166534; }
  .badge-pago         { background:#dcfce7; color:#166534; }
  .badge-quitado      { background:#dbeafe; color:#1e40af; }
  .badge-pendente     { background:#f3f4f6; color:#374151; }
  .badge-atrasado     { background:#fee2e2; color:#991b1b; }
  .badge-inadimplente { background:#fee2e2; color:#991b1b; }
  .badge-cancelado    { background:#f3f4f6; color:#6b7280; }
  .badge-parcial      { background:#fef3c7; color:#92400e; }

  /* ── ASSINATURA ────────────────────────────────────────────── */
  .area-assinatura { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 44px; }
  .linha-assinatura { border-top: 1px solid #333; padding-top: 6px; text-align: center; font-size: 9.5pt; }

  /* ── QUEBRA DE PÁGINA ──────────────────────────────────────── */
  .quebra-pagina { page-break-before: always; }
  .sem-quebra    { page-break-inside: avoid; }

  /* ── RODAPÉ ────────────────────────────────────────────────── */
  .rodape {
    margin-top: 28px; padding-top: 9px;
    border-top: 2px solid ${e.corPrimaria};
    display: flex; justify-content: space-between; align-items: flex-end;
    font-size: 8.5pt; color: #73726c;
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }
  .rodape-nome { font-weight: 700; color: ${e.corTexto}; margin-bottom: 2px; font-size: 9pt; }
  .rodape-pagina { text-align: right; white-space: nowrap; margin-left: 20px; flex-shrink: 0; }
</style>
</head>
<body>

  <div class="cabecalho">
    <div class="cabecalho-esq">
      ${logoHtml}
      <div>
        <div class="cabecalho-titulo">${opcoes.titulo}</div>
        ${opcoes.subtitulo ? `<div class="cabecalho-subtitulo">${opcoes.subtitulo}</div>` : ''}
      </div>
    </div>
    <div class="cabecalho-dir">
      Gerado em<br>
      <strong>${fmtDateTime(data)}</strong>
    </div>
  </div>

  <div class="corpo">
    ${corpo}
  </div>

  <div class="rodape">
    <div>
      <div class="rodape-nome">${e.nomeFantasia || e.nome}</div>
      <div>${rodape}</div>
    </div>
    ${opcoes.numeroPagina !== undefined
      ? `<div class="rodape-pagina">Página ${opcoes.numeroPagina} de ${opcoes.totalPaginas ?? 1}</div>`
      : ''}
  </div>

</body>
</html>`;
  }

  /** Método principal: monta HTML e gera buffer */
  async gerar(corpo: string, opcoes: {
    titulo:       string
    subtitulo?:   string
    dataGeracao?: Date
    numeroPagina?: number
    totalPaginas?: number
  }): Promise<Buffer> {
    const html = await this.montarHtml(corpo, opcoes);
    return this.gerarBuffer(html);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PDFs DOS DOCUMENTOS — Puppeteer + HTML
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── B1: Contrato de Empréstimo ───────────────────────────────────────────

  async gerarContratoPdf(loanId: number): Promise<Buffer> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        client: {
          select: {
            nome: true, cpf: true, rg: true, endereco: true,
            bairro: true, cidade: true, estado: true, cep: true,
          },
        },
        installments: {
          orderBy: { numero: 'asc' },
          select: {
            numero: true, installmentAmount: true,
            dataVencimento: true, status: true,
          },
        },
      },
    });
    if (!loan) throw new NotFoundException('Contrato não encontrado.');

    const e = await this.empresaConfig.get();

    const valorParcela = loan.installments[0]?.installmentAmount ?? 0;
    const totalPagar   = loan.installments.reduce((s, i) => s + Number(i.installmentAmount), 0);

    const endEmpresa   = [e.logradouro, e.numero, e.bairro, `${e.cidade}/${e.estado}`].filter(Boolean).join(', ');
    const endCliente   = [loan.client.endereco, loan.client.bairro, loan.client.cidade, loan.client.estado].filter(Boolean).join(', ');

    const statusLabel: Record<string, string> = {
      pendente: 'Pendente', pago: 'Pago', atrasado: 'Em atraso',
      cancelado: 'Cancelado', parcialmente_pago: 'Parcial',
    };
    const badgeClass: Record<string, string> = {
      pendente: 'badge-pendente', pago: 'badge-pago', atrasado: 'badge-atrasado',
      cancelado: 'badge-cancelado', parcialmente_pago: 'badge-parcial',
    };

    const linhasParcelas = loan.installments.map(i => `
      <tr>
        <td style="text-align:center">${i.numero}</td>
        <td>${fmtDate(i.dataVencimento)}</td>
        <td style="text-align:right">${fmt(Number(i.installmentAmount))}</td>
        <td><span class="badge ${badgeClass[i.status] ?? 'badge-pendente'}">${statusLabel[i.status] ?? i.status}</span></td>
      </tr>`).join('');

    const clausulas = [
      `1. O DEVEDOR se compromete a pagar as parcelas nas datas de vencimento indicadas.`,
      `2. O atraso sujeita o DEVEDOR a multa de ${Number(loan.multaPercentual ?? 2).toFixed(2)}% sobre o valor da parcela, acrescida de mora de ${Number(loan.moraDiariaPercentual ?? 0.0333).toFixed(4)}% ao dia sobre o saldo devedor, proporcional aos dias de atraso.`,
      `3. O CREDOR poderá exigir antecipação do vencimento das demais parcelas em caso de inadimplência superior a 30 dias.`,
      `4. Este contrato é celebrado em conformidade com o Código Civil Brasileiro e demais legislações aplicáveis.`,
      `5. As partes elegem o foro da comarca do CREDOR para dirimir quaisquer controvérsias.`,
    ];
    if (e.clausulasAdicionais) clausulas.push(e.clausulasAdicionais);

    const aceiteNota = loan.aceiteClienteEm
      ? `<p style="margin-top:20px;font-size:8.5pt;color:#73726c;text-align:center">
           Aceite digital registrado em ${fmtDateTime(loan.aceiteClienteEm)}<br>
           ${loan.aceiteClienteIp ? `IP: ${loan.aceiteClienteIp} · ` : ''}Hash SHA-256: ${(loan.aceiteClienteHash ?? '').substring(0, 16)}...
         </p>`
      : '';

    const corpo = `
      <div class="secao-titulo">PARTES CONTRATANTES</div>
      <div class="grid-2">
        <div class="card">
          <div class="card-titulo">Credor</div>
          <div class="campo"><div class="campo-label">Razão Social</div>
            <div class="campo-valor">${e.nomeFantasia || e.nome}</div></div>
          ${e.cnpj ? `<div class="campo"><div class="campo-label">CNPJ</div>
            <div class="campo-valor">${e.cnpj}</div></div>` : ''}
          ${endEmpresa ? `<div class="campo"><div class="campo-label">Endereço</div>
            <div class="campo-valor">${endEmpresa}</div></div>` : ''}
          ${e.telefone ? `<div class="campo"><div class="campo-label">Telefone</div>
            <div class="campo-valor">${e.telefone}</div></div>` : ''}
        </div>
        <div class="card">
          <div class="card-titulo">Devedor</div>
          <div class="campo"><div class="campo-label">Nome</div>
            <div class="campo-valor">${loan.client.nome}</div></div>
          <div class="campo"><div class="campo-label">CPF</div>
            <div class="campo-valor">${loan.client.cpf ?? '—'}</div></div>
          ${loan.client.rg ? `<div class="campo"><div class="campo-label">RG</div>
            <div class="campo-valor">${loan.client.rg}</div></div>` : ''}
          ${endCliente ? `<div class="campo"><div class="campo-label">Endereço</div>
            <div class="campo-valor">${endCliente}</div></div>` : ''}
        </div>
      </div>

      <div class="secao-titulo">CONDIÇÕES DO EMPRÉSTIMO</div>
      <div class="destaque">
        <div class="grid-4">
          <div class="campo"><div class="campo-label">Capital emprestado</div>
            <div class="campo-valor-grande">${fmt(Number(loan.principalAmount))}</div></div>
          <div class="campo"><div class="campo-label">Total a pagar</div>
            <div class="campo-valor-grande">${fmt(totalPagar)}</div></div>
          <div class="campo"><div class="campo-label">Parcelas</div>
            <div class="campo-valor-grande">${loan.numeroParcelas}x</div></div>
          <div class="campo"><div class="campo-label">Valor da parcela</div>
            <div class="campo-valor-grande">${fmt(Number(valorParcela))}</div></div>
        </div>
      </div>
      <div class="grid-4" style="margin-top:8px">
        <div class="campo"><div class="campo-label">Contrato nº</div>
          <div class="campo-valor">#${String(loan.id).padStart(4, '0')}</div></div>
        <div class="campo"><div class="campo-label">Data de início</div>
          <div class="campo-valor">${fmtDate(loan.dataInicio)}</div></div>
        ${loan.taxaJuros != null ? `<div class="campo"><div class="campo-label">Taxa de juros</div>
          <div class="campo-valor">${Number(loan.taxaJuros).toFixed(2)}% a.m.</div></div>` : '<div></div>'}
        <div class="campo"><div class="campo-label">Método de pagamento</div>
          <div class="campo-valor">${loan.metodoPagamento ?? '—'}</div></div>
      </div>

      <div class="secao-titulo">PLANO DE PAGAMENTO</div>
      <table>
        <thead>
          <tr>
            <th style="width:50px;text-align:center">Nº</th>
            <th>Vencimento</th>
            <th style="text-align:right">Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${linhasParcelas}</tbody>
        <tfoot>
          <tr>
            <td colspan="2">Total</td>
            <td style="text-align:right">${fmt(totalPagar)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div class="secao-titulo">CLÁUSULAS</div>
      ${clausulas.map(c => `<p style="margin-bottom:8px;font-size:9.5pt;text-align:justify">${c}</p>`).join('')}

      <div class="area-assinatura sem-quebra">
        <div class="linha-assinatura">
          ${e.cidade ? `${e.cidade}/${e.estado}, ___/___/_______` : '___/___/_______'}<br><br>
          <strong>${e.nomeFantasia || e.nome}</strong><br>
          ${e.cnpj ? `CNPJ: ${e.cnpj}` : 'CREDOR'}
        </div>
        <div class="linha-assinatura">
          <br><br>
          <strong>${loan.client.nome}</strong><br>
          CPF: ${loan.client.cpf ?? '—'}
        </div>
      </div>
      ${aceiteNota}
    `;

    return this.gerar(corpo, {
      titulo:    `Contrato de Empréstimo`,
      subtitulo: `Nº ${String(loanId).padStart(4, '0')} · ${loan.client.nome}`,
    });
  }

  // ─── B2: Recibo de Pagamento ──────────────────────────────────────────────

  async gerarReciboPdf(paymentId: number): Promise<Buffer> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        installment: {
          include: {
            loan: { include: { client: { select: { nome: true, cpf: true } } } },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');

    const inst = payment.installment;
    const loan = inst.loan;

    const hashCurto = createHash('sha256')
      .update(`${payment.id}|${payment.valorPago}|${payment.dataPagamento}`)
      .digest('hex')
      .substring(0, 12);

    const metodoLabel: Record<string, string> = {
      dinheiro: 'Dinheiro', pix: 'PIX', mercadopago: 'Mercado Pago',
      transferencia: 'Transferência', cheque: 'Cheque', cartao: 'Cartão',
    };

    const corpo = `
      <div style="text-align:center;margin:16px 0 24px">
        <div style="font-size:9pt;color:#73726c;text-transform:uppercase;letter-spacing:1px">Recibo de Pagamento</div>
        <div style="font-size:26pt;font-weight:700;color:var(--cor-primaria, #185FA5);line-height:1.1">
          #${String(paymentId).padStart(6, '0')}
        </div>
      </div>

      <div class="destaque" style="margin-bottom:20px">
        <div class="campo-label">Valor pago</div>
        <div class="campo-valor-grande">${fmt(Number(payment.valorPago))}</div>
      </div>

      <div class="grid-2">
        <div class="campo"><div class="campo-label">Cliente</div>
          <div class="campo-valor">${loan.client.nome}</div></div>
        <div class="campo"><div class="campo-label">CPF</div>
          <div class="campo-valor">${loan.client.cpf ?? '—'}</div></div>
        <div class="campo"><div class="campo-label">Contrato</div>
          <div class="campo-valor">#${String(loan.id).padStart(4, '0')}</div></div>
        <div class="campo"><div class="campo-label">Parcela</div>
          <div class="campo-valor">${inst.numero} de ${loan.numeroParcelas}</div></div>
        <div class="campo"><div class="campo-label">Vencimento da parcela</div>
          <div class="campo-valor">${fmtDate(inst.dataVencimento)}</div></div>
        <div class="campo"><div class="campo-label">Data do pagamento</div>
          <div class="campo-valor">${fmtDate(payment.dataPagamento)}</div></div>
        <div class="campo"><div class="campo-label">Método</div>
          <div class="campo-valor">${metodoLabel[payment.metodoPagamento] ?? payment.metodoPagamento}</div></div>
        ${Number(payment.desconto) > 0 ? `
        <div class="campo"><div class="campo-label">Desconto concedido (${payment.descontoTipo === 'encargos' ? 'encargos' : 'saldo'})</div>
          <div class="campo-valor">${fmt(Number(payment.desconto))}</div></div>` : ''}
        <div class="campo"><div class="campo-label">Autenticidade</div>
          <div class="campo-valor" style="font-family:monospace;font-size:9pt">${hashCurto}...</div></div>
      </div>

      ${payment.observacao ? `
        <div class="destaque" style="margin-top:14px">
          <div class="campo-label">Observação</div>
          <div class="campo-valor">${payment.observacao}</div>
        </div>` : ''}

      <p style="margin-top:24px;font-size:10.5pt;text-align:justify;line-height:1.6">
        Declaro haver recebido de <strong>${loan.client.nome}</strong>
        (CPF: ${loan.client.cpf ?? '—'}) a quantia de
        <strong>${fmt(Number(payment.valorPago))}</strong>,
        referente ao pagamento da parcela <strong>${inst.numero}/${loan.numeroParcelas}</strong>
        do contrato nº <strong>${String(loan.id).padStart(4, '0')}</strong>,
        com vencimento em ${fmtDate(inst.dataVencimento)}.
        Pagamento realizado por ${metodoLabel[payment.metodoPagamento] ?? payment.metodoPagamento}.
      </p>

      <div class="area-assinatura sem-quebra" style="margin-top:36px">
        <div class="linha-assinatura">
          <br>
          Credor — Setor Financeiro
        </div>
        <div class="linha-assinatura">
          <br>
          ${loan.client.nome}
        </div>
      </div>
    `;

    return this.gerar(corpo, {
      titulo:    'Recibo de Pagamento',
      subtitulo: `${loan.client.nome} · ${fmtDate(payment.dataPagamento)}`,
    });
  }

  // ─── B3: Extrato do Cliente ───────────────────────────────────────────────

  async gerarExtratoPdf(clientId: number): Promise<Buffer> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        loans: {
          orderBy: { id: 'desc' },
          include: {
            installments: {
              orderBy: { numero: 'asc' },
              include: { payments: { where: { estornado: false } } },
            },
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    const statusLoanLabel: Record<string, string> = {
      ativo: 'Ativo', quitado: 'Quitado', cancelado: 'Cancelado',
      aguardando_aceite: 'Ag. Aceite', aguardando_liberacao: 'Ag. Liberação',
      inadimplente: 'Inadimplente',
    };
    const badgeLoan: Record<string, string> = {
      ativo: 'badge-ativo', quitado: 'badge-quitado', cancelado: 'badge-cancelado',
      aguardando_aceite: 'badge-pendente', aguardando_liberacao: 'badge-pendente',
      inadimplente: 'badge-inadimplente',
    };
    const badgeInst: Record<string, string> = {
      pendente: 'badge-pendente', pago: 'badge-pago', atrasado: 'badge-atrasado',
      cancelado: 'badge-cancelado', parcialmente_pago: 'badge-parcial',
    };
    const instLabel: Record<string, string> = {
      pendente: 'Pendente', pago: 'Pago', atrasado: 'Atrasado',
      cancelado: 'Cancelado', parcialmente_pago: 'Parcial',
    };
    const metodoLabel: Record<string, string> = {
      dinheiro: 'Dinheiro', pix: 'PIX', mercadopago: 'Mercado Pago',
      transferencia: 'Transf.', cheque: 'Cheque', cartao: 'Cartão',
    };

    // Totalizadores
    let totalEmprestado = 0;
    let totalPago = 0;
    let saldoDevedor = 0;
    const contratosAtivos = client.loans.filter(l => l.status === 'ativo').length;
    const todosPageamentos: Array<{ data: Date; loanId: number; parcela: number; valor: number; metodo: string }> = [];

    for (const loan of client.loans) {
      if (!['cancelado'].includes(loan.status)) {
        totalEmprestado += Number(loan.principalAmount);
      }
      for (const inst of loan.installments) {
        for (const p of inst.payments) {
          totalPago += Number(p.valorPago);
          todosPageamentos.push({
            data:    p.dataPagamento,
            loanId:  loan.id,
            parcela: inst.numero,
            valor:   Number(p.valorPago),
            metodo:  p.metodoPagamento,
          });
        }
        if (['pendente', 'atrasado', 'parcialmente_pago'].includes(inst.status)) {
          saldoDevedor += Number(inst.saldoDevedor) > 0
            ? Number(inst.saldoDevedor)
            : Number(inst.installmentAmount) - Number(inst.totalPago);
        }
      }
    }

    todosPageamentos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    // Blocos por contrato
    const blocosContratos = client.loans.map(loan => {
      const linhas = loan.installments.map(inst => {
        const pago  = Number(inst.totalPago);
        const saldo = Number(inst.saldoDevedor) > 0
          ? Number(inst.saldoDevedor)
          : Math.max(0, Number(inst.installmentAmount) - pago);
        return `
          <tr>
            <td style="text-align:center">${inst.numero}</td>
            <td>${fmtDate(inst.dataVencimento)}</td>
            <td style="text-align:right">${fmt(Number(inst.installmentAmount))}</td>
            <td style="text-align:right">${pago > 0 ? fmt(pago) : '—'}</td>
            <td style="text-align:right;${saldo > 0 ? 'color:#991b1b' : ''}">${saldo > 0 ? fmt(saldo) : '—'}</td>
            <td><span class="badge ${badgeInst[inst.status] ?? 'badge-pendente'}">${instLabel[inst.status] ?? inst.status}</span></td>
          </tr>`;
      }).join('');

      return `
        <div class="sem-quebra" style="margin-top:16px">
          <div class="secao-titulo">
            Contrato #${String(loan.id).padStart(4, '0')}
            &nbsp;<span class="badge ${badgeLoan[loan.status] ?? 'badge-pendente'}">${statusLoanLabel[loan.status] ?? loan.status}</span>
            &nbsp;<span style="font-size:9pt;font-weight:400;color:#73726c">
              ${loan.numeroParcelas} parcelas · ${fmtDate(loan.dataInicio)}
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width:40px;text-align:center">Nº</th>
                <th>Vencimento</th>
                <th style="text-align:right">Valor</th>
                <th style="text-align:right">Pago</th>
                <th style="text-align:right">Saldo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>`;
    }).join('');

    const linhasPagamentos = todosPageamentos.map(p => `
      <tr>
        <td>${fmtDate(p.data)}</td>
        <td>#${String(p.loanId).padStart(4, '0')}</td>
        <td style="text-align:center">${p.parcela}</td>
        <td style="text-align:right">${fmt(p.valor)}</td>
        <td>${metodoLabel[p.metodo] ?? p.metodo}</td>
      </tr>`).join('');

    const endCliente = [client.endereco, client.bairro, client.cidade, client.estado].filter(Boolean).join(', ');

    const corpo = `
      <div class="secao-titulo">DADOS DO CLIENTE</div>
      <div class="grid-2">
        <div>
          <div class="campo"><div class="campo-label">Nome</div>
            <div class="campo-valor">${client.nome}</div></div>
          <div class="campo"><div class="campo-label">CPF</div>
            <div class="campo-valor">${client.cpf ?? '—'}</div></div>
          ${client.rg ? `<div class="campo"><div class="campo-label">RG</div>
            <div class="campo-valor">${client.rg}</div></div>` : ''}
        </div>
        <div>
          ${client.whatsapp ? `<div class="campo"><div class="campo-label">WhatsApp</div>
            <div class="campo-valor">${client.whatsapp}</div></div>` : ''}
          ${client.email ? `<div class="campo"><div class="campo-label">Email</div>
            <div class="campo-valor">${client.email}</div></div>` : ''}
          ${endCliente ? `<div class="campo"><div class="campo-label">Endereço</div>
            <div class="campo-valor">${endCliente}</div></div>` : ''}
        </div>
      </div>

      <div class="secao-titulo" style="margin-top:24px">RESUMO FINANCEIRO</div>
      <div class="grid-4">
        <div class="card"><div class="campo-label">Total emprestado</div>
          <div class="campo-valor-grande">${fmt(totalEmprestado)}</div></div>
        <div class="card"><div class="campo-label">Total pago</div>
          <div class="campo-valor-grande" style="color:#166534">${fmt(totalPago)}</div></div>
        <div class="card"><div class="campo-label">Saldo devedor</div>
          <div class="campo-valor-grande" style="color:${saldoDevedor > 0 ? '#991b1b' : '#166534'}">${fmt(saldoDevedor)}</div></div>
        <div class="card"><div class="campo-label">Contratos ativos</div>
          <div class="campo-valor-grande">${contratosAtivos}</div></div>
      </div>

      <div class="secao-titulo" style="margin-top:24px">CONTRATOS</div>
      ${blocosContratos}

      ${todosPageamentos.length > 0 ? `
        <div class="secao-titulo quebra-pagina" style="margin-top:24px">HISTÓRICO DE PAGAMENTOS</div>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Contrato</th>
              <th style="text-align:center">Parcela</th>
              <th style="text-align:right">Valor</th>
              <th>Método</th>
            </tr>
          </thead>
          <tbody>${linhasPagamentos}</tbody>
          <tfoot>
            <tr>
              <td colspan="3">Total pago</td>
              <td style="text-align:right">${fmt(totalPago)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>` : ''}
    `;

    return this.gerar(corpo, {
      titulo:    'Extrato do Cliente',
      subtitulo: `${client.nome} · CPF: ${client.cpf ?? '—'}`,
    });
  }

  // ─── B4: Relatório de Carteira ────────────────────────────────────────────

  async gerarCarteiraPdf(): Promise<Buffer> {
    const hoje = new Date();

    const [loansAtivos, loansQuitados, parcelasPagas, parcelasEmAberto] = await Promise.all([
      this.prisma.loan.findMany({
        where: { status: { in: ['ativo', 'inadimplente'] } },
        include: {
          client:       { select: { nome: true, cpf: true } },
          installments: { select: { status: true, installmentAmount: true, dataVencimento: true } },
        },
        orderBy: { id: 'desc' },
      }),
      this.prisma.loan.count({ where: { status: 'quitado' } }),
      this.prisma.installment.findMany({
        where: { status: 'pago' },
        select: { installmentAmount: true },
      }),
      this.prisma.installment.findMany({
        where: { status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] } },
        select: { installmentAmount: true, totalPago: true, dataVencimento: true, status: true },
      }),
    ]);

    const totalCarteira    = loansAtivos.reduce((s, l) => s + Number(l.principalAmount), 0);
    const totalRecebido    = parcelasPagas.reduce((s, i) => s + Number(i.installmentAmount), 0);
    const aReceber         = parcelasEmAberto.reduce((s, i) => s + (Number(i.installmentAmount) - Number(i.totalPago)), 0);
    const totalInadimplente = loansAtivos
      .filter(l => l.status === 'inadimplente' || l.installments.some(i => i.status === 'atrasado'))
      .reduce((s, l) => s + Number(l.principalAmount), 0);

    // Aging: dias de atraso das parcelas atrasadas
    const aging: Record<string, { count: number; valor: number }> = {
      '1-30':  { count: 0, valor: 0 },
      '31-60': { count: 0, valor: 0 },
      '61-90': { count: 0, valor: 0 },
      '+90':   { count: 0, valor: 0 },
    };
    for (const inst of parcelasEmAberto.filter(i => i.status === 'atrasado')) {
      const dias = Math.floor((hoje.getTime() - new Date(inst.dataVencimento).getTime()) / 86400000);
      const saldo = Number(inst.installmentAmount) - Number(inst.totalPago);
      const faixa = dias <= 30 ? '1-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '+90';
      aging[faixa].count++;
      aging[faixa].valor += saldo;
    }

    const linhasContratos = loansAtivos.map(l => {
      const pagas   = l.installments.filter(i => i.status === 'pago').length;
      const aVencer = l.installments.filter(i => ['pendente', 'parcialmente_pago'].includes(i.status)).length;
      const atrasadas = l.installments.filter(i => i.status === 'atrasado').length;
      const badgeClass = l.status === 'inadimplente' || atrasadas > 0 ? 'badge-atrasado' : 'badge-ativo';
      const label = l.status === 'inadimplente' ? 'Inadimplente' : atrasadas > 0 ? `${atrasadas} atrasada(s)` : 'Em dia';

      return `
        <tr>
          <td>#${String(l.id).padStart(4, '0')}</td>
          <td>${l.client.nome}</td>
          <td style="text-align:right">${fmt(Number(l.principalAmount))}</td>
          <td style="text-align:center">${l.numeroParcelas}</td>
          <td style="text-align:center">${pagas}</td>
          <td style="text-align:center">${aVencer}</td>
          <td><span class="badge ${badgeClass}">${label}</span></td>
        </tr>`;
    }).join('');

    const linhasAging = Object.entries(aging).map(([faixa, { count, valor }]) => `
      <tr>
        <td>${faixa === '+90' ? 'Acima de 90 dias' : `${faixa} dias`}</td>
        <td style="text-align:center">${count}</td>
        <td style="text-align:right">${fmt(valor)}</td>
      </tr>`).join('');

    const corpo = `
      <div class="secao-titulo">RESUMO EXECUTIVO</div>
      <div class="grid-4">
        <div class="card"><div class="campo-label">Capital em carteira</div>
          <div class="campo-valor-grande">${fmt(totalCarteira)}</div></div>
        <div class="card"><div class="campo-label">Total recebido</div>
          <div class="campo-valor-grande" style="color:#166534">${fmt(totalRecebido)}</div></div>
        <div class="card"><div class="campo-label">A receber</div>
          <div class="campo-valor-grande">${fmt(aReceber)}</div></div>
        <div class="card"><div class="campo-label">Capital em risco</div>
          <div class="campo-valor-grande" style="color:#991b1b">${fmt(totalInadimplente)}</div></div>
      </div>
      <div class="grid-4" style="margin-top:8px">
        <div class="card"><div class="campo-label">Contratos ativos</div>
          <div class="campo-valor">${loansAtivos.length}</div></div>
        <div class="card"><div class="campo-label">Contratos quitados</div>
          <div class="campo-valor">${loansQuitados}</div></div>
        <div class="card"><div class="campo-label">Contratos inadimplentes</div>
          <div class="campo-valor" style="color:#991b1b">${loansAtivos.filter(l => l.status === 'inadimplente').length}</div></div>
        <div class="card"><div class="campo-label">Data de referência</div>
          <div class="campo-valor">${fmtDate(hoje)}</div></div>
      </div>

      <div class="secao-titulo" style="margin-top:24px">CONTRATOS ATIVOS (${loansAtivos.length})</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th style="text-align:right">Capital</th>
            <th style="text-align:center">Parcelas</th>
            <th style="text-align:center">Pagas</th>
            <th style="text-align:center">A vencer</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>${linhasContratos}</tbody>
      </table>

      <div class="secao-titulo sem-quebra" style="margin-top:24px">INADIMPLÊNCIA POR FAIXA</div>
      <table>
        <thead>
          <tr>
            <th>Faixa de atraso</th>
            <th style="text-align:center">Parcelas</th>
            <th style="text-align:right">Valor em risco</th>
          </tr>
        </thead>
        <tbody>${linhasAging}</tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td style="text-align:center">${Object.values(aging).reduce((s, a) => s + a.count, 0)}</td>
            <td style="text-align:right">${fmt(Object.values(aging).reduce((s, a) => s + a.valor, 0))}</td>
          </tr>
        </tfoot>
      </table>
    `;

    return this.gerar(corpo, {
      titulo:    'Relatório de Carteira',
      subtitulo: `Posição em ${fmtDate(hoje)}`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGADO — PDFKit (mantido para retrocompatibilidade durante migração)
  // ═══════════════════════════════════════════════════════════════════════════

  async gerarContratoEmprestimo(loanId: number, res: Response): Promise<void> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        client: {
          select: {
            nome: true, cpf: true, rg: true, endereco: true,
            bairro: true, cidade: true, estado: true, cep: true,
            whatsapp: true, email: true,
          },
        },
        installments: {
          orderBy: { numero: 'asc' },
          select: { numero: true, installmentAmount: true, dataVencimento: true, status: true },
        },
      },
    });

    if (!loan) throw new NotFoundException('Contrato não encontrado.');

    const e = await this.empresaConfig.get();

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contrato-${loanId}.pdf"`);
    doc.pipe(res);

    const primary = e.corPrimaria;
    const pageW = doc.page.width - 100;

    doc.fontSize(18).fillColor(primary).font('Helvetica-Bold')
       .text('CONTRATO DE EMPRÉSTIMO PESSOAL', 50, 50, { width: pageW, align: 'center' });
    doc.fontSize(10).fillColor('#6b7280').font('Helvetica')
       .text(`${e.nomeFantasia || e.nome} — Sistema SIAFI`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(50 + pageW, doc.y).strokeColor('#d1d5db').stroke();
    doc.moveDown(0.5);

    this._section(doc, primary, 'PARTES');
    this._field(doc, 'CREDOR', e.nomeFantasia || e.nome);
    if (e.cnpj) this._field(doc, 'CNPJ', e.cnpj);
    this._field(doc, 'DEVEDOR', loan.client.nome);
    this._field(doc, 'CPF', loan.client.cpf ?? '—');
    this._field(doc, 'RG', loan.client.rg ?? '—');

    const endereco = [loan.client.endereco, loan.client.bairro, loan.client.cidade, loan.client.estado, loan.client.cep]
      .filter(Boolean).join(', ');
    this._field(doc, 'ENDEREÇO', endereco || '—');

    doc.moveDown(0.5);
    this._section(doc, primary, 'CONDIÇÕES DO EMPRÉSTIMO');
    this._field(doc, 'Nº do Contrato', `#${loan.id}`);
    this._field(doc, 'Data de Início', fmtDate(loan.dataInicio));
    const valorParcela = loan.installments[0]?.installmentAmount ?? 0;
    const totalPagar = loan.installments.reduce((s, i) => s + Number(i.installmentAmount), 0);
    this._field(doc, 'Capital Desembolsado', fmt(Number(loan.principalAmount)));
    this._field(doc, 'Nº de Parcelas', String(loan.numeroParcelas));
    this._field(doc, 'Valor da Parcela', fmt(Number(valorParcela)));
    this._field(doc, 'Total a Pagar', fmt(totalPagar));
    if (loan.taxaJuros != null) this._field(doc, 'Taxa de Juros', `${Number(loan.taxaJuros).toFixed(2)}% a.m.`);
    this._field(doc, 'Multa por Atraso', `${Number(loan.multaPercentual ?? 2).toFixed(2)}% sobre a parcela`);
    this._field(doc, 'Mora Diária', `${Number(loan.moraDiariaPercentual ?? 0.0333).toFixed(4)}% ao dia`);
    if (loan.metodoPagamento) this._field(doc, 'Método de Pagamento', loan.metodoPagamento);
    if (loan.observacoes) this._field(doc, 'Observações', loan.observacoes);

    doc.moveDown(0.5);
    this._section(doc, primary, 'PLANO DE PAGAMENTO');

    const colX = [50, 110, 230, 360];
    doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold');
    doc.rect(50, doc.y, pageW, 18).fill(primary);
    const rowY = doc.y - 14;
    doc.fillColor('#ffffff')
       .text('Nº', colX[0], rowY, { width: 55 })
       .text('Vencimento', colX[1], rowY, { width: 115 })
       .text('Valor', colX[2], rowY, { width: 115 })
       .text('Status', colX[3], rowY, { width: 120 });
    doc.moveDown(0.4);

    const statusLabel: Record<string, string> = {
      pendente: 'Pendente', pago: 'Pago', atrasado: 'Em atraso', cancelado: 'Cancelado',
    };
    const statusColor: Record<string, string> = {
      pendente: '#374151', pago: '#166534', atrasado: '#991b1b', cancelado: '#6b7280',
    };

    loan.installments.forEach((inst, idx) => {
      if (doc.y > 720) doc.addPage();
      const y = doc.y;
      doc.rect(50, y - 2, pageW, 16).fill(idx % 2 === 0 ? '#f9fafb' : '#ffffff');
      doc.fontSize(9).font('Helvetica').fillColor(statusColor[inst.status] ?? '#374151');
      doc.text(String(inst.numero), colX[0], y, { width: 55 })
         .text(fmtDate(inst.dataVencimento), colX[1], y, { width: 115 })
         .text(fmt(Number(inst.installmentAmount)), colX[2], y, { width: 115 })
         .text(statusLabel[inst.status] ?? inst.status, colX[3], y, { width: 120 });
      doc.moveDown(0.3);
    });

    doc.moveDown(1);
    this._section(doc, primary, 'CLÁUSULAS');
    doc.fontSize(9).fillColor('#374151').font('Helvetica');
    const clausulas = [
      `1. O DEVEDOR se compromete a pagar as parcelas nas datas de vencimento indicadas.`,
      `2. O atraso sujeita o DEVEDOR a multa de ${Number(loan.multaPercentual ?? 2).toFixed(2)}% sobre o valor da parcela, acrescida de mora de ${Number(loan.moraDiariaPercentual ?? 0.0333).toFixed(4)}% ao dia sobre o saldo devedor.`,
      `3. O CREDOR poderá exigir antecipação do vencimento em caso de inadimplência superior a 30 dias.`,
      `4. Este contrato é celebrado em conformidade com o Código Civil Brasileiro.`,
      `5. As partes elegem o foro da comarca do CREDOR para dirimir quaisquer controvérsias.`,
    ];
    if (e.clausulasAdicionais) clausulas.push(e.clausulasAdicionais);
    clausulas.forEach((c) => {
      if (doc.y > 720) doc.addPage();
      doc.text(c, { width: pageW, align: 'justify' }).moveDown(0.4);
    });

    doc.moveDown(1);
    if (doc.y > 660) doc.addPage();
    this._section(doc, primary, 'ASSINATURAS');
    doc.moveDown(0.5);
    const sigY = doc.y + 30;
    doc.moveTo(50, sigY).lineTo(240, sigY).strokeColor('#374151').stroke();
    doc.moveTo(310, sigY).lineTo(500, sigY).stroke();
    doc.fontSize(9).fillColor('#374151').font('Helvetica');
    doc.text(`CREDOR: ${e.nomeFantasia || e.nome}`, 50, sigY + 5, { width: 190 });
    doc.text(`DEVEDOR: ${loan.client.nome}`, 310, sigY + 5, { width: 190 });
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#9ca3af')
       .text(`Documento gerado em ${fmtDate(new Date())} pelo Sistema SIAFI.`, { align: 'center', width: pageW });

    doc.end();
  }

  async gerarReciboPagamento(paymentId: number, res: Response): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        installment: {
          include: {
            loan: { include: { client: { select: { nome: true, cpf: true } } } },
          },
        },
      },
    });

    if (!payment) throw new NotFoundException('Pagamento não encontrado.');

    const e = await this.empresaConfig.get();
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo-${paymentId}.pdf"`);
    doc.pipe(res);

    const primary = e.corPrimaria;
    const pageW = doc.page.width - 100;
    const inst = payment.installment;
    const loan = inst.loan;

    doc.fontSize(18).fillColor(primary).font('Helvetica-Bold')
       .text('RECIBO DE PAGAMENTO', 50, 50, { width: pageW, align: 'center' });
    doc.fontSize(10).fillColor('#6b7280').font('Helvetica')
       .text(`${e.nomeFantasia || e.nome} — Sistema SIAFI`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(50 + pageW, doc.y).strokeColor('#d1d5db').stroke();
    doc.moveDown(0.5);

    this._section(doc, primary, 'DADOS DO PAGAMENTO');
    this._field(doc, 'Recibo Nº', String(payment.id));
    this._field(doc, 'Data do Pagamento', fmtDate(payment.dataPagamento));
    this._field(doc, 'Devedor', loan.client.nome);
    this._field(doc, 'CPF', loan.client.cpf ?? '—');
    this._field(doc, 'Contrato Nº', String(loan.id));
    this._field(doc, 'Parcela', `${inst.numero} de ${loan.numeroParcelas}`);
    this._field(doc, 'Vencimento', fmtDate(inst.dataVencimento));
    this._field(doc, 'Valor da Parcela', fmt(Number(inst.installmentAmount)));
    this._field(doc, 'Valor Pago', fmt(Number(payment.valorPago)));
    this._field(doc, 'Método', payment.metodoPagamento);
    if (payment.observacao) this._field(doc, 'Observação', payment.observacao);

    doc.moveDown(1.5);
    doc.fontSize(11).fillColor('#374151').font('Helvetica')
       .text(
         `Recebi de ${loan.client.nome} (CPF: ${loan.client.cpf ?? '—'}) a quantia de ` +
         `${fmt(Number(payment.valorPago))}, referente ao pagamento da parcela ` +
         `${inst.numero}/${loan.numeroParcelas} do contrato nº ${loan.id}, ` +
         `vencida em ${fmtDate(inst.dataVencimento)}.`,
         { width: pageW, align: 'justify' },
       );

    doc.moveDown(2);
    if (doc.y > 660) doc.addPage();
    const sigY = doc.y + 30;
    doc.moveTo(150, sigY).lineTo(410, sigY).strokeColor('#374151').stroke();
    doc.fontSize(9).fillColor('#374151').font('Helvetica')
       .text(`${e.nomeFantasia || e.nome} — Credor`, 150, sigY + 5, { width: 260, align: 'center' });
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#9ca3af')
       .text(`Documento gerado em ${fmtDate(new Date())} pelo Sistema SIAFI.`, { align: 'center', width: pageW });

    doc.end();
  }

  async gerarManualSistema(res: Response): Promise<void> {
    const e       = await this.empresaConfig.get();
    const versao  = (await this.settings.get('sistema.versao')) ?? '2.0';
    const dataGer = new Date().toLocaleDateString('pt-BR');
    const anoGer  = new Date().getFullYear();

    const doc   = new PDFDocument({ margin: 60, size: 'A4', autoFirstPage: false });
    const pri   = e.corPrimaria;
    const acc   = e.corSecundaria;
    const gray  = '#6b7280';
    const light = '#f1f5f9';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="manual-siafi.pdf"');
    doc.pipe(res);

    const pageW2 = () => doc.page.width - 120;
    const h1 = (text: string) => { doc.fontSize(18).fillColor(pri).font('Helvetica-Bold').text(text, { width: pageW2() }).moveDown(0.5); };
    const h2 = (text: string) => { doc.moveDown(0.3); doc.fontSize(13).fillColor(acc).font('Helvetica-Bold').text(text, { width: pageW2() }).moveDown(0.3); };
    const h3 = (text: string) => { doc.fontSize(10).fillColor(pri).font('Helvetica-Bold').text(text, { width: pageW2() }).moveDown(0.2); };
    const p  = (text: string) => { doc.fontSize(9).fillColor('#374151').font('Helvetica').text(text, { width: pageW2(), align: 'justify' }).moveDown(0.35); };
    const li = (text: string) => { doc.fontSize(9).fillColor('#374151').font('Helvetica').text(`• ${text}`, { width: pageW2() - 10, indent: 10 }).moveDown(0.2); };
    const rule = () => { doc.moveDown(0.3); doc.moveTo(60, doc.y).lineTo(60 + pageW2(), doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke(); doc.moveDown(0.3); };
    const newPage = (title?: string) => { doc.addPage(); if (title) { h1(title); rule(); } };
    const checkPage = (needed = 60) => { if (doc.y > doc.page.height - 80 - needed) doc.addPage(); };

    // Capa
    doc.addPage();
    const mid = doc.page.height / 2 - 80;
    doc.rect(0, 0, doc.page.width, 200).fill(pri);
    doc.fontSize(28).fillColor('#ffffff').font('Helvetica-Bold').text('SIAFI', 60, 60, { width: pageW2() + 60, align: 'center' });
    doc.fontSize(14).fillColor('#ffffff').font('Helvetica').text('Sistema Integrado de Apoio Financeiro', 60, 100, { width: pageW2() + 60, align: 'center' });
    doc.fontSize(11).fillColor('rgba(255,255,255,0.8)').text(`Manual do Sistema — v${versao}`, 60, 130, { width: pageW2() + 60, align: 'center' });
    doc.fontSize(11).fillColor(pri).font('Helvetica-Bold').text(e.nomeFantasia || e.nome, 60, mid, { width: pageW2() + 60, align: 'center' });
    doc.fontSize(9).fillColor(gray).font('Helvetica').text(`Gerado em ${dataGer}`, 60, mid + 20, { width: pageW2() + 60, align: 'center' });
    if (e.email) doc.text(`Contato: ${e.email}`, 60, mid + 35, { width: pageW2() + 60, align: 'center' });
    doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill(light);
    doc.fontSize(8).fillColor(gray).text(`© ${anoGer} ${e.nomeFantasia || e.nome}. Documento de uso interno.`, 60, doc.page.height - 28, { width: pageW2() + 60, align: 'center' });

    // Sumário
    newPage(); h1('Sumário');
    const toc: Array<{ num: string; title: string; sub?: string[] }> = [
      { num: '1', title: 'Introdução',           sub: ['1.1 Sobre o SIAFI', '1.2 Perfis de Acesso', '1.3 Stack Tecnológico'] },
      { num: '2', title: 'Acesso e Autenticação', sub: ['2.1 Login', '2.2 MFA', '2.3 Sessão e Segurança'] },
      { num: '3', title: 'Dashboard e Navegação', sub: ['3.1 Dashboard por Perfil', '3.2 Sidebar e Menus'] },
      { num: '4', title: 'Módulos Operacionais',  sub: ['4.1 Clientes', '4.2 Empréstimos', '4.3 Parcelas e Pagamentos', '4.4 Caixa', '4.5 Inadimplência'] },
      { num: '5', title: 'Módulos Avançados',     sub: ['5.1 Reparcelamento', '5.2 Intenções', '5.3 Score de Risco', '5.4 PIX', '5.5 Conciliação'] },
      { num: '6', title: 'Comunicação Interna',   sub: ['6.1 Mensagens', '6.2 Notificações', '6.3 Suporte'] },
      { num: '7', title: 'Portal do Cliente',     sub: ['7.1 Acesso', '7.2 Contratos', '7.3 Pagamento PIX', '7.4 Suporte e Perfil'] },
      { num: '8', title: 'Administração',         sub: ['8.1 Usuários', '8.2 Configurações', '8.3 Auditoria', '8.4 Relatórios'] },
    ];
    toc.forEach(({ num, title, sub }) => {
      checkPage(30);
      doc.fontSize(10).fillColor(pri).font('Helvetica-Bold').text(`${num}. ${title}`, { width: pageW2() }).moveDown(0.15);
      (sub ?? []).forEach((s) => { doc.fontSize(9).fillColor(gray).font('Helvetica').text(s, { width: pageW2(), indent: 16 }).moveDown(0.1); });
      doc.moveDown(0.2);
    });

    newPage('1. Introdução');
    h2('1.1 Sobre o SIAFI');
    p(`O SIAFI (Sistema Integrado de Apoio Financeiro) é a plataforma central de gestão de empréstimos pessoais de ${e.nomeFantasia || e.nome}. Desenvolvido em tecnologia moderna (NestJS + Next.js), o sistema unifica toda a operação financeira.`);
    h2('1.2 Perfis de Acesso');
    [['Administrador', 'Acesso total ao sistema.'], ['Financeiro', 'Operação financeira completa.'], ['Consultor', 'Gestão da própria carteira.'], ['Caixa', 'Liberações e pagamentos presenciais.'], ['Cliente', 'Portal externo.']].forEach(([perfil, desc]) => {
      checkPage(20);
      doc.fontSize(9).fillColor(pri).font('Helvetica-Bold').text(`${perfil}: `, { continued: true, width: pageW2() });
      doc.fillColor('#374151').font('Helvetica').text(desc).moveDown(0.25);
    });

    newPage('Fim do Manual');
    const cy = doc.page.height / 2 - 40;
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f8fafc');
    doc.rect(60, cy - 20, pageW2(), 1).fill(acc);
    doc.fontSize(14).fillColor(pri).font('Helvetica-Bold').text('Fim do Manual do Sistema', 60, cy, { width: pageW2(), align: 'center' });
    doc.fontSize(9).fillColor(gray).font('Helvetica').text(`SIAFI v${versao} · ${e.nomeFantasia || e.nome} · Gerado em ${dataGer}`, 60, cy + 25, { width: pageW2(), align: 'center' });

    doc.end();
  }

  // ─── Helpers PDFKit ───────────────────────────────────────────────────────

  private _section(doc: PDFKit.PDFDocument, color: string, title: string) {
    doc.fontSize(11).fillColor(color).font('Helvetica-Bold').text(title).moveDown(0.3);
  }

  private _field(doc: PDFKit.PDFDocument, label: string, value: string) {
    const pageW = doc.page.width - 100;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
       .text(`${label}: `, { continued: true, width: pageW });
    doc.font('Helvetica').text(value).moveDown(0.2);
  }
}
