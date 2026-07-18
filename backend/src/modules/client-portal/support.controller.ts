import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ClientPortalService } from './client-portal.service';

// Tickets de suporte para operadores (tela administrativa /suporte).
// Separado do ClientPortalController, que é restrito a role 'cliente'.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly service: ClientPortalService) {}

  @Get('tickets')
  @Roles('admin', 'financeiro', 'caixa')
  listAll(@Query('status') status?: string) {
    return this.service.listAllTickets(status);
  }
}
