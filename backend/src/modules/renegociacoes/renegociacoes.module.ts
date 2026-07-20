import { Module } from '@nestjs/common';
import { RenegociacoesController } from './renegociacoes.controller';
import { RenegociacoesService } from './renegociacoes.service';
import { InstallmentsModule } from '../installments/installments.module';

@Module({
  imports: [InstallmentsModule],
  controllers: [RenegociacoesController],
  providers: [RenegociacoesService],
  exports: [RenegociacoesService],
})
export class RenegociacoesModule {}
