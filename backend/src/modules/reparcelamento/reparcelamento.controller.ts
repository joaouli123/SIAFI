import {
  Body,
  Controller,
  Get,
  Param,
  ParseFloatPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReparcelamentoService } from './reparcelamento.service';
import { CreateSolicitacaoDto } from './dto/create-solicitacao.dto';
import { PropostaDto } from './dto/proposta.dto';
import { RejeitarSolicitacaoDto } from './dto/rejeitar-solicitacao.dto';

interface AuthUser { id: number; username: string; role: string }

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reparcelamentos')
export class ReparcelamentoController {
  constructor(private readonly svc: ReparcelamentoService) {}

  // Simulador — sem persistência, qualquer role autorizada
  @Get('simular')
  @Roles('admin', 'financeiro', 'consultor')
  simular(
    @Query('principal', ParseFloatPipe) principal: number,
    @Query('profit',    ParseFloatPipe) profit:    number,
    @Query('parcelas',  ParseIntPipe)   parcelas:  number,
    @Query('dataInicio') dataInicio: string,
    @Query('periodicidade') periodicidade?: string,
  ) {
    return this.svc.simular(principal, profit, parcelas, dataInicio, periodicidade);
  }

  @Get()
  @Roles('admin', 'financeiro', 'consultor')
  findAll(
    @Query('status') status?: string,
    @Query('loanId', new ParseIntPipe({ optional: true })) loanId?: number,
  ) {
    return this.svc.findAll({ status, loanId });
  }

  @Get(':id')
  @Roles('admin', 'financeiro', 'consultor')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('admin', 'financeiro', 'consultor')
  criar(@Body() dto: CreateSolicitacaoDto, @CurrentUser() user: AuthUser) {
    return this.svc.criar(dto, user.id);
  }

  @Patch(':id/proposta')
  @Roles('admin', 'financeiro')
  submitProposta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PropostaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.submitProposta(id, dto, user.id);
  }

  @Patch(':id/aprovar-segunda-instancia')
  @Roles('admin')
  aprovarSegundaInstancia(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.aprovarSegundaInstancia(id, user.id);
  }

  @Patch(':id/rejeitar')
  @Roles('admin', 'financeiro')
  rejeitar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejeitarSolicitacaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.rejeitar(id, dto, user.id);
  }

  @Patch(':id/executar')
  @Roles('admin', 'financeiro')
  executar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      ?? req.socket.remoteAddress
      ?? '0.0.0.0';
    return this.svc.executar(id, ip, user.id);
  }
}
