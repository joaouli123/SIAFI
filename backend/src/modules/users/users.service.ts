import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export interface CreateUserDto {
  nome: string;
  username: string;
  password: string;
  role: string;
}

export interface UpdateUserDto {
  nome?: string;
  username?: string;
  password?: string;
  role?: string;
  active?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findAll(): Promise<Omit<User, 'password'>[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { nome: 'asc' },
    });
    return users.map(({ password: _, ...u }) => u);
  }

  async findByRole(role: string): Promise<{ id: number; nome: string }[]> {
    return this.prisma.user.findMany({
      where: { role: role as any, active: true },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });
  }

  // Usuários internos (id/nome/role) — para o chat interno iniciar conversa com qualquer operador.
  async findInternosMinimal(): Promise<{ id: number; nome: string; role: string }[]> {
    return this.prisma.user.findMany({
      where: { active: true },
      select: { id: true, nome: true, role: true },
      orderBy: { nome: 'asc' },
    });
  }

  async create(dto: CreateUserDto): Promise<Omit<User, 'password'>> {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException('Username já está em uso');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        nome: dto.nome,
        username: dto.username,
        password: hashed,
        role: dto.role as any,
        active: true,
      },
    });
    const { password: _, ...safe } = user;
    return safe;
  }

  async update(id: number, dto: UpdateUserDto): Promise<Omit<User, 'password'>> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Usuário não encontrado');

    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.password) data.password = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.update({ where: { id }, data });
    const { password: _, ...safe } = user;
    return safe;
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Usuário não encontrado');
    await this.prisma.user.update({ where: { id }, data: { active: false } });
  }
}
