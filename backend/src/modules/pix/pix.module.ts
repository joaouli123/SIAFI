import { Module } from '@nestjs/common';
import { PixController } from './pix.controller';
import { PixService } from './pix.service';
import { InstallmentsModule } from '../installments/installments.module';

@Module({
  imports: [InstallmentsModule],
  controllers: [PixController],
  providers: [PixService],
  exports: [PixService],
})
export class PixModule {}
