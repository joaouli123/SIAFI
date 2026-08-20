import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { LogErrosFilter } from './common/filters/log-erros.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Confiar no IP real encaminhado pelo Nginx via X-Forwarded-For
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());

  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:4011,http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalFilters(new LogErrosFilter(app.getHttpAdapter()));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 4010;
  await app.listen(port);
  console.log(`SIAFI API running on http://localhost:${port}/api`);
}
bootstrap();
