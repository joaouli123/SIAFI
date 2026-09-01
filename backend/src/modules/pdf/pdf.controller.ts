import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PdfService } from './pdf.service';
import { ExcelService } from './excel.service';
import { PaymentFilterDto } from '../payments/dto/payment-filter.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('export')
export class PdfController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly excelService: ExcelService,
  ) {}

  // ─── PDF — Documentos com identidade visual ───────────────────────────────

  @Get('contratos/:id/pdf')
  @Roles('admin', 'financeiro', 'consultor')
  async contratoPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.gerarContratoPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contrato-${id}.pdf"`);
    res.end(buffer);
  }

  @Get('pagamentos/:id/recibo')
  @Roles('admin', 'financeiro', 'caixa')
  async reciboPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.gerarReciboPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo-${id}.pdf"`);
    res.end(buffer);
  }

  @Get('clientes/:id/extrato')
  @Roles('admin', 'financeiro', 'consultor')
  async extratoPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.gerarExtratoPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="extrato-cliente-${id}.pdf"`);
    res.end(buffer);
  }

  @Get('carteira')
  @Roles('admin', 'financeiro')
  async carteiraPdf(@Res() res: Response) {
    const buffer = await this.pdfService.gerarCarteiraPdf();
    const data   = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="carteira-${data}.pdf"`);
    res.end(buffer);
  }

  // ─── Excel ────────────────────────────────────────────────────────────────

  @Get('contratos/excel')
  @Roles('admin', 'financeiro')
  async contratosExcel(
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('inicioDe') inicioDe: string | undefined,
    @Query('inicioAte') inicioAte: string | undefined,
    @Res() res: Response,
  ) {
    await this.excelService.exportarContratos({ status, search, inicioDe, inicioAte }, res);
  }

  @Get('movimentacao/excel')
  @Roles('admin', 'financeiro')
  async movimentacaoExcel(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ) {
    await this.excelService.exportarMovimentacao(startDate, endDate, res);
  }

  @Get('inadimplentes/excel')
  @Roles('admin', 'financeiro')
  async inadimplentesExcel(
    @Query('search') search: string | undefined,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Res() res: Response,
  ) {
    await this.excelService.exportarInadimplentes(res, { search, startDate, endDate });
  }

  @Get('pagamentos/excel')
  @Roles('admin', 'financeiro', 'caixa')
  async recebimentosExcel(
    @Query() filter: PaymentFilterDto,
    @CurrentUser() user: { role?: string },
    @Res() res: Response,
  ) {
    await this.excelService.exportarRecebimentos(filter, user?.role, res);
  }

  // ─── Manual do Sistema (PDFKit legado) ────────────────────────────────────

  @Get('manual-sistema')
  @Roles('admin')
  async manualSistemaPdf(@Res() res: Response) {
    await this.pdfService.gerarManualSistema(res);
  }
}
