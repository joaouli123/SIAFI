import { BadRequestException, Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { ReportGeneratorService } from './report-generator.service';
import { ReportExportService } from './report-export.service';
import { FORMATOS, Formato, RELATORIOS_CATALOGO, RelData } from './relatorios.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly generator: ReportGeneratorService,
    private readonly exporter: ReportExportService,
  ) {}

  // ─── Central de Relatórios ──────────────────────────────────────────────────

  @Get('catalogo')
  @Roles('admin', 'financeiro')
  getCatalogo() {
    return { relatorios: RELATORIOS_CATALOGO, formatos: FORMATOS };
  }

  @Get('gerar/:key')
  @Roles('admin', 'financeiro')
  async gerar(
    @Param('key') key: string,
    @Query('formato') formato: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('mes') mes: string | undefined,
    @Query('status') status: string | undefined,
    @Query('clientId') clientId: string | undefined,
    @Res() res: Response,
  ) {
    const fmt = (formato ?? 'pdf') as Formato;
    if (!FORMATOS.includes(fmt)) throw new BadRequestException(`Formato inválido: ${formato}`);

    const data = await this.generator.gerar(key, { startDate, endDate, mes, status, clientId });
    const { buffer, contentType, filename } = await this.exporter.exportar(data, fmt);

    const disposition = fmt === 'pdf' || fmt === 'html' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.end(buffer);
  }

  // Baixa todos os relatórios (que não exigem seleção de cliente) num ZIP único
  @Get('zip')
  @Roles('admin', 'financeiro')
  async zip(
    @Query('formato') formato: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('status') status: string | undefined,
    @Res() res: Response,
  ) {
    const fmt = (formato ?? 'pdf') as Formato;
    if (!FORMATOS.includes(fmt)) throw new BadRequestException(`Formato inválido: ${formato}`);

    const keys = RELATORIOS_CATALOGO.filter((r) => !r.params.includes('cliente')).map((r) => r.key);
    const datas: RelData[] = [];
    for (const key of keys) {
      datas.push(await this.generator.gerar(key, { startDate, endDate, status }));
    }
    const { buffer, contentType, filename } = await this.exporter.zip(datas, fmt);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buffer);
  }

  @Get('movimentacao')
  @Roles('admin', 'financeiro')
  getMovimentacao(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.getMovimentacao(startDate, endDate);
  }

  @Get('carteira')
  @Roles('admin', 'financeiro')
  getCarteira() {
    return this.reportsService.getCarteira();
  }

  @Get('clientes')
  @Roles('admin', 'financeiro')
  getClientes() {
    return this.reportsService.getClientes();
  }

  @Get('contratos')
  @Roles('admin', 'financeiro')
  getContratos(@Query('status') status?: string) {
    return this.reportsService.getContratos(status);
  }

  @Get('faturamento')
  @Roles('admin', 'financeiro')
  getFaturamento(@Query('mes') mes: string) {
    return this.reportsService.getFaturamentoMensal(mes);
  }

  @Get('evolucao')
  @Roles('admin', 'financeiro')
  getEvolucao(@Query('meses') meses?: string) {
    return this.reportsService.getEvolucao(Math.min(Math.max(Number(meses) || 6, 2), 12));
  }
}
