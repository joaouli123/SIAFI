import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionFilterDto } from './dto/transaction-filter.dto';

interface AuthUser {
  id: number;
  username: string;
  role: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @Roles('admin', 'financeiro', 'caixa')
  findAll(@Query() filters: TransactionFilterDto) {
    return this.transactionsService.findAll(filters);
  }

  @Get('saldo')
  @Roles('admin', 'financeiro', 'caixa')
  getSaldo(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.transactionsService.getSaldo(dataInicio, dataFim);
  }

  @Get('movimento')
  @Roles('admin', 'financeiro')
  getMovimento(
    @Query('mes', ParseIntPipe) mes: number,
    @Query('ano', ParseIntPipe) ano: number,
  ) {
    return this.transactionsService.getMovimentoMensal(mes, ano);
  }

  @Post()
  @Roles('admin', 'financeiro', 'caixa')
  create(@Body() dto: CreateTransactionDto, @CurrentUser() user: AuthUser) {
    return this.transactionsService.create(dto, user?.id);
  }
}
