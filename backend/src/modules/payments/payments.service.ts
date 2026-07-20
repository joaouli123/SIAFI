import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import Decimal from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import { ScoreRiscoService } from '../score-risco/score-risco.service';
import { InstallmentsService } from '../installments/installments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreRisco: ScoreRiscoService,
    private readonly installments: InstallmentsService,
  ) {}

  async create(dto: CreatePaymentDto, userId?: number): Promise<unknown> {
    // Encargos (multa/mora) em TEMPO REAL para esta parcela. O teto do pagamento é
    // validado contra a mora ATUAL — não contra installment.moraAcumulada, que fica
    // defasado quando o cron de encargos ainda não rodou ou a parcela tinha saldo 0
    // (o que fazia baixas de parcelas atrasadas serem rejeitadas indevidamente).
    const encAtual = await this.installments.getEncargos(dto.installmentId);

    const payment = await this.prisma.$transaction(async (tx) => {
      // 1. Buscar parcela com loan e client
      const installment = await tx.installment.findUnique({
        where: { id: dto.installmentId },
        include: {
          loan: {
            include: {
              client: { select: { id: true, nome: true } },
            },
          },
        },
      });

      if (!installment) {
        throw new NotFoundException(`Parcela com id ${dto.installmentId} não encontrada`);
      }

      if (installment.status === 'pago' || installment.status === 'cancelado') {
        throw new BadRequestException(`Parcela já está ${installment.status}.`);
      }

      const valorPago         = new Decimal(dto.valorPago.toString());
      const installmentAmount = new Decimal(installment.installmentAmount.toString());
      const moraAcumulada     = new Decimal(installment.moraAcumulada.toString());
      const moraAtual         = new Decimal(encAtual.valorMora.toString());
      const multaAtual        = new Decimal(encAtual.valorMulta.toString());
      const totalPagoAnt      = new Decimal(installment.totalPago.toString());
      const novoTotalPago     = totalPagoAnt.plus(valorPago);

      // Desconto concedido nesta baixa: 'saldo' (abate o valor da parcela → quita com menos)
      // ou 'encargos' (perdoa multa/mora; não conta para quitar o principal).
      const desconto       = new Decimal((dto.desconto ?? 0).toString());
      const descontoTipo   = desconto.gt(0) ? (dto.descontoTipo ?? 'saldo') : null;
      const descontoSaldo  = descontoTipo === 'saldo' ? desconto : new Decimal(0);

      if (valorPago.lt(0)) {
        throw new BadRequestException('Valor do pagamento não pode ser negativo.');
      }
      if (valorPago.isZero() && desconto.lte(0)) {
        throw new BadRequestException('Informe um valor pago ou um desconto.');
      }

      // Descontos de saldo já concedidos nesta parcela (baixas anteriores)
      const descAnt = await tx.payment.aggregate({
        where: { installmentId: dto.installmentId, descontoTipo: 'saldo' },
        _sum: { desconto: true },
      });
      const totalDescontoSaldo = new Decimal(descAnt._sum.desconto?.toString() ?? '0').plus(descontoSaldo);

      // Quitação considera o recebido + desconto sobre saldo. O teto é o valor da
      // parcela + a mora ATUAL (tempo real), coerente com o total exibido ao operador.
      const efetivo      = novoTotalPago.plus(totalDescontoSaldo);
      const limiteMaximo = installmentAmount.plus(moraAtual).plus(multaAtual);
      if (efetivo.greaterThan(limiteMaximo.plus(0.001))) {
        throw new BadRequestException(
          `Valor pago + desconto (${efetivo.toFixed(2)}) excede o total devido com encargos (${limiteMaximo.toFixed(2)}).`,
        );
      }

      const novoSaldo           = installmentAmount.minus(efetivo).clampedTo(0, Infinity);
      const parcialmenteQuitado = efetivo.greaterThanOrEqualTo(installmentAmount);

      // Status: pago (quitou o principal), parcialmente_pago, ou mantém atrasado se vencida
      let novoStatus: string;
      if (parcialmenteQuitado) {
        novoStatus = 'pago';
      } else {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const venc = new Date(installment.dataVencimento);
        venc.setHours(0, 0, 0, 0);
        novoStatus = venc < hoje ? 'atrasado' : 'parcialmente_pago';
      }

      // Snapshot "antes"
      const snapshotAntes = {
        status:       installment.status,
        totalPago:    totalPagoAnt.toString(),
        saldoDevedor: installment.saldoDevedor.toString(),
        moraAcumulada: moraAcumulada.toString(),
      };

      // 2. Criar registro de pagamento
      const newPayment = await tx.payment.create({
        data: {
          installmentId:   dto.installmentId,
          valorPago:       valorPago.toDecimalPlaces(2).toNumber(),
          valorDevido:     installmentAmount.plus(moraAtual).plus(multaAtual).toDecimalPlaces(2).toNumber(),
          dataPagamento:   new Date(dto.dataPagamento),
          metodoPagamento: (dto.metodoPagamento ?? 'dinheiro') as PaymentMethod,
          observacao:      dto.observacao ?? null,
          contaDestino:    dto.contaDestino ?? null,
          desconto:        desconto.toDecimalPlaces(2).toNumber(),
          descontoTipo:    descontoTipo,
          descontoMotivo:  dto.descontoMotivo ?? null,
        },
      });

      // 3. Atualizar totalPago, saldoDevedor e status
      await tx.installment.update({
        where: { id: dto.installmentId },
        data: {
          totalPago:    novoTotalPago.toDecimalPlaces(2).toNumber(),
          saldoDevedor: novoSaldo.toDecimalPlaces(2).toNumber(),
          status:       novoStatus as any,
        },
      });

      // 4. Verificar quitação total do contrato
      if (novoStatus === 'pago') {
        const unpaidCount = await tx.installment.count({
          where: {
            loanId: installment.loanId,
            status: { notIn: ['pago', 'cancelado'] },
            id:     { not: dto.installmentId },
          },
        });
        if (unpaidCount === 0) {
          await tx.loan.update({
            where: { id: installment.loanId },
            data:  { status: 'quitado' },
          });
        }
      }

      // 5. Criar Transaction financeira (desconto não entra no caixa; pula se nada recebido)
      if (valorPago.gt(0)) {
        await tx.transaction.create({
          data: {
            tipo:      'entrada',
            valor:     valorPago.toDecimalPlaces(2).toNumber(),
            descricao: `Pgto ${novoStatus === 'pago' ? 'total' : 'parcial'} parcela #${installment.numero} - ${installment.loan.client.nome}${dto.contaDestino ? ` · ${dto.contaDestino}` : ''}`,
            categoria: 'Pagamento de Parcela',
            data:      new Date(dto.dataPagamento),
            userId:    userId ?? null,
          },
        });
      }

      // 6. AuditLog
      const snapshotDepois = {
        status:       novoStatus,
        totalPago:    novoTotalPago.toString(),
        saldoDevedor: novoSaldo.toString(),
        parcial:      novoStatus !== 'pago',
      };

      const dadosAudit = {
        snapshot: {
          antes: snapshotAntes,
          depois: snapshotDepois,
          pagamento: {
            paymentId:       newPayment.id,
            valorPago:       valorPago.toString(),
            metodoPagamento: dto.metodoPagamento ?? 'dinheiro',
            dataPagamento:   dto.dataPagamento,
            parcela_split: {
              principalPayback: installment.principalPayback.toString(),
              netGain:          installment.netGain.toString(),
            },
          },
        },
      };

      const hash = createHash('sha256')
        .update(JSON.stringify({ userId, acao: 'PAYMENT_REGISTRADO', entidade: 'installments', entidadeId: installment.id, dados: dadosAudit, ts: Date.now() }))
        .digest('hex');

      await tx.auditLog.create({
        data: {
          userId:     userId ?? null,
          acao:       'PAYMENT_REGISTRADO',
          entidade:   'installments',
          entidadeId: installment.id,
          dados:      dadosAudit as Prisma.InputJsonValue,
          hash,
        },
      });

      return { payment: newPayment, clientId: installment.loan.client.id };
    });

    void this.scoreRisco.recalcularScore(payment.clientId);
    return payment.payment;
  }

  // Quitação total do contrato: dá baixa em todas as parcelas em aberto de uma vez,
  // aplicando o desconto (% sobre o lucro a vencer) — do contrato ou informado.
  async quitarContrato(
    loanId: number,
    dto: { dataPagamento: string; metodoPagamento?: string; contaDestino?: string; descontoPercentual?: number },
    userId?: number,
  ): Promise<unknown> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        installments: {
          where: { status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] } },
          orderBy: { numero: 'asc' },
        },
      },
    });
    if (!loan) throw new NotFoundException(`Empréstimo ${loanId} não encontrado`);
    if (loan.status === 'cancelado' || loan.status === 'quitado') {
      throw new BadRequestException('Contrato não está em aberto para quitação.');
    }

    const pct = dto.descontoPercentual != null
      ? Number(dto.descontoPercentual)
      : Number(loan.descontoQuitacaoPercentual ?? 0);

    let totalRecebido = 0, totalDesconto = 0, parcelas = 0;
    for (const inst of loan.installments) {
      const saldoParc = Number(inst.installmentAmount) - Number(inst.totalPago);
      if (saldoParc <= 0.005) continue;
      const lucroRealizado = Math.max(0, Number(inst.totalPago) - Number(inst.principalPayback));
      const remainingLucro = Math.max(0, Number(inst.netGain) - lucroRealizado);
      let descontoParc = parseFloat(((remainingLucro * pct) / 100).toFixed(2));
      if (descontoParc > saldoParc) descontoParc = saldoParc;
      const valorPago = parseFloat((saldoParc - descontoParc).toFixed(2));

      await this.create(
        {
          installmentId:   inst.id,
          valorPago,
          dataPagamento:   dto.dataPagamento,
          metodoPagamento: (dto.metodoPagamento ?? 'dinheiro') as CreatePaymentDto['metodoPagamento'],
          contaDestino:    dto.contaDestino,
          desconto:        descontoParc > 0 ? descontoParc : undefined,
          descontoTipo:    descontoParc > 0 ? 'saldo' : undefined,
          descontoMotivo:  descontoParc > 0 ? 'Quitação total do contrato' : undefined,
        },
        userId,
      );
      totalRecebido += valorPago;
      totalDesconto += descontoParc;
      parcelas++;
    }

    return {
      loanId,
      parcelasQuitadas: parcelas,
      totalRecebido: parseFloat(totalRecebido.toFixed(2)),
      totalDesconto: parseFloat(totalDesconto.toFixed(2)),
      percentual: pct,
    };
  }

  async findAll(filter: import('./dto/payment-filter.dto').PaymentFilterDto, role?: string): Promise<unknown> {
    const { search, startDate, endDate, consultorId, page = 1, limit = 20 } = filter;

    const where: Prisma.PaymentWhereInput = {};

    if (search || consultorId) {
      // Consultor = carteira do CLIENTE (client.consultorId), não o criador do contrato.
      const clientWhere: Prisma.ClientWhereInput = {};
      if (search) clientWhere.nome = { contains: search, mode: 'insensitive' };
      if (consultorId) clientWhere.consultorId = consultorId;
      where.installment = { loan: { client: clientWhere } };
    }

    if (startDate || endDate) {
      where.dataPagamento = {};
      if (startDate) {
        where.dataPagamento.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        where.dataPagamento.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    const skip = (page - 1) * limit;

    const [total, totaisAgg, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where, _sum: { valorPago: true, desconto: true } }),
      this.prisma.payment.findMany({
        where,
        include: {
          installment: {
            select: {
              id: true,
              numero: true,
              principalPayback: true,
              installmentAmount: true,
              loan: {
                select: {
                  id: true,
                  comissaoPercentual: true,
                  client: { select: { nome: true, consultor: { select: { id: true, nome: true } } } },
                },
              },
              payments: {
                select: { id: true, valorPago: true, createdAt: true },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              },
            },
          },
        },
        orderBy: { dataPagamento: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const verSplit = role !== 'caixa';

    const mappedData = payments.map((p) => {
      const inst = p.installment as unknown as {
        principalPayback: unknown;
        loan: { comissaoPercentual: unknown };
        payments: Array<{ id: number; valorPago: unknown }>;
      };
      const split = verSplit ? this.splitPagamento(p.id, Number(p.valorPago), inst) : null;
      const { payments: _omit, ...instRest } = inst as Record<string, unknown>;
      return { ...p, installment: instRest, split };
    });

    return {
      data: mappedData,
      total,
      page,
      lastPage: Math.ceil(total / limit),
      // Totais do PERÍODO inteiro (todo o filtro), não só da página.
      totais: {
        recebido: Number(totaisAgg._sum.valorPago ?? 0),
        desconto: Number(totaisAgg._sum.desconto ?? 0),
      },
    };
  }

  // Divisão de uma baixa em capital × lucro (capital primeiro) e comissão do consultor.
  // lucro realizado da parcela = max(0, totalPago − principalPayback); a parte de lucro
  // desta baixa é o incremento de lucro realizado que ela provocou.
  private splitPagamento(
    paymentId: number,
    valorPago: number,
    inst: { principalPayback: unknown; loan: { comissaoPercentual: unknown }; payments: Array<{ id: number; valorPago: unknown }> },
  ): { capital: number; lucro: number; comissao: number; lucroEmpresa: number; comissaoPercentual: number } {
    const principal = Number(inst.principalPayback);
    const pct = Number(inst.loan.comissaoPercentual ?? 0);

    let cumBefore = 0;
    for (const x of inst.payments) {
      if (x.id === paymentId) break;
      cumBefore += Number(x.valorPago);
    }
    const cumAfter = cumBefore + valorPago;
    const lucroBefore = Math.max(0, cumBefore - principal);
    const lucroAfter = Math.max(0, cumAfter - principal);
    const lucro = parseFloat((lucroAfter - lucroBefore).toFixed(2));
    const capital = parseFloat((valorPago - lucro).toFixed(2));
    const comissao = parseFloat(((lucro * pct) / 100).toFixed(2));
    const lucroEmpresa = parseFloat((lucro - comissao).toFixed(2));
    return { capital, lucro, comissao, lucroEmpresa, comissaoPercentual: pct };
  }

  async findByInstallment(installmentId: number): Promise<unknown[]> {
    return this.prisma.payment.findMany({
      where: { installmentId },
      orderBy: { dataPagamento: 'desc' },
    });
  }

  // Pagamentos registrados hoje — dashboard do caixa.
  async findHoje(): Promise<unknown[]> {
    const hoje = new Date();
    const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
    const fimDia    = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);

    return this.prisma.payment.findMany({
      where: {
        dataPagamento: { gte: inicioDia, lte: fimDia },
        estornado: false,
      },
      orderBy: { dataPagamento: 'desc' },
      include: {
        installment: {
          include: {
            loan: {
              include: {
                client: { select: { id: true, nome: true, nomeSocial: true } },
              },
            },
          },
        },
      },
    });
  }

  async estornar(id: number, userId?: number): Promise<unknown> {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Buscar pagamento com parcela e loan
      const payment = await tx.payment.findUnique({
        where: { id },
        include: {
          installment: {
            include: {
              loan: {
                include: { client: { select: { id: true, nome: true } } },
              },
            },
          },
        },
      });

      if (!payment) {
        throw new NotFoundException(`Pagamento com id ${id} não encontrado`);
      }

      const installment = payment.installment;
      const loan        = installment.loan;

      // Snapshot "antes" do estorno
      const snapshotAntes = {
        status:            installment.status,
        totalPago:         installment.totalPago.toString(),
        installmentAmount: installment.installmentAmount.toString(),
        principalPayback:  installment.principalPayback.toString(),
        netGain:           installment.netGain.toString(),
      };

      // 2. Deletar o pagamento
      await tx.payment.delete({ where: { id } });

      // 3. Recalcular totalPago e descontos de saldo restantes
      const remaining = await tx.payment.aggregate({
        where: { installmentId: installment.id },
        _sum:  { valorPago: true },
      });
      const remainingDesc = await tx.payment.aggregate({
        where: { installmentId: installment.id, descontoTipo: 'saldo' },
        _sum:  { desconto: true },
      });
      const novoTotalPago    = Number(remaining._sum.valorPago ?? 0);
      const descontoRestante = Number(remainingDesc._sum.desconto ?? 0);

      const installmentAmount = new Decimal(installment.installmentAmount.toString());
      const efetivoRestante   = novoTotalPago + descontoRestante;

      // 4. Determinar novo status da parcela após estorno
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const vencimento = new Date(installment.dataVencimento);
      vencimento.setHours(0, 0, 0, 0);
      const vencido = vencimento < hoje;

      let novoStatus: string;
      if (efetivoRestante >= Number(installmentAmount)) {
        novoStatus = 'pago';
      } else if (novoTotalPago <= 0 && descontoRestante <= 0) {
        novoStatus = vencido ? 'atrasado' : 'pendente';
      } else {
        novoStatus = vencido ? 'atrasado' : 'parcialmente_pago';
      }

      const novoSaldo = installmentAmount.minus(efetivoRestante).clampedTo(0, Infinity);

      await tx.installment.update({
        where: { id: installment.id },
        data:  { totalPago: novoTotalPago, saldoDevedor: novoSaldo.toDecimalPlaces(2).toNumber(), status: novoStatus as any },
      });

      // 5. Se loan estava quitado, voltar para ativo
      if (loan.status === 'quitado') {
        await tx.loan.update({
          where: { id: loan.id },
          data:  { status: 'ativo' },
        });
      }

      // 6. Criar Transaction de estorno
      const clientNome = loan.client.nome;
      await tx.transaction.create({
        data: {
          tipo:      'saida',
          valor:     Number(payment.valorPago),
          descricao: `Estorno pagamento parcela #${installment.numero} - ${clientNome}`,
          categoria: 'Estorno',
          data:      new Date(),
          userId:    userId ?? null,
        },
      });

      // 7. AuditLog — snapshot do estorno com split
      const snapshotDepois = {
        status:    novoStatus,
        totalPago: novoTotalPago.toString(),
      };

      const dadosAudit = {
        snapshot: {
          antes: snapshotAntes,
          depois: snapshotDepois,
          estorno: {
            paymentId:       id,
            valorEstornado:  payment.valorPago.toString(),
            metodoPagamento: payment.metodoPagamento,
            parcela_split: {
              principalPayback: installment.principalPayback.toString(),
              netGain:          installment.netGain.toString(),
            },
          },
        },
      };

      const hash = createHash('sha256')
        .update(JSON.stringify({
          userId,
          acao:       'PAYMENT_ESTORNADO',
          entidade:   'installments',
          entidadeId: installment.id,
          dados:      dadosAudit,
          ts:         Date.now(),
        }))
        .digest('hex');

      await tx.auditLog.create({
        data: {
          userId:     userId ?? null,
          acao:       'PAYMENT_ESTORNADO',
          entidade:   'installments',
          entidadeId: installment.id,
          dados:      dadosAudit as Prisma.InputJsonValue,
          hash,
        },
      });

      return {
        message: 'Pagamento estornado com sucesso',
        paymentId: id,
        clientId: installment.loan.client.id,
      };
    });

    void this.scoreRisco.recalcularScore(result.clientId);
    return { message: result.message, paymentId: result.paymentId };
  }
}
