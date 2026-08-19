import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin')
  findAll() {
    return this.usersService.findAll();
  }

  // Retorna apenas id+nome dos admins — acessível a qualquer perfil interno para o fluxo de suporte
  @Get('admins')
  @Roles('admin', 'financeiro', 'consultor', 'caixa')
  findAdmins() {
    return this.usersService.findByRole('admin');
  }

  // Lista mínima de usuários internos (id/nome/role) — para o chat interno (todos os perfis)
  @Get('internos')
  @Roles('admin', 'financeiro', 'consultor', 'caixa')
  findInternos() {
    return this.usersService.findInternosMinimal();
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.softDelete(id);
  }
}
