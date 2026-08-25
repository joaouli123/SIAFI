import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Client, Prisma } from '@prisma/client';
import { extname } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { dataLocal } from '../../common/data';
import { filtroCliente } from '../../common/busca';
import { SupabaseService } from '../../supabase/supabase.service';
import { PaginatedResponse, paginate } from '../../common/dto/paginated-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientFilterDto } from './dto/client-filter.dto';
import { CreateTratativaDto } from './dto/create-tratativa.dto';

const BUCKET = 'client-documents';

export interface UploadedFiles {
  foto?: Express.Multer.File[];
  rg?: Express.Multer.File[];
  comprovante?: Express.Multer.File[];
}

export interface DocumentUrls {
  fotoUrl?: string;
  rgUrl?: string;
  comprovanteUrl?: string;
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async findAll(filters: ClientFilterDto, consultorId?: number): Promise<PaginatedResponse<Client>> {
    const { page, limit, search, status, consultorId: filterConsultorId } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    // Consultor só vê sua própria carteira; admin/financeiro pode filtrar por consultor
    if (consultorId) {
      where.consultorId = consultorId;
    } else if (filterConsultorId) {
      where.consultorId = filterConsultorId;
    }

    if (status === 'active') {
      where.active = true;
    } else if (status === 'inactive') {
      where.active = false;
    }

    if (search) {
      where.OR = filtroCliente(search);
    }

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nome: 'asc' },
        include: {
          consultor: { select: { id: true, nome: true } },
        },
      }),
      this.prisma.client.count({ where }),
    ]);

    return paginate(data as any, total, page, limit);
  }

  async findById(id: number, consultorId?: number, role?: string): Promise<unknown> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        loans: { orderBy: { createdAt: 'asc' } },
        consultor: { select: { id: true, nome: true } },
        scoreRisco: { select: { scoreGeral: true, classificacao: true, calculadoEm: true } },
        meusAvalistas: true,
      },
    });
    if (!client) {
      throw new NotFoundException(`Cliente com id ${id} não encontrado`);
    }
    if (consultorId && client.consultorId !== consultorId) {
      throw new ForbiddenException('Cliente não pertence à sua carteira');
    }
    // Caixa não vê split financeiro dos contratos (lucro/capital/comissão).
    if (role === 'caixa') {
      (client as any).loans = ((client as any).loans ?? []).map((l: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { targetProfit, principalAmount, comissaoPercentual, comissaoAdministradorPercentual, ...rest } = l;
        return rest;
      });
    }
    return client;
  }

  async findConsultores(): Promise<{ id: number; nome: string }[]> {
    return this.prisma.user.findMany({
      where: { role: 'consultor', active: true },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });
  }

  async vincularConsultor(clientId: number, consultorId: number | null): Promise<unknown> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException(`Cliente ${clientId} não encontrado`);

    if (consultorId !== null) {
      const consultor = await this.prisma.user.findUnique({ where: { id: consultorId } });
      if (!consultor || consultor.role !== 'consultor') {
        throw new BadRequestException('Usuário não encontrado ou não é consultor');
      }
    }

    return this.prisma.client.update({
      where: { id: clientId },
      data: { consultorId },
      include: { consultor: { select: { id: true, nome: true } } },
    });
  }

  async create(dto: CreateClientDto, files?: UploadedFiles, consultorId?: number): Promise<Client> {
    const effectiveConsultorId = consultorId ?? dto.consultorId ?? null;

    const data: Prisma.ClientCreateInput = {
      nome: dto.nome,
      cpf: dto.cpf ?? null,
      rg: dto.rg ?? null,
      dataNascimento: dto.dataNascimento ? dataLocal(dto.dataNascimento) : null,
      email: dto.email ?? null,
      whatsapp: dto.whatsapp ?? null,
      telefone: dto.telefone ?? null,
      endereco: dto.endereco ?? null,
      bairro: dto.bairro ?? null,
      cidade: dto.cidade ?? null,
      estado: dto.estado ?? null,
      cep: dto.cep ?? null,
      observacoes: dto.observacoes ?? null,
      notificacoesEmail: dto.notificacoesEmail ?? true,
      ...(effectiveConsultorId ? { consultor: { connect: { id: effectiveConsultorId } } } : {}),
      referencia1Nome: dto.referencia1Nome ?? null,
      referencia1Telefone: dto.referencia1Telefone ?? null,
      referencia1Vinculo: dto.referencia1Vinculo ?? null,
      referencia2Nome: dto.referencia2Nome ?? null,
      referencia2Telefone: dto.referencia2Telefone ?? null,
      referencia2Vinculo: dto.referencia2Vinculo ?? null,
    };

    if (dto.avalistas && dto.avalistas.length > 0) {
      data.meusAvalistas = {
        create: dto.avalistas.map(a => ({
          nome: a.nome,
          cpf: a.cpf ?? null,
          telefone: a.telefone ?? null,
          email: a.email ?? null,
          endereco: a.endereco ?? null,
          parentesco: a.parentesco ?? null,
          clienteVinculadoId: a.clienteId ?? null,
        }))
      };
    }

    let client: Client;
    try {
      client = await this.prisma.client.create({ data });
    } catch (err: unknown) {
      if (
        typeof err === 'object' && err !== null &&
        (err as any).code === 'P2002'
      ) {
        const fields = (err as any).meta?.target as string[] | undefined;
        if (fields?.includes('cpf') || fields?.some((f: string) => f.includes('cpf'))) {
          throw new BadRequestException('CPF/CNPJ já cadastrado. Verifique se o cliente já existe no sistema.');
        }
        throw new BadRequestException('Dados duplicados: verifique as informações e tente novamente.');
      }
      throw err;
    }

    if (files && Object.values(files).some((f) => f?.length)) {
      const paths = await this.uploadFiles(client.id, files);
      return this.prisma.client.update({ where: { id: client.id }, data: paths });
    }

    return client;
  }

  async update(id: number, dto: UpdateClientDto, files?: UploadedFiles, consultorId?: number): Promise<Client> {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Cliente ${id} não encontrado`);

    // Consultor só pode alterar dados cadastrais do próprio cliente
    if (consultorId && existing.consultorId !== consultorId) {
      throw new ForbiddenException('Acesso negado: cliente não pertence à sua carteira.');
    }

    const data: Record<string, unknown> = {};

    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.cpf !== undefined) data.cpf = dto.cpf;
    if (dto.rg !== undefined) data.rg = dto.rg;
    if (dto.dataNascimento !== undefined) data.dataNascimento = dataLocal(dto.dataNascimento);
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.whatsapp !== undefined) data.whatsapp = dto.whatsapp;
    if (dto.telefone !== undefined) data.telefone = dto.telefone;
    if (dto.endereco !== undefined) data.endereco = dto.endereco;
    if (dto.bairro !== undefined) data.bairro = dto.bairro;
    if (dto.cidade !== undefined) data.cidade = dto.cidade;
    if (dto.estado !== undefined) data.estado = dto.estado;
    if (dto.cep !== undefined) data.cep = dto.cep;
    if (dto.observacoes !== undefined) data.observacoes = dto.observacoes;
    if (dto.notificacoesEmail !== undefined) data.notificacoesEmail = dto.notificacoesEmail;
    if (dto.referencia1Nome !== undefined) data.referencia1Nome = dto.referencia1Nome;
    if (dto.referencia1Telefone !== undefined) data.referencia1Telefone = dto.referencia1Telefone;
    if (dto.referencia1Vinculo !== undefined) data.referencia1Vinculo = dto.referencia1Vinculo;
    if (dto.referencia2Nome !== undefined) data.referencia2Nome = dto.referencia2Nome;
    if (dto.referencia2Telefone !== undefined) data.referencia2Telefone = dto.referencia2Telefone;
    if (dto.referencia2Vinculo !== undefined) data.referencia2Vinculo = dto.referencia2Vinculo;

    if (dto.avalistas !== undefined) {
      data.meusAvalistas = {
        deleteMany: {},
        create: dto.avalistas.map(a => ({
          nome: a.nome,
          cpf: a.cpf ?? null,
          telefone: a.telefone ?? null,
          email: a.email ?? null,
          endereco: a.endereco ?? null,
          parentesco: a.parentesco ?? null,
          clienteVinculadoId: a.clienteId ?? null,
        }))
      };
    }

    // Campos administrativos — apenas admin/financeiro (consultorId presente = consultor bloqueado)
    if (!consultorId) {
      if (dto.active !== undefined) data.active = dto.active;
      if ('consultorId' in dto) data.consultorId = (dto as any).consultorId ?? null;
    }

    if (files && Object.values(files).some((f) => f?.length)) {
      const paths = await this.uploadFiles(id, files);
      Object.assign(data, paths);
    }

    return this.prisma.client.update({ where: { id }, data });
  }

  // ─── Tratativas ────────────────────────────────────────────────────────────

  /// Checagem leve de acesso. findById serve, mas carrega loans, avalistas e
  /// score so pra decidir se o consultor pode ver a lista de tratativas.
  private async assertAcessoCliente(id: number, consultorId?: number): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: { id: true, consultorId: true },
    });
    if (!client) {
      throw new NotFoundException(`Cliente com id ${id} nao encontrado`);
    }
    if (consultorId && client.consultorId !== consultorId) {
      throw new ForbiddenException('Cliente nao pertence a sua carteira');
    }
  }

  async listarTratativas(id: number, consultorId?: number): Promise<unknown[]> {
    await this.assertAcessoCliente(id, consultorId);
    return this.prisma.clienteTratativa.findMany({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, nome: true, role: true } } },
    });
  }

  async registrarTratativa(
    id: number,
    dto: CreateTratativaDto,
    autor: { id: number; role: string },
  ): Promise<unknown> {
    await this.assertAcessoCliente(id, autor.role === 'consultor' ? autor.id : undefined);

    const tratativa = await this.prisma.clienteTratativa.create({
      data: {
        clientId: id,
        userId: autor.id,
        canal: dto.canal,
        descricao: dto.descricao.trim(),
      },
      include: { user: { select: { id: true, nome: true, role: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: autor.id,
        acao: 'CLIENTE_TRATATIVA_REGISTRADA',
        entidade: 'Client',
        entidadeId: id,
        dados: { tratativaId: tratativa.id, canal: dto.canal },
      },
    });

    return tratativa;
  }

  /// So o autor apaga a propria tratativa; admin e financeiro apagam qualquer
  /// uma. Consultor nao mexe no registro de outro consultor.
  async removerTratativa(
    id: number,
    tratativaId: number,
    autor: { id: number; role: string },
  ): Promise<void> {
    await this.assertAcessoCliente(id, autor.role === 'consultor' ? autor.id : undefined);

    const tratativa = await this.prisma.clienteTratativa.findUnique({
      where: { id: tratativaId },
      select: { id: true, clientId: true, userId: true },
    });
    if (!tratativa || tratativa.clientId !== id) {
      throw new NotFoundException(`Tratativa ${tratativaId} nao encontrada`);
    }
    const podeApagarDeOutro = autor.role === 'admin' || autor.role === 'financeiro';
    if (tratativa.userId !== autor.id && !podeApagarDeOutro) {
      throw new ForbiddenException('Voce so pode remover as tratativas que registrou');
    }

    await this.prisma.clienteTratativa.delete({ where: { id: tratativaId } });
    await this.prisma.auditLog.create({
      data: {
        userId: autor.id,
        acao: 'CLIENTE_TRATATIVA_REMOVIDA',
        entidade: 'Client',
        entidadeId: id,
        dados: { tratativaId },
      },
    });
  }

  async softDelete(id: number): Promise<void> {
    await this.findById(id);
    await this.prisma.client.update({
      where: { id },
      data: { active: false },
    });
  }

  async getStats(): Promise<{ total: number; ativos: number; inativos: number; quitados: number; atrasados: number }> {
    const [total, ativos, quitados, atrasados] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.client.count({ where: { active: true } }),
      this.prisma.client.count({
        where: { loans: { some: { status: 'quitado' } } },
      }),
      this.prisma.client.count({
        where: {
          loans: { some: { installments: { some: { status: 'atrasado' } } } },
        },
      }),
    ]);

    return { total, ativos, inativos: total - ativos, quitados, atrasados };
  }

  async findQuitados(): Promise<unknown[]> {
    const clients = await this.prisma.client.findMany({
      where: { loans: { some: { status: 'quitado' } } },
      select: {
        id: true,
        nome: true,
        cpf: true,
        whatsapp: true,
        email: true,
        observacoes: true,
        consultor: { select: { id: true, nome: true } },
        loans: {
          select: {
            id: true,
            status: true,
            principalAmount: true,
            totalReceivable: true,
          },
        },
      },
      orderBy: { nome: 'asc' },
    });

    const ids = clients.map((c) => c.id);

    // Installment nao guarda data de quitacao: a referencia e a ultima baixa viva
    // num contrato ja quitado.
    const baixas = ids.length
      ? await this.prisma.payment.findMany({
          where: {
            estornado: false,
            installment: { loan: { status: 'quitado', clientId: { in: ids } } },
          },
          select: {
            dataPagamento: true,
            installment: { select: { loan: { select: { clientId: true } } } },
          },
          orderBy: { dataPagamento: 'desc' },
        })
      : [];

    const ultimaQuitacao = new Map<number, Date>();
    for (const b of baixas) {
      const clientId = b.installment.loan.clientId;
      if (!ultimaQuitacao.has(clientId)) {
        ultimaQuitacao.set(clientId, b.dataPagamento);
      }
    }

    return clients.map((c) => {
      const quitados = c.loans.filter((l) => l.status === 'quitado');
      const ativos = c.loans.filter((l) => l.status === 'ativo');
      const soma = (
        lista: typeof quitados,
        campo: 'principalAmount' | 'totalReceivable',
      ) => lista.reduce((acc, l) => acc + Number(l[campo]), 0);

      return {
        id: c.id,
        nome: c.nome,
        cpf: c.cpf,
        whatsapp: c.whatsapp,
        email: c.email,
        observacoes: c.observacoes,
        consultor: c.consultor,
        contratosQuitados: quitados.length,
        contratosAtivos: ativos.length,
        capitalEmprestado: soma(quitados, 'principalAmount'),
        totalQuitado: soma(quitados, 'totalReceivable'),
        ultimaQuitacao: ultimaQuitacao.get(c.id) ?? null,
      };
    });
  }

  async getDocumentUrls(id: number): Promise<DocumentUrls> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: { fotoPath: true, rgPath: true, comprovantePath: true },
    });
    if (!client) throw new NotFoundException(`Cliente com id ${id} não encontrado`);

    const urls: DocumentUrls = {};
    const EXPIRY = 3600;

    await Promise.all([
      client.fotoPath
        ? this.supabase.createSignedUrl(BUCKET, client.fotoPath, EXPIRY)
            .then((url) => { urls.fotoUrl = url })
            .catch(() => {})
        : Promise.resolve(),
      client.rgPath
        ? this.supabase.createSignedUrl(BUCKET, client.rgPath, EXPIRY)
            .then((url) => { urls.rgUrl = url })
            .catch(() => {})
        : Promise.resolve(),
      client.comprovantePath
        ? this.supabase.createSignedUrl(BUCKET, client.comprovantePath, EXPIRY)
            .then((url) => { urls.comprovanteUrl = url })
            .catch(() => {})
        : Promise.resolve(),
    ]);

    return urls;
  }

  private async uploadFiles(
    clientId: number,
    files: UploadedFiles,
  ): Promise<{ fotoPath?: string; rgPath?: string; comprovantePath?: string }> {
    const paths: { fotoPath?: string; rgPath?: string; comprovantePath?: string } = {};

    await Promise.all([
      files.foto?.[0]
        ? this.supabase.uploadFile(
            BUCKET,
            `clients/${clientId}/foto${extname(files.foto[0].originalname) || '.jpg'}`,
            files.foto[0].buffer,
            files.foto[0].mimetype,
          ).then((p) => { paths.fotoPath = p })
        : Promise.resolve(),

      files.rg?.[0]
        ? this.supabase.uploadFile(
            BUCKET,
            `clients/${clientId}/rg${extname(files.rg[0].originalname) || '.jpg'}`,
            files.rg[0].buffer,
            files.rg[0].mimetype,
          ).then((p) => { paths.rgPath = p })
        : Promise.resolve(),

      files.comprovante?.[0]
        ? this.supabase.uploadFile(
            BUCKET,
            `clients/${clientId}/comprovante${extname(files.comprovante[0].originalname) || '.jpg'}`,
            files.comprovante[0].buffer,
            files.comprovante[0].mimetype,
          ).then((p) => { paths.comprovantePath = p })
        : Promise.resolve(),
    ]);

    return paths;
  }
}
