import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import Decimal from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import { dataLocal } from '../../common/data';
import { ScoreRiscoService } from '../score-risco/score-risco.service';
import { InstallmentsService } from '../installments/installments.service';
import { SettingsService } from '../settings/settings.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  splitBaixa, realizedLucro, BAIXA_SELECT, BAIXA_ORDER, BaixaInput, Numerico, Split,
} from '../../common/commission';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreRisco: ScoreRiscoService,
    private readonly installments: InstallmentsService,
    private readonly settings: SettingsService,
  ) {}

  // Percentual padrao da casa, usado quando o contrato nao define o seu. Permite
  // mudar a regra num lugar so, sem reeditar centenas de contratos (e sem regerar parcelas).
  private async percentuaisPadrao(): Promise<{ consultor: number | null; administrador: number | null }> {
    const ler = async (chave: string) => {
      const n = await this.settings.getNumber(chave, NaN);
      return Number.isFinite(n) ? n : null;
    };
    const [consultor, administrador] = await Promise.all([
      ler('financeiro.comissao_consultor_percentual'),
      ler('financeiro.comissao_administrador_percentual'),
    ]);
    return { consultor, administrador };
  }

  async create(dto: CreatePaymentDto, userId?: number, role?: string): Promise<unknown> {
    if (role !== 'admin' && (dto.comissaoPercentual != null || dto.comissaoAdministradorPercentual != null)) {
      throw new BadRequestException('Somente o administrador pode ajustar comissões no recebimento.');
    }

    const operador = userId
      ? await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, comissaoPercentual: true } })
      : null;
    // Encargos (multa/mora) em TEMPO REAL para esta parcela. O teto do pagamento é
    // validado contra a mora ATUAL — não contra installment.moraAcumulada, que fica
    // defasado quando o cron de encargos ainda não rodou ou a parcela tinha saldo 0
    // (o que fazia baixas de parcelas atrasadas serem rejeitadas indevidamente).
    // O valor devido desta baixa é calculado na data do acerto informada pelo operador.
    // Assim, uma baixa parcial em 08/08 não carrega encargos posteriores nem reinicia
    // o saldo usando a data original da parcela.
    const encAtual = await this.installments.getEncargos(dto.installmentId, dto.dataPagamento);
    const padrao = await this.percentuaisPadrao();

    const payment = await this.prisma.$transaction(async (tx) => {
      // 1. Buscar parcela com loan e client
      const installment = await tx.installment.findUnique({
        where: { id: dto.installmentId },
        include: {
          loan: {
            include: {
              client: { select: { id: true, nome: true } },
              consultor: { select: { id: true, comissaoPercentual: true } },
            },
          },
        },
      });

      if (!installment) {
        throw new NotFoundException(`Parcela com id ${dto.installmentId} não encontrada`);
      }

      const comissaoConsultor = dto.comissaoPercentual
        ?? installment.loan.comissaoPercentual
        ?? installment.loan.consultor?.comissaoPercentual
        ?? padrao.consultor
        ?? null;
      const comissaoAdministrador = dto.comissaoAdministradorPercentual
        ?? installment.loan.comissaoAdministradorPercentual
        ?? padrao.administrador
        ?? (role === 'admin' ? operador?.comissaoPercentual : null)
        ?? null;
      if (Number(comissaoConsultor ?? 0) + Number(comissaoAdministrador ?? 0) > 100) {
        throw new BadRequestException('As comissões do consultor e do administrador não podem ultrapassar 100% do lucro.');
      }

      if (installment.status === 'pago' || installment.status === 'cancelado') {
        throw new BadRequestException(`Parcela já está ${installment.status}.`);
      }

      const valorPago         = new Decimal(dto.valorPago.toString());
      const moraAcumulada     = new Decimal(installment.moraAcumulada.toString());
      const totalDevidoAtual  = new Decimal(encAtual.totalDevido.toString());
      const totalPagoAnt      = new Decimal(installment.totalPago.toString());
      const novoTotalPago     = totalPagoAnt.plus(valorPago);

      // Desconto concedido nesta baixa: 'saldo' (abate o valor da parcela → quita com menos)
      // ou 'encargos' (perdoa multa/mora; não conta para quitar o principal).
      const desconto       = new Decimal((dto.desconto ?? 0).toString());
      const descontoTipo   = desconto.gt(0) ? (dto.descontoTipo ?? 'saldo') : null;
      const baixaEfetiva   = valorPago.plus(desconto);

      if (valorPago.lt(0)) {
        throw new BadRequestException('Valor do pagamento não pode ser negativo.');
      }
      if (desconto.lt(0)) {
        throw new BadRequestException('Valor do desconto nao pode ser negativo.');
      }
      if (valorPago.isZero() && desconto.lte(0)) {
        throw new BadRequestException('Informe um valor pago ou um desconto.');
      }

      // A baixa usa a divida atual exibida ao operador, nao apenas o valor de face da parcela.
      if (baixaEfetiva.greaterThan(totalDevidoAtual.plus(0.001))) {
        throw new BadRequestException(
          `Valor pago + desconto (${baixaEfetiva.toFixed(2)}) excede o total devido com encargos (${totalDevidoAtual.toFixed(2)}).`,
        );
      }

      const novoSaldo           = totalDevidoAtual.minus(baixaEfetiva).clampedTo(0, Infinity);
      const parcialmenteQuitado = novoSaldo.lessThanOrEqualTo(0.005);

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
          valorDevido:     totalDevidoAtual.toDecimalPlaces(2).toNumber(),
          dataPagamento:   dataLocal(dto.dataPagamento),
          metodoPagamento: (dto.metodoPagamento ?? 'dinheiro') as PaymentMethod,
          observacao:      dto.observacao ?? null,
          contaDestino:    dto.contaDestino ?? null,
          desconto:        desconto.toDecimalPlaces(2).toNumber(),
          descontoTipo:    descontoTipo,
          descontoMotivo:  dto.descontoMotivo ?? null,
          comissaoPercentual: comissaoConsultor,
          comissaoAdministradorPercentual: comissaoAdministrador,
        },
      });

      // 3. Atualizar totalPago, saldoDevedor e status
      await tx.installment.update({
        where: { id: dto.installmentId },
        data: {
          totalPago:    novoTotalPago.toDecimalPlaces(2).toNumber(),
          saldoDevedor: novoSaldo.toDecimalPlaces(2).toNumber(),
          moraAcumulada: 0,
          multaAplicada: 0,
          valorMora: 0,
          valorMulta: 0,
          valorComEncargos: novoSaldo.toDecimalPlaces(2).toNumber(),
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
            data:      dataLocal(dto.dataPagamento),
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
            comissoes_snapshot: {
              comissaoPercentual: comissaoConsultor,
              comissaoAdministradorPercentual: comissaoAdministrador,
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
          include: {
            payments: { where: { estornado: false }, select: BAIXA_SELECT, orderBy: BAIXA_ORDER },
          },
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
      const encAtual = await this.installments.getEncargos(inst.id);
      const saldoParc = encAtual.totalDevido;
      if (saldoParc <= 0.005) continue;
      const lucroRealizado = realizedLucro(inst.payments, {
        principalPayback:  inst.principalPayback,
        installmentAmount: inst.installmentAmount,
        comissaoAdministradorPercentual: loan.comissaoAdministradorPercentual,
      });
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

  async listarContasDestino(): Promise<string[]> {
    const linhas = await this.prisma.payment.findMany({
      where: { contaDestino: { not: null } },
      select: { contaDestino: true },
      distinct: ['contaDestino'],
      orderBy: { contaDestino: 'asc' },
    });
    return linhas
      .map((l) => l.contaDestino?.trim() ?? '')
      .filter((c) => c.length > 0);
  }

  async findAll(filter: import('./dto/payment-filter.dto').PaymentFilterDto, role?: string): Promise<unknown> {
    const {
      search, startDate, endDate, consultorId, contaDestino,
      simComissaoPercentual, simComissaoAdministradorPercentual,
      page = 1, limit = 20,
    } = filter;
    // Simulacao: nao grava nada, so recalcula o que a tela mostra.
    const sim = {
      overrideComissaoPercentual: simComissaoPercentual,
      overrideComissaoAdministradorPercentual: simComissaoAdministradorPercentual,
    };

    const where: Prisma.PaymentWhereInput = {};

    if (contaDestino?.trim()) {
      where.contaDestino = { contains: contaDestino.trim(), mode: 'insensitive' };
    }

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
        where.dataPagamento.gte = dataLocal(startDate);
      }
      if (endDate) {
        const fim = dataLocal(endDate);
        fim.setHours(23, 59, 59, 999);
        where.dataPagamento.lte = fim;
      }
    }

    const skip = (page - 1) * limit;
    const verSplit = role !== 'caixa';

    // Totais do período consideram apenas baixas vivas — estornadas continuam na lista
    // (com o badge), mas não somam.
    const whereVivos: Prisma.PaymentWhereInput = { ...where, estornado: false };

    const splitSelect = {
      id: true,
      valorPago: true,
      installment: {
        select: {
          principalPayback: true,
          installmentAmount: true,
          loan: { select: { comissaoPercentual: true, comissaoAdministradorPercentual: true } },
          payments: {
            where:   { estornado: false },
            select:  BAIXA_SELECT,
            orderBy: BAIXA_ORDER,
          },
        },
      },
    };

    const [total, totaisAgg, payments, baixasPeriodo] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where: whereVivos, _sum: { valorPago: true, desconto: true } }),
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
                  comissaoAdministradorPercentual: true,
                  client: { select: { nome: true, consultor: { select: { id: true, nome: true } } } },
                },
              },
              payments: {
                where:  { estornado: false },
                select:  BAIXA_SELECT,
                orderBy: BAIXA_ORDER,
              },
            },
          },
        },
        orderBy: { dataPagamento: 'desc' },
        skip,
        take: limit,
      }),
      verSplit
        ? this.prisma.payment.findMany({ where: whereVivos, select: splitSelect })
        : Promise.resolve([]),
    ]);

    const mappedData = payments.map((p) => {
      const inst = p.installment as unknown as {
        principalPayback: unknown;
        installmentAmount: unknown;
        loan: { comissaoPercentual: unknown; comissaoAdministradorPercentual: unknown };
        payments: BaixaInput[];
      };
      const split = verSplit ? this.splitPagamento(p.id, inst, sim) : null;
      const { payments: _omit, ...instRest } = inst as Record<string, unknown>;
      return { ...p, installment: instRest, split };
    });

    let somaCapital = 0, somaComissao = 0, somaComissaoAdministrador = 0, somaLucro = 0, somaLucroEmpresa = 0;
    for (const p of baixasPeriodo) {
      const s = this.splitPagamento(p.id, p.installment as never, sim);
      somaCapital      += s.capital;
      somaComissao     += s.comissao;
      somaComissaoAdministrador += s.comissaoAdministrador;
      somaLucro        += s.lucro;
      somaLucroEmpresa += s.lucroEmpresa;
    }
    const r2 = (v: number) => parseFloat(v.toFixed(2));

    return {
      data: mappedData,
      total,
      page,
      lastPage: Math.ceil(total / limit),
      // Totais do PERÍODO inteiro (todo o filtro), não só da página.
      totais: {
        recebido: Number(totaisAgg._sum.valorPago ?? 0),
        desconto: Number(totaisAgg._sum.desconto ?? 0),
        ...(verSplit && {
          capital:      r2(somaCapital),
          lucro:        r2(somaLucro),
          comissao:     r2(somaComissao),
          comissaoAdministrador: r2(somaComissaoAdministrador),
          lucroEmpresa: r2(somaLucroEmpresa),
        }),
      },
    };
  }

  // Divisão de uma baixa em capital × lucro e comissão do consultor (regra única compartilhada).
  // Parcelas cujo 1º pagamento é a partir de COMISSAO_PROPORCIONAL_DESDE rateiam o capital
  // proporcionalmente por baixa; as demais mantêm o capital-primeiro. Ver common/commission.ts.
  private splitPagamento(
    paymentId: number,
    inst: {
      principalPayback: unknown;
      installmentAmount: unknown;
      loan: { comissaoPercentual: unknown; comissaoAdministradorPercentual: unknown };
      payments: BaixaInput[];
    },
    sim?: {
      overrideComissaoPercentual?: Numerico;
      overrideComissaoAdministradorPercentual?: Numerico;
    },
  ): Split {
    return splitBaixa(
      inst.payments,
      {
        principalPayback:   inst.principalPayback as Numerico,
        installmentAmount:  inst.installmentAmount as Numerico,
        comissaoPercentual: inst.loan.comissaoPercentual as Numerico,
        comissaoAdministradorPercentual: inst.loan.comissaoAdministradorPercentual as Numerico,
        overrideComissaoPercentual: sim?.overrideComissaoPercentual,
        overrideComissaoAdministradorPercentual: sim?.overrideComissaoAdministradorPercentual,
      },
      { id: paymentId },
    );
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
          descricao: `Estorno pagamento parcela #${installment.numero} - ${clientNome}${payment.contaDestino ? ` · ${payment.contaDestino}` : ''}`,
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
            contaDestino:    payment.contaDestino ?? null,
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
