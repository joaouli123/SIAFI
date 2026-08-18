import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export interface CreateUserDto {
  nome: string;
  username: string;
  password: string;
  role: string;
  comissaoPercentual?: number;
}

export interface UpdateUserDto {
  nome?: string;
  username?: string;
  password?: string;
  role?: string;
  active?: boolean;
  comissaoPercentual?: number | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

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
    this.validateCommission(dto.comissaoPercentual, dto.role);
    const user = await this.prisma.user.create({
      data: {
        nome: dto.nome,
        username: dto.username,
        password: hashed,
        role: dto.role as any,
        comissaoPercentual: dto.comissaoPercentual ?? null,
        active: true,
      },
    });
    const { password: _, ...safe } = user;
    return safe;
  }

  async update(id: number, dto: UpdateUserDto): Promise<Omit<User, 'password'>> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Usuário não encontrado');

    this.validateCommission(dto.comissaoPercentual, dto.role ?? existing.role);

    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.comissaoPercentual !== undefined) data.comissaoPercentual = dto.comissaoPercentual;
    if (dto.password) data.password = await bcrypt.hash(dto.password, 12);

    // O login autentica no Supabase com `${username}@siafi.local`; trocar o
    // username (ou a senha) só no Prisma deixa a conta Supabase órfã e o
    // operador sem conseguir logar. Sincroniza antes de gravar.
    const usernameMudou = dto.username !== undefined && dto.username !== existing.username;
    if (existing.supabaseId && (usernameMudou || dto.password || dto.role !== undefined)) {
      const attrs: Record<string, any> = {};
      if (usernameMudou) {
        attrs.email = `${dto.username}@siafi.local`;
        attrs.email_confirm = true;
        attrs.user_metadata = { username: dto.username, nome: dto.nome ?? existing.nome };
      }
      if (dto.password) attrs.password = dto.password;
      if (dto.role !== undefined) attrs.app_metadata = { role: dto.role, prismaId: existing.id, tipo: 'operador' };
      const { error } = await this.supabase.admin.auth.admin.updateUserById(existing.supabaseId, attrs);
      if (error) throw new ConflictException(`Falha ao sincronizar conta de acesso: ${error.message}`);
      if (usernameMudou) data.email = `${dto.username}@siafi.local`;
    }

    const user = await this.prisma.user.update({ where: { id }, data });
    const { password: _, ...safe } = user;
    return safe;
  }

  private validateCommission(value: number | null | undefined, role: string): void {
    if (value == null) return;
    if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) {
      throw new ConflictException('A comissão deve estar entre 0% e 100%.');
    }
    if (role !== 'consultor' && role !== 'admin') {
      throw new ConflictException('Comissão só pode ser configurada para consultores ou administradores.');
    }
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Usuário não encontrado');
    await this.prisma.user.update({ where: { id }, data: { active: false } });
  }
}
