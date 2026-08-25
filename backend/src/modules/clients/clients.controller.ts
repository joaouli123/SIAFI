import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/guards/supabase-auth.guard';
import { ClientsService } from './clients.service';
import type { UploadedFiles as ClientUploadedFiles } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientFilterDto } from './dto/client-filter.dto';
import { CreateTratativaDto } from './dto/create-tratativa.dto';

const uploadInterceptor = FileFieldsInterceptor(
  [
    { name: 'foto', maxCount: 1 },
    { name: 'rg', maxCount: 1 },
    { name: 'comprovante', maxCount: 1 },
  ],
  { storage: memoryStorage() },
);

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles('admin', 'financeiro', 'caixa', 'consultor')
  findAll(
    @Query() filters: ClientFilterDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    const consultorFilter = currentUser.role === 'consultor' ? currentUser.id : undefined;
    return this.clientsService.findAll(filters, consultorFilter);
  }

  @Get('stats')
  @Roles('admin', 'financeiro', 'caixa')
  getStats() {
    return this.clientsService.getStats();
  }

  @Get('consultores')
  @Roles('admin', 'financeiro', 'consultor')
  findConsultores() {
    return this.clientsService.findConsultores();
  }

  @Get('quitados')
  @Roles('admin', 'financeiro', 'caixa')
  findQuitados() {
    return this.clientsService.findQuitados();
  }

  @Get(':id/document-urls')
  @Roles('admin', 'financeiro', 'caixa')
  getDocumentUrls(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.getDocumentUrls(id);
  }

  @Get(':id/tratativas')
  @Roles('admin', 'financeiro', 'consultor')
  listarTratativas(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: RequestUser,
  ) {
    const consultorFilter = currentUser.role === 'consultor' ? currentUser.id : undefined;
    return this.clientsService.listarTratativas(id, consultorFilter);
  }

  @Post(':id/tratativas')
  @Roles('admin', 'financeiro', 'consultor')
  registrarTratativa(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateTratativaDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.clientsService.registrarTratativa(id, dto, currentUser);
  }

  @Delete(':id/tratativas/:tratativaId')
  @Roles('admin', 'financeiro', 'consultor')
  removerTratativa(
    @Param('id', ParseIntPipe) id: number,
    @Param('tratativaId', ParseIntPipe) tratativaId: number,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.clientsService.removerTratativa(id, tratativaId, currentUser);
  }

  @Get(':id')
  @Roles('admin', 'financeiro', 'caixa', 'consultor')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: RequestUser,
  ) {
    const consultorFilter = currentUser.role === 'consultor' ? currentUser.id : undefined;
    return this.clientsService.findById(id, consultorFilter, currentUser.role);
  }

  @Post()
  @Roles('admin', 'financeiro', 'consultor')
  @UseInterceptors(uploadInterceptor)
  create(
    @Body() dto: CreateClientDto,
    @UploadedFiles() files: ClientUploadedFiles,
    @CurrentUser() currentUser: RequestUser,
  ) {
    // Consultor always owns the client; admin/financeiro may assign via dto.consultorId
    const consultorId = currentUser.role === 'consultor' ? currentUser.id : undefined;
    return this.clientsService.create(dto, files, consultorId);
  }

  @Patch(':id/vincular-consultor')
  @Roles('admin', 'financeiro')
  vincularConsultor(
    @Param('id', ParseIntPipe) id: number,
    @Body('consultorId') consultorId: number | null,
  ) {
    return this.clientsService.vincularConsultor(id, consultorId ?? null);
  }

  @Patch(':id')
  @Roles('admin', 'financeiro', 'consultor')
  @UseInterceptors(uploadInterceptor)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientDto,
    @UploadedFiles() files: ClientUploadedFiles,
    @CurrentUser() currentUser: RequestUser,
  ) {
    const consultorId = currentUser.role === 'consultor' ? currentUser.id : undefined;
    return this.clientsService.update(id, dto, files, consultorId);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.softDelete(id);
  }
}
