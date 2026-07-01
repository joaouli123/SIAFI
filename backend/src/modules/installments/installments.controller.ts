import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InstallmentsService } from './installments.service';
import { InstallmentFilterDto } from './dto/installment-filter.dto';

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
    return this.installmentsService.findAll(filters, consultorId);
  }

  @Get('overdue')
  @Roles('admin', 'financeiro', 'caixa', 'consultor')
  findOverdue(@CurrentUser() user: AuthUser) {
    const consultorId = user?.role === 'consultor' ? user.id : undefined;
    return this.installmentsService.findOverdue(consultorId);
  }

  // Parcelas com vencimento hoje — dashboard do caixa e do consultor
  @Get('hoje')
  @Roles('admin', 'financeiro', 'caixa', 'consultor')
  findHoje(@CurrentUser() user: AuthUser) {
    const consultorId = user?.role === 'consultor' ? user.id : undefined;
    return this.installmentsService.findHoje(consultorId);
  }

  @Get(':id/encargos')
  @Roles('admin', 'financeiro', 'caixa')
  getEncargos(@Param('id', ParseIntPipe) id: number) {
    return this.installmentsService.getEncargos(id);
  }

  @Get(':id')
  @Roles('admin', 'financeiro', 'caixa')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.installmentsService.findById(id);
  }
}
