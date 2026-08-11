import { Module } from '@nestjs/common';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { ClientPortalModule } from '../client-portal/client-portal.module';
import { InstallmentsModule } from '../installments/installments.module';

@Module({
  imports: [ClientPortalModule, InstallmentsModule],
  controllers: [LoansController],
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
