import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { dataLocal } from '../../common/data';
import { PaginatedResponse, paginate } from '../../common/dto/paginated-response.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionFilterDto } from './dto/transaction-filter.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: TransactionFilterDto): Promise<PaginatedResponse<unknown>> {
    const { page, limit, tipo, dataInicio, dataFim, categoria } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (tipo) {
      where.tipo = tipo;
    }

    if (dataInicio || dataFim) {
      const dateFilter: Record<string, Date> = {};
      if (dataInicio) dateFilter.gte = dataLocal(dataInicio);
      if (dataFim) {
        const end = dataLocal(dataFim);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where.data = dateFilter;
    }

    if (categoria) {
      where.categoria = { contains: categoria };
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { data: 'desc' },
        include: {
          user: { select: { id: true, nome: true } },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async create(dto: CreateTransactionDto, userId?: number): Promise<unknown> {
    return this.prisma.transaction.create({
      data: {
        tipo: dto.tipo,
        valor: dto.valor,
        descricao: dto.descricao ?? null,
        categoria: dto.categoria ?? null,
        data: dataLocal(dto.data),
        userId: userId ?? null,
      },
      include: {
        user: { select: { id: true, nome: true } },
      },
    });
  }

  async getSaldo(): Promise<{
    entradas: number;
    saidas: number;
    saldo: number;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [entradasResult, saidasResult] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          tipo: 'entrada',
          data: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { valor: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          tipo: 'saida',
          data: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { valor: true },
      }),
    ]);

    const entradas = Number(entradasResult._sum.valor ?? 0);
    const saidas = Number(saidasResult._sum.valor ?? 0);

    return {
      entradas,
      saidas,
      saldo: entradas - saidas,
    };
  }

  async getMovimentoMensal(
    mes: number,
    ano: number,
  ): Promise<{
    entradas: number;
    saidas: number;
    pagamentos: number;
    saldo: number;
  }> {
    const startOfMonth = new Date(ano, mes - 1, 1);
    const endOfMonth = new Date(ano, mes, 0, 23, 59, 59, 999);

    const [entradasResult, saidasResult, pagamentosCount] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          tipo: 'entrada',
          data: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { valor: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          tipo: 'saida',
          data: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { valor: true },
      }),
      this.prisma.payment.count({
        where: {
          dataPagamento: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
    ]);

    const entradas = Number(entradasResult._sum.valor ?? 0);
    const saidas = Number(saidasResult._sum.valor ?? 0);

    return {
      entradas,
      saidas,
      pagamentos: pagamentosCount,
      saldo: entradas - saidas,
    };
  }
}
