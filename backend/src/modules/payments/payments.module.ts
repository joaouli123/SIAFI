import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ScoreRiscoModule } from '../score-risco/score-risco.module';
import { InstallmentsModule } from '../installments/installments.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ScoreRiscoModule, InstallmentsModule, SettingsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
