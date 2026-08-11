import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Decimal from 'decimal.js';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { QUEUE_FINANCE_NOTIFICATIONS, JOB_WA_COBRANCA_ANTECIPADA, JOB_EMAIL_COBRANCA_ANTECIPADA } from '../queue/queue.constants';
import type { NotificationJobData } from '../queue/queue.interfaces';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const BUCKET = 'boletos-cobranca';

@Injectable()
export class CobrancaService {
  private readonly logger = new Logger(CobrancaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly supabase: SupabaseService,
    @InjectQueue(QUEUE_FINANCE_NOTIFICATIONS)
    private readonly notificationsQueue: Queue<NotificationJobData>,
  ) {}

  async processarCobrancasAntecipadas(): Promise<void> {
    const diasStr = await this.settings.get('financeiro.dias_antecedencia_cobranca');
    const diasPadrao = Math.max(1, parseInt(diasStr ?? '10', 10));
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // Fetch a window of 60 days; per-loan filter applied below
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + 60);

    const installments = await this.prisma.installment.findMany({
      where: {
        cobrancaEnviadaEm: null,
        status: 'pendente',
        dataVencimento: { gte: hoje, lte: limite },
        loan: { status: 'ativo' },
      },
      include: {
        loan: {
          include: {
            client: { select: { id: true, nome: true, whatsapp: true, email: true } },
          },
        },
      },
    });

    const paraEnviar = installments.filter((inst) => {
      const dias = inst.loan.diasAntecedenciaCobranca ?? diasPadrao;
      const limiteInst = new Date(hoje);
      limiteInst.setDate(limiteInst.getDate() + dias);
      return inst.dataVencimento <= limiteInst;
    });

    for (const inst of paraEnviar) {
      try {
        await this.enviarCobranca(inst as any);
      } catch (err) {
        this.logger.error(`Falha na cobrança parcela #${inst.id}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`${paraEnviar.length}/${installments.length} cobranças antecipadas processadas`);
  }

  async enviarCobranca(installment: any): Promise<void> {
    const loan   = installment.loan;
    const client = loan.client;

    const valorFmt = Number(installment.installmentAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dtVenc   = new Date(installment.dataVencimento).toLocaleDateString('pt-BR');
    const hoje     = new Date().toISOString().split('T')[0];
    const pdfPath  = `${client.id}/parcela_${loan.id}_${installment.numero}_${hoje}.pdf`;

    // Generate PDF
    const pdfBuffer = await this.gerarPdfCobranca(installment, loan, client);

    // Upload to portal storage
    let portalOk = false;
    try {
      await this.supabase.uploadFile(BUCKET, pdfPath, pdfBuffer, 'application/pdf');
      portalOk = true;
    } catch (err) {
      this.logger.error(`Upload storage parcela #${installment.id}: ${(err as Error).message}`);
    }

    const jobBase: NotificationJobData = {
      clientId:      client.id,
      clienteNome:   client.nome,
      installmentId: installment.id,
      loanId:        loan.id,
      valorParcela:  Number(installment.installmentAmount),
      dataVencimento: dtVenc,
    };

    const jobId = (suffix: string) =>
      `cob-ant-${suffix}-${installment.id}-${hoje}`;

    const [waResult, emailResult] = await Promise.allSettled([
      loan.cobrarWhatsapp && client.whatsapp
        ? this.notificationsQueue.add(
            JOB_WA_COBRANCA_ANTECIPADA,
            { ...jobBase, clienteWhatsapp: client.whatsapp },
            { jobId: jobId('wa') },
          )
        : Promise.resolve(null),

      loan.cobrarEmail && client.email
        ? this.notificationsQueue.add(
            JOB_EMAIL_COBRANCA_ANTECIPADA,
            { ...jobBase, clienteEmail: client.email, pdfBase64: pdfBuffer.toString('base64') },
            { jobId: jobId('email') },
          )
        : Promise.resolve(null),
    ]);

    const waOk    = waResult.status === 'fulfilled' && loan.cobrarWhatsapp && !!client.whatsapp;
    const emailOk = emailResult.status === 'fulfilled' && loan.cobrarEmail && !!client.email;

    await this.prisma.installment.update({
      where: { id: installment.id },
      data: {
        cobrancaEnviadaEm:  new Date(),
        cobrancaWhatsappOk: waOk,
        cobrancaEmailOk:    emailOk,
        cobrancaPortalOk:   portalOk,
        valorComEncargos:   Number(installment.installmentAmount),
      },
    });

    await this.prisma.notification.create({
      data: {
        clientId: client.id,
        loanId:   loan.id,
        tipo:     'cobranca',
        assunto:  `Cobrança antecipada — Parcela #${installment.numero}`,
        mensagem: `${valorFmt} vence ${dtVenc}. WA=${waOk} Email=${emailOk} Portal=${portalOk}`,
        status:   waOk || emailOk || portalOk ? 'enviado' : 'falhou',
        sentAt:   new Date(),
      },
    });
  }

  async reenviarCobrancas(): Promise<void> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const em3dias = new Date(hoje);
    em3dias.setDate(em3dias.getDate() + 3);
    const limite3dias = new Date(hoje);
    limite3dias.setDate(limite3dias.getDate() - 3);

    // Parcelas pendentes, cobrança enviada há mais de 3 dias, vencimento em até 3 dias
    const pendentes = await this.prisma.installment.findMany({
      where: {
        status: 'pendente',
        dataVencimento: { gte: hoje, lte: em3dias },
        cobrancaEnviadaEm: { lt: limite3dias },
        loan: { status: 'ativo' },
      },
      include: {
        loan: {
          include: {
            client: { select: { id: true, nome: true, whatsapp: true, email: true } },
          },
        },
      },
    });

    for (const inst of pendentes) {
      // Reset para reenvio
      await this.prisma.installment.update({
        where: { id: inst.id },
        data: { cobrancaEnviadaEm: null },
      });
      try {
        await this.enviarCobranca(inst as any);
      } catch (err) {
        this.logger.error(`Falha no reenvio parcela #${inst.id}: ${(err as Error).message}`);
      }
    }

    if (pendentes.length > 0) {
      this.logger.log(`${pendentes.length} cobranças reenviadas (D-3)`);
    }
  }

