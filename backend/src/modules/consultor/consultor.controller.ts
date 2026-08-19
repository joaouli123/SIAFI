import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/guards/supabase-auth.guard';
import { ConsultorService } from './consultor.service';
import { CreateCobrancaDto } from './dto/create-cobranca.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consultor')
export class ConsultorController {
  constructor(private readonly consultorService: ConsultorService) {}

  @Get('carteira')
  @Roles('consultor')
  getCarteira(@CurrentUser() user: RequestUser) {
    return this.consultorService.getCarteira(user.id);
  }

  @Get('stats')
  @Roles('consultor')
  getStats(@CurrentUser() user: RequestUser) {
    return this.consultorService.getStats(user.id);
  }

  @Get('relatorio')
  @Roles('consultor')
  getRelatorio(@CurrentUser() user: RequestUser) {
    return this.consultorService.getRelatorio(user.id);
  }

  // Clientes disponíveis para o seletor do relatório — consultor só vê a própria carteira
  @Get('clientes')
  @Roles('consultor', 'financeiro', 'admin')
  listarClientes(@CurrentUser() user: RequestUser) {
    return this.consultorService.listarClientesRelatorio(user);
  }

  @Get('relatorio-cliente/:clientId')
  @Roles('consultor', 'financeiro', 'admin')
  getRelatorioCliente(
    @Param('clientId', ParseIntPipe) clientId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.consultorService.getRelatorioCliente(clientId, user);
  }

  @Get('carteira/:clientId')
  @Roles('consultor')
  getClienteDetalhe(
    @Param('clientId', ParseIntPipe) clientId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.consultorService.getClienteDetalhe(clientId, user.id);
  }

  @Get('cobrancas')
  @Roles('consultor', 'financeiro', 'admin')
  listarCobrancas(
    @CurrentUser() user: RequestUser,
    @Query('clientId', new ParseIntPipe({ optional: true })) clientId?: number,
  ) {
    return this.consultorService.listarCobrancas(user, clientId);
  }

  @Post('cobrancas')
  @Roles('consultor')
  registrarCobranca(
    @Body() dto: CreateCobrancaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.consultorService.registrarCobranca(dto, user);
  }
}
