import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportGeneratorService } from './report-generator.service';
import { ReportExportService } from './report-export.service';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [PdfModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportGeneratorService, ReportExportService],
})
export class ReportsModule {}
