import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InstallmentsService } from './installments.service';
import { InstallmentFilterDto } from './dto/installment-filter.dto';
import { UpdateInstallmentDto } from './dto/update-installment.dto';

interface AuthUser {
  id: number;
  username: string;
  role: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('installments')
export class InstallmentsController {
  constructor(private readonly installmentsService: InstallmentsService) {}

  // Listagem geral com filtros (status, cliente, contrato, período) + paginação
  @Get()
  @Roles('admin', 'financeiro', 'caixa', 'consultor')
  findAll(@Query() filters: InstallmentFilterDto, @CurrentUser() user: AuthUser) {
    const consultorId = user?.role === 'consultor' ? user.id : undefined;
    return this.installmentsService.findAll(filters, consultorId, user?.role);
  }

  @Get('overdue')
  @Roles('admin', 'financeiro', 'caixa', 'consultor')
  findOverdue(
    @CurrentUser() user: AuthUser,
    @Query('consultorId') consultorId?: string,
    @Query('clientId') clientId?: string,
  ) {
    const cliente = Number(clientId);
    return this.installmentsService.findOverdue(
      this.escopoConsultor(user, consultorId),
      user?.role,
      Number.isFinite(cliente) && cliente > 0 ? cliente : undefined,
    );
  }

  // Parcelas com vencimento hoje — dashboard do caixa e do consultor
  @Get('hoje')
  @Roles('admin', 'financeiro', 'caixa', 'consultor')
  findHoje(@CurrentUser() user: AuthUser, @Query('consultorId') consultorId?: string) {
    return this.installmentsService.findHoje(this.escopoConsultor(user, consultorId), user?.role);
  }

  // Consultor logado enxerga só a própria carteira; o filtro da tela é para admin/financeiro.
  private escopoConsultor(user: AuthUser, filtro?: string): number | undefined {
    if (user?.role === 'consultor') return user.id;
    const id = Number(filtro);
    return Number.isFinite(id) && id > 0 ? id : undefined;
  }

  @Get(':id/encargos')
  @Roles('admin', 'financeiro', 'caixa')
  // 'data' congela o cálculo na data da baixa; sem ela, mostra a dívida de hoje.
  getEncargos(@Param('id', ParseIntPipe) id: number, @Query('data') data?: string) {
    return this.installmentsService.getEncargos(id, data || undefined);
  }

  @Get(':id')
  @Roles('admin', 'financeiro', 'caixa')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.installmentsService.findById(id, user?.role);
  }

  @Patch(':id')
  @Roles('admin', 'financeiro', 'caixa', 'consultor')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInstallmentDto) {
    return this.installmentsService.update(id, dto);
  }
}
