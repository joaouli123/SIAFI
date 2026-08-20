import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// O Nest so escreve no log excecoes NAO tratadas (500). Um 400/401/403/429 sai
// silencioso, entao um "erro ao carregar" na tela nao deixava rastro nenhum no
// servidor e so dava pra investigar pelo DevTools do usuario. Este filtro registra
// qualquer resposta de erro sem alterar o corpo devolvido ao cliente.
@Catch()
export class LogErrosFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    if (status < 500) {
      const req = host.switchToHttp().getRequest<{
        method?: string;
        originalUrl?: string;
        url?: string;
        user?: { username?: string; role?: string };
      }>();
      const corpo = exception instanceof HttpException ? exception.getResponse() : null;
      const detalhe = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
      const quem = req?.user ? `${req.user.username ?? '?'}/${req.user.role ?? '?'}` : 'anon';
      this.logger.warn(
        `${status} ${req?.method ?? '?'} ${req?.originalUrl ?? req?.url ?? '?'} [${quem}] :: ${detalhe}`,
      );
    }

    super.catch(exception, host);
  }
}
