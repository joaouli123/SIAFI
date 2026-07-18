import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { SupabaseModule } from '../../supabase/supabase.module';
import { PixModule } from '../pix/pix.module';
import { CobrancaModule } from '../cobranca/cobranca.module';
import { QUEUE_FINANCE_NOTIFICATIONS } from '../queue/queue.constants';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { SupportController } from './support.controller';

@Module({
  imports: [
    PrismaModule,
    SupabaseModule,
    PixModule,
    CobrancaModule,
    BullModule.registerQueue({ name: QUEUE_FINANCE_NOTIFICATIONS }),
  ],
  controllers: [ClientPortalController, PortalController, SupportController],
  providers: [ClientPortalService, PortalService],
  exports: [PortalService],
})
export class ClientPortalModule {}
