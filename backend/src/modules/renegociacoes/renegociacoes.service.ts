import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { dataLocal } from '../../common/data';
import { CreateRenegociacaoDto } from './dto/create-renegociacao.dto';
import { InstallmentsService } from '../installments/installments.service';

@Injectable()
export class RenegociacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly installments: InstallmentsService,
  ) {}

  async findAll(): Promise<unknown[]> {
    return this.prisma.renegociacao.findMany({
      include: { loan: { include: { client: { select: { id: true, nome: true, cpf: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByLoan(loanId: number): Promise<unknown[]> {
    return this.prisma.renegociacao.findMany({
      where: { loanId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateRenegociacaoDto): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: dto.loanId },
        include: {
          installments: {
            where: { status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] } },
            orderBy: { numero: 'asc' },
            include: {
              payments: {
                select: { dataPagamento: true, valorPago: true, estornado: true },
                orderBy: { dataPagamento: 'asc' },
              },
            },
          },
        },
      });

      if (!loan) throw new NotFoundException(`Empréstimo ${dto.loanId} não encontrado`);
      if (loan.status !== 'ativo')
        throw new BadRequestException('Apenas empréstimos ativos podem ser renegociados');
      if (loan.installments.length === 0)
        throw new BadRequestException('Nenhuma parcela pendente ou atrasada para renegociar');

      // Base da renegociação = saldo + encargos (multa + mora) em tempo real, idêntico
      // ao "Dívida total" mostrado no simulador ao cliente (fórmula única do sistema).
      const comEncargos = await this.installments.recalcularEncargosLista(
        loan.installments,
        loan.multaPercentual,
        loan.moraDiariaPercentual,
      );
      const saldoDevedor = comEncargos.reduce(
        (acc, inst) => acc + Number(inst.valorComEncargos),
        0,
      );

      const installmentIds = loan.installments.map((i) => i.id);
      await tx.installment.updateMany({
        where: { id: { in: installmentIds } },
        data: { status: 'cancelado' },
      });

      const n = dto.numeroParcelas;
      const taxaMensal = dto.taxaJuros / 100;
      const totalComJuros = saldoDevedor * (1 + taxaMensal * n);
      const valorParcela = Math.round((totalComJuros / n) * 100) / 100;
      const encargos = totalComJuros - saldoDevedor;

      // Split: capital = saldo renegociado / n | lucro = encargos / n
      const principalPaybackBase = Math.floor((saldoDevedor / n) * 100) / 100;
      const netGainBase          = Math.floor((encargos / n) * 100) / 100;
      const ajustePrincipal = Math.round((saldoDevedor - principalPaybackBase * n) * 100) / 100;
      const ajusteGain      = Math.round((encargos - netGainBase * n) * 100) / 100;

      const currentMaxNumero = await tx.installment.aggregate({
        where: { loanId: dto.loanId },
        _max: { numero: true },
      });
      const baseNumero = (currentMaxNumero._max.numero ?? 0) + 1;

      const newInstallments = Array.from({ length: n }, (_, i) => {
        const isLast = i === n - 1;
        const dataVencimento = dataLocal(dto.dataInicio);
        dataVencimento.setMonth(dataVencimento.getMonth() + i);
        return {
          loanId:            dto.loanId,
          numero:            baseNumero + i,
          installmentAmount: valorParcela,
          saldoDevedor:      valorParcela,
          principalPayback:  isLast
            ? Math.round((principalPaybackBase + ajustePrincipal) * 100) / 100
            : principalPaybackBase,
          netGain: isLast
            ? Math.round((netGainBase + ajusteGain) * 100) / 100
            : netGainBase,
          dataVencimento,
          status:   'pendente' as const,
          totalPago: 0,
        };
      });

      await tx.installment.createMany({ data: newInstallments });

      const renegociacao = await tx.renegociacao.create({
        data: {
          loanId: dto.loanId,
          valorTotal: Math.round(totalComJuros * 100) / 100,
          numeroParcelas: dto.numeroParcelas,
          taxaJuros: dto.taxaJuros,
          dataInicio: dataLocal(dto.dataInicio),
          observacoes: dto.observacoes ?? null,
        },
      });

      return {
        renegociacao,
        saldoRenegociado: Math.round(saldoDevedor * 100) / 100,
        parcelasNovosValor: valorParcela,
        parcelasAntigasCanceladas: installmentIds.length,
      };
    });
  }
}
