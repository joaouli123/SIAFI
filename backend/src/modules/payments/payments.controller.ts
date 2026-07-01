import {
  Body,
  Controller,
  Delete,
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
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QuitarContratoDto } from './dto/quitar-contrato.dto';

interface AuthUser {
  id: number;
  username: string;
  role: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles('admin', 'financeiro', 'caixa')
  findAll(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.paymentsService.findAll(search, user?.role);
  }

  // Pagamentos registrados hoje — dashboard do caixa
  @Get('hoje')
  @Roles('admin', 'financeiro', 'caixa')
  findHoje() {
    return this.paymentsService.findHoje();
  }

  @Post()
  @Roles('admin', 'financeiro', 'caixa')
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.paymentsService.create(dto, user?.id);
  }

  @Post('quitar/:loanId')
  @Roles('admin', 'financeiro')
  quitarContrato(
    @Param('loanId', ParseIntPipe) loanId: number,
    @Body() dto: QuitarContratoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.paymentsService.quitarContrato(loanId, dto, user?.id);
  }

  @Get('installment/:installmentId')
  @Roles('admin', 'financeiro', 'caixa')
  findByInstallment(@Param('installmentId', ParseIntPipe) installmentId: number) {
    return this.paymentsService.findByInstallment(installmentId);
  }

  @Delete(':id/estornar')
  @Roles('admin', 'financeiro')
  estornar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.paymentsService.estornar(id, user?.id);
  }
}