  async getBoletoUrl(installmentId: number, clientId: number): Promise<string> {
    const installment = await this.prisma.installment.findUnique({
      where: { id: installmentId },
      include: { loan: { select: { clientId: true, id: true } } },
    });

    if (!installment) throw new NotFoundException(`Parcela ${installmentId} não encontrada`);
    if (installment.loan.clientId !== clientId) throw new ForbiddenException();
    if (!installment.cobrancaPortalOk || !installment.cobrancaEnviadaEm) {
      throw new NotFoundException('Boleto ainda não disponível');
    }

    const date    = installment.cobrancaEnviadaEm.toISOString().split('T')[0];
    const path    = `${clientId}/parcela_${installment.loan.id}_${installment.numero}_${date}.pdf`;
    return this.supabase.createSignedUrl(BUCKET, path, 3600);
  }

  private gerarPdfCobranca(installment: any, loan: any, client: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc: PDFKit.PDFDocument = new (PDFDocument as any)({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const primary = '#1e40af';
      const pageW   = doc.page.width - 100;
      const valorFmt = Number(installment.installmentAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const dtVenc   = new Date(installment.dataVencimento).toLocaleDateString('pt-BR');

      doc.fontSize(18).fillColor(primary).font('Helvetica-Bold')
        .text('AVISO DE COBRANÇA', 50, 50, { width: pageW, align: 'center' });
      doc.fontSize(10).fillColor('#6b7280').font('Helvetica')
        .text('Lidera Tecnologia e Gestão — Sistema SIAFI', { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(50 + pageW, doc.y).strokeColor('#d1d5db').stroke();
      doc.moveDown(0.8);

      const field = (label: string, value: string) => {
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
          .text(`${label}: `, { continued: true, width: pageW });
        doc.font('Helvetica').text(value).moveDown(0.25);
      };

      doc.fontSize(11).fillColor(primary).font('Helvetica-Bold').text('CLIENTE').moveDown(0.3);
      field('Nome', client.nome);
      field('Contrato', `#${loan.id}`);
      doc.moveDown(0.5);

      doc.fontSize(11).fillColor(primary).font('Helvetica-Bold').text('PARCELA').moveDown(0.3);
      field('Número', `${installment.numero} de ${loan.numeroParcelas}`);
      field('Vencimento', dtVenc);

      doc.moveDown(0.3);
      doc.fontSize(20).fillColor(primary).font('Helvetica-Bold')
        .text(valorFmt, { align: 'center', width: pageW });
      doc.moveDown(0.8);

      doc.fontSize(11).fillColor(primary).font('Helvetica-Bold').text('INSTRUÇÕES').moveDown(0.3);
      doc.fontSize(9).fillColor('#374151').font('Helvetica')
        .text('• Acesse o portal e pague via PIX: https://siafi.app.br/portal')
        .text('• Após o vencimento, multa e mora serão aplicados conforme contrato.')
        .text('• Para dúvidas, entre em contato com a Lidera.');

      doc.moveDown(1.5);
      doc.fontSize(8).fillColor('#9ca3af')
        .text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} · Sistema SIAFI`, {
          align: 'center', width: pageW,
        });

      doc.end();
    });
  }
}
