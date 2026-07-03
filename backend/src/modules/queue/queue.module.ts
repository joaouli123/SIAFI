import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { redisConnection } from './redis.config';
import { QUEUE_FINANCE_NOTIFICATIONS, QUEUE_PAYMENT_PROCESSING } from './queue.constants';
import { QueueDebugController } from './queue.debug.controller';

// Redis cleanup constants — keeps the 250 MB plan comfortable
const SETE_DIAS_S = 7 * 24 * 3600;   // 604 800 s — máximo para jobs com falha
const TRES_DIAS_S = 3 * 24 * 3600;   // 259 200 s — histórico de pagamentos concluídos
const UM_DIA_S   = 1 * 24 * 3600;   //  86 400 s — notificações concluídas (efêmeras)

@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: redisConnection as any,
    }),
    BullModule.registerQueue(
      {
        name: QUEUE_FINANCE_NOTIFICATIONS,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          // Notificações concluídas: manter apenas as 100 mais recentes e no máx. 1 dia
          removeOnComplete: { count: 100, age: UM_DIA_S },
          // Falhas: manter para debug por até 7 dias ou máx. 200 entradas
          removeOnFail: { count: 200, age: SETE_DIAS_S },
        },
      },
      {
        name: QUEUE_PAYMENT_PROCESSING,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 10000 },
          // Pagamentos concluídos: manter 100 entradas por até 3 dias (auditoria curta)
          removeOnComplete: { count: 100, age: TRES_DIAS_S },
          // Falhas: manter para investigação por até 7 dias ou máx. 500 entradas
          removeOnFail: { count: 500, age: SETE_DIAS_S },
        },
      },
    ),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: QUEUE_FINANCE_NOTIFICATIONS,
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: QUEUE_PAYMENT_PROCESSING,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [QueueDebugController],
  exports: [BullModule],
})
export class QueueModule {}
