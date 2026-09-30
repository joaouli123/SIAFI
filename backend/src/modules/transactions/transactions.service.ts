import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { dataLocal } from '../../common/data';
import { Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/paginated-response.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionFilterDto } from './dto/transaction-filter.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  private montarWhere(filters: {
    tipo?: string;
    dataInicio?: string;
    dataFim?: string;
    categoria?: string;
  }): Prisma.TransactionWhereInput {
    const { tipo, dataInicio, dataFim, categoria } = filters;
    const where: Prisma.TransactionWhereInput = {};

    if (tipo) {
      where.tipo = tipo;
    }

    if (dataInicio || dataFim) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (dataInicio) dateFilter.gte = dataLocal(dataInicio);
      if (dataFim) {
        const end = dataLocal(dataFim);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where.data = dateFilter;
    }

    if (categoria) {
      where.categoria = { contains: categoria, mode: 'insensitive' };
    }

    return where;
  }

  /// Soma de entradas e saidas sobre o filtro inteiro, nao so a pagina: a tela
  /// mostrava 50 lancamentos de agosto com os cards zerados de setembro, e o
  /// operador nao tinha como conferir o caixa do periodo.
  private async somar(where: Prisma.TransactionWhereInput) {
    const grupos = await this.prisma.transaction.groupBy({
      by: ['tipo'],
      where,
      _sum: { valor: true },
      _count: true,
    });
    const soma = (tipo: string) => Number(grupos.find((g) => g.tipo === tipo)?._sum.valor ?? 0);
    const qtd = (tipo: string) => grupos.find((g) => g.tipo === tipo)?._count ?? 0;
    const entradas = soma('entrada');
    const saidas = soma('saida');
    return {
      entradas,
      saidas,
      saldo: Number((entradas - saidas).toFixed(2)),
      qtdEntradas: qtd('entrada'),
      qtdSaidas: qtd('saida'),
    };
  }

  async findAll(filters: TransactionFilterDto): Promise<unknown> {
    const { page, limit } = filters;
    const skip = (page - 1) * limit;
    const where = this.montarWhere(filters);

    const [data, total, totais] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ data: 'desc' }, { id: 'desc' }],
        include: {
          user: { select: { id: true, nome: true } },
        },
      }),
      this.prisma.transaction.count({ where }),
      this.somar(where),
    ]);

    return { ...paginate(data, total, page, limit), totais };
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

  async getSaldo(dataInicio?: string, dataFim?: string): Promise<{
    entradas: number;
    saidas: number;
    saldo: number;
  }> {
    if (dataInicio || dataFim) {
      return this.somar(this.montarWhere({ dataInicio, dataFim }));
    }
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return this.somar({ data: { gte: startOfMonth, lte: endOfMonth } });
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
