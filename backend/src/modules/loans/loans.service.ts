import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LoanStatus, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import Decimal from 'decimal.js';

import { PrismaService } from '../../prisma/prisma.service';
import { filtroCliente } from '../../common/busca';
import { dataDia, dataLocal, fimDoDiaUtc, inicioDoDiaUtc } from '../../common/data';
import { PortalService } from '../client-portal/portal.service';
import { InstallmentsService } from '../installments/installments.service';
import { PaginatedResponse, paginate } from '../../common/dto/paginated-response.dto';
import { addMonthsSafe, calcularDataVencimento } from '../../common/utils/date.utils';
import { baixasVivas, realizedLucro, splitParcela } from '../../common/commission';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { LoanFilterDto } from './dto/loan-filter.dto';
import type { RequestUser } from '../auth/guards/supabase-auth.guard';

// Precisão financeira global — 20 dígitos significativos, arredondamento "meio acima"
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

interface RequestContext {
  userId?: number;
  role?: string;
  consultorId?: number;
  ip?: string;
  userAgent?: string;
  loanStatus?: LoanStatus;   // padrão: 'ativo'; use 'aguardando_aceite' quando chamado via IntencaoService
  aceiteExpiraEm?: Date;     // apenas quando loanStatus = 'aguardando_aceite'
}

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portalService: PortalService,
    private readonly installmentsService: InstallmentsService,
  ) {}

  // ─── Queries ────────────────────────────────────────────────────────────────

  async findAll(filters: LoanFilterDto, role?: string): Promise<PaginatedResponse<unknown>> {
    const { page, limit, search, status, clientId, inicioDe, inicioAte } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.LoanWhereInput = {};
    if (status) where.status = status as LoanStatus;
    if (clientId) where.clientId = clientId;
    if (search) where.client = { OR: filtroCliente(search) };
    if (inicioDe || inicioAte) {
      where.dataInicio = {};
      if (inicioDe) (where.dataInicio as Prisma.DateTimeFilter).gte = inicioDoDiaUtc(inicioDe);
      if (inicioAte) (where.dataInicio as Prisma.DateTimeFilter).lte = fimDoDiaUtc(inicioAte);
    }

    const [data, total] = await Promise.all([
      this.prisma.loan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, nome: true, nomeSocial: true, cpf: true } },
        },
      }),
      this.prisma.loan.count({ where }),
    ]);

    const items = role === 'caixa'
      ? data.map((l) => this.sanitizeForCaixa(l as Record<string, unknown>))
      : data;

    return paginate(items, total, page, limit);
  }

  async findById(id: number, role?: string): Promise<unknown> {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            nome: true,
            nomeSocial: true,
            cpf: true,
            whatsapp: true,
            riskLevel: true,
          },
        },
        consultor: { select: { id: true, nome: true } },
        installments: {
          include: {
            payments: { orderBy: { dataPagamento: 'desc' } },
            pixPayments: { orderBy: { createdAt: 'desc' } },
            mpPayments: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: { numero: 'asc' },
        },
        renegociacoes: { orderBy: { createdAt: 'desc' } },
        notifications: { orderBy: { createdAt: 'desc' }, take: 50 },
        comissaoPagamentos: { orderBy: { dataPagamento: 'desc' } },
      },
    });

    if (!loan) throw new NotFoundException(`Empréstimo ${id} não encontrado`);

    const installmentsComEncargos = await this.installmentsService.recalcularEncargosLista(
      loan.installments,
      loan.multaPercentual,
      loan.moraDiariaPercentual,
    );

    // Rateio REALIZADO de cada baixa (capital × lucro × comissão). As colunas Capital/Lucro
    // da tabela de parcelas mostram o PLANO do contrato; sem isto o operador não tem onde ver
    // que uma baixa parcial foi de fato dividida proporcionalmente à dívida atual.
    (loan as Record<string, unknown>).installments = installmentsComEncargos.map((inst) => {
      const vivas = baixasVivas(inst.payments);
      const splits = splitParcela(vivas, {
        principalPayback:   inst.principalPayback,
        installmentAmount:  inst.installmentAmount,
        comissaoPercentual: loan.comissaoPercentual,
        comissaoAdministradorPercentual: loan.comissaoAdministradorPercentual,
      });
      const porBaixa = new Map(vivas.map((b, i) => [b.id, splits[i]]));
      return {
        ...inst,
        payments: (inst.payments as { id: number }[]).map((p) => ({
          ...p,
          split: porBaixa.get(p.id) ?? null,
        })),
      };
    });

    // Resumo da comissão do consultor (realizada × paga). Usa a regra única de rateio:
    // parcelas novas (proporcional) reconhecem o lucro conforme o pago; as demais, capital-primeiro.
    const pct = Number(loan.comissaoPercentual ?? 0);
    const realizada = loan.installments.reduce((s, i) => {
      const lucro = realizedLucro(baixasVivas(i.payments), {
        principalPayback:  i.principalPayback,
        installmentAmount: i.installmentAmount,
      });
      return s + (lucro * pct) / 100;
    }, 0);
    const paga = loan.comissaoPagamentos.reduce((s, c) => s + Number(c.valor), 0);
    const prevista = Number(loan.targetProfit) * (pct / 100);
    const saldo = realizada - paga;
    const r2 = (v: number) => parseFloat(v.toFixed(2));
    (loan as Record<string, unknown>).comissaoResumo = {
      percentual: pct,
      prevista: r2(prevista),
      realizada: r2(realizada),
      paga: r2(paga),
      saldo: r2(saldo),
      status: pct <= 0 ? 'sem_comissao' : paga <= 0 ? 'nao_paga' : saldo <= 0.005 ? 'paga' : 'parcial',
    };

    return role === 'caixa'
      ? this.sanitizeForCaixa(loan as Record<string, unknown>)
      : loan;
  }

  async getStats(): Promise<Record<string, unknown>> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [totalAtivos, totalQuitados, carteiraResult, recebidoMesResult, descontoMesResult] = await Promise.all([
      this.prisma.loan.count({ where: { status: 'ativo' } }),
      this.prisma.loan.count({ where: { status: 'quitado' } }),
      this.prisma.installment.aggregate({
        where: { status: { in: ['pendente', 'atrasado', 'parcialmente_pago'] } },
        _sum: { saldoDevedor: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          dataPagamento: { gte: startOfMonth, lte: endOfMonth },
          estornado: false,
        },
        _sum: { valorPago: true },
      }),
      this.prisma.payment.aggregate({
        where: { dataPagamento: { gte: startOfMonth, lte: endOfMonth }, estornado: false },
        _sum: { desconto: true },
      }),
    ]);

    return {
      totalAtivos,
      totalQuitados,
      valorEmCarteira: new Decimal(
        (carteiraResult._sum?.saldoDevedor ?? '0').toString(),
      ).toFixed(2),
      valorRecebidoMes: new Decimal(
        (recebidoMesResult._sum?.valorPago ?? '0').toString(),
      ).toFixed(2),
      descontosMes: new Decimal(
        (descontoMesResult._sum?.desconto ?? '0').toString(),
      ).toFixed(2),
    };
  }

  // ─── Commands ───────────────────────────────────────────────────────────────

  async create(dto: CreateLoanDto, ctx: RequestContext = {}): Promise<unknown> {
    if (ctx.role && ctx.role !== 'admin' && (dto.comissaoPercentual != null || dto.comissaoAdministradorPercentual != null)) {
      throw new BadRequestException('Somente o administrador pode definir comissoes no contrato.');
    }
    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
      select: {
        id: true,
        active: true,
        consultorId: true,
        consultor: { select: { id: true, comissaoPercentual: true } },
      },
    });
    if (!client) throw new NotFoundException(`Cliente ${dto.clientId} não encontrado`);
    if (!client.active) throw new BadRequestException('Cliente inativo não pode contrair empréstimos');

    // A comissão é fotografada no contrato no momento da criação. Alterar o cadastro
    // do consultor/administrador depois não recalcula contratos já existentes.
    const operador = ctx.userId
      ? await this.prisma.user.findUnique({ where: { id: ctx.userId }, select: { id: true, role: true, comissaoPercentual: true } })
      : null;
    const consultorId = client.consultorId ?? ctx.consultorId ?? (operador?.role === 'consultor' ? operador.id : null);
    const consultorCadastro = client.consultor
      ?? (ctx.consultorId
        ? await this.prisma.user.findUnique({ where: { id: ctx.consultorId }, select: { id: true, comissaoPercentual: true } })
        : null);
    const comissaoConsultor = dto.comissaoPercentual
      ?? consultorCadastro?.comissaoPercentual
      ?? (operador?.role === 'consultor' ? operador.comissaoPercentual : null);
    const comissaoAdministrador = dto.comissaoAdministradorPercentual
      ?? (operador?.role === 'admin' ? operador.comissaoPercentual : null);

    const principal = new Decimal(dto.principalAmount);
    const profit    = new Decimal(dto.targetProfit);
    const n         = dto.numeroParcelas;
    const total     = principal.plus(profit);

    if (principal.lte(0)) throw new BadRequestException('principalAmount deve ser positivo.');
    if (profit.lt(0))     throw new BadRequestException('targetProfit não pode ser negativo.');
    if (Number(comissaoConsultor ?? 0) + Number(comissaoAdministrador ?? 0) > 100) {
      throw new BadRequestException('As comissões do consultor e do administrador não podem ultrapassar 100% do lucro.');
    }

    // ── Cálculo base de cada parcela (floor para evitar exceder o total) ────
    // basePrincipal e baseInstallment usam ROUND_DOWN independentemente;
    // baseGain é derivado de baseInstallment - basePrincipal para garantir que
    // installmentAmount == principalPayback + netGain em todas as parcelas.
    const baseInstallment = total.dividedBy(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    const basePrincipal   = principal.dividedBy(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);

    // ── Ajustes de centavos para a última parcela ───────────────────────────
    const ajusteInstallment = total.minus(baseInstallment.times(n));
    const ajustePrincipal   = principal.minus(basePrincipal.times(n));

    // ── Datas de vencimento ───────────────────────────────────────────────────
    // Se dataPrimeiroVencimento for informada, a parcela 1 vence nessa data e as
    // seguintes a cada mês. Caso contrário, mantém o padrão (dataInicio + N meses).
    // dataDia() grava o dia ao meio-dia UTC: a meia-noite local virava 00:00Z e o
    // formulário relia isso como o dia anterior, fazendo a data recuar a cada edição.
    const primeiroVenc = dto.dataPrimeiroVencimento ? dataDia(dto.dataPrimeiroVencimento) : null;
    const vencDaParcela = (i: number): Date =>
      primeiroVenc
        ? addMonthsSafe(primeiroVenc, i)
        : calcularDataVencimento(dataDia(dto.dataInicio), i + 1, dto.diaVencimento);

    // ── Geração das parcelas ────────────────────────────────────────────────
    const installments = Array.from({ length: n }, (_, i) => {
      const isUltima     = i === n - 1;
      const installAmt   = isUltima ? baseInstallment.plus(ajusteInstallment) : baseInstallment;
      const principalPay = isUltima ? basePrincipal.plus(ajustePrincipal)     : basePrincipal;
      // gain derivado para garantir a invariante: installAmt == principalPay + gain
      const gain         = installAmt.minus(principalPay);

      const amt = installAmt.toDecimalPlaces(2).toNumber();
      return {
        numero:            i + 1,
        installmentAmount: amt,
        principalPayback:  principalPay.toDecimalPlaces(2).toNumber(),
        netGain:           gain.toDecimalPlaces(2).toNumber(),
        dataVencimento:    vencDaParcela(i),
        status:            'pendente' as const,
        totalPago:         0,
        saldoDevedor:      amt,
        valorMulta:        0,
        valorMora:         0,
      };
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          clientId:                dto.clientId,
          consultorId,
          principalAmount:         principal.toDecimalPlaces(2).toNumber(),
          targetProfit:            profit.toDecimalPlaces(2).toNumber(),
          totalReceivable:         total.toDecimalPlaces(2).toNumber(),
          numeroParcelas:          n,
          metodoPagamento:         dto.metodoPagamento ?? null,
          dataInicio:              dataDia(dto.dataInicio),
          observacoes:             dto.observacoes ?? null,
          status:                  ctx.loanStatus ?? 'ativo',
          aceiteExpiraEm:          ctx.aceiteExpiraEm ?? null,
          diaVencimento:           dto.diaVencimento ?? null,
          multaPercentual:         dto.multaPercentual ?? null,
          moraDiariaPercentual:    dto.moraDiariaPercentual ?? null,
          comissaoPercentual:      comissaoConsultor,
          comissaoAdministradorPercentual: comissaoAdministrador,
          descontoQuitacaoPercentual: dto.descontoQuitacaoPercentual ?? null,
          diasAntecedenciaCobranca: dto.diasAntecedenciaCobranca ?? 10,
          cobrarWhatsapp:          dto.cobrarWhatsapp ?? true,
          cobrarEmail:             dto.cobrarEmail ?? true,
          cobrarPortal:            dto.cobrarPortal ?? true,
        },
      });

      await tx.installment.createMany({
        data: installments.map((inst) => ({ ...inst, loanId: loan.id })),
      });

      await this.writeAuditLog(tx, {
        ...ctx,
        acao:       'LOAN_CREATED',
        entidade:   'Loan',
        entidadeId: loan.id,
        dadosAntes: null,
        dadosDepois: {
          loanId:           loan.id,
          clientId:         loan.clientId,
          principalAmount:  principal.toString(),
          targetProfit:     profit.toString(),
          totalReceivable:  total.toString(),
          numeroParcelas:   n,
          baseInstallment:  baseInstallment.toString(),
          basePrincipal:    basePrincipal.toString(),
          ajusteInstallment: ajusteInstallment.toString(),
          primeiraParcela:  installments[0]?.dataVencimento,
          ultimaParcela:    installments[installments.length - 1]?.dataVencimento,
        },
      });

      return loan;
    });

    return this.findById(created.id);
  }

  // ─── Edição de contrato ───────────────────────────────────────────────────────
  // Campos financeiros disparam regeneração das parcelas pendentes/atrasadas.
  // Parcelas pagas, parcialmente pagas ou canceladas são SEMPRE preservadas.
  async update(id: number, dto: UpdateLoanDto, ctx: RequestContext = {}): Promise<unknown> {
    if (ctx.role && ctx.role !== 'admin' && (dto.comissaoPercentual != null || dto.comissaoAdministradorPercentual != null)) {
      throw new BadRequestException('Somente o administrador pode alterar comissoes no contrato.');
    }
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: { installments: { orderBy: { numero: 'asc' } } },
    });
    if (!loan) throw new NotFoundException(`Empréstimo ${id} não encontrado`);
    if (loan.status === 'cancelado') {
      throw new ConflictException('Empréstimo cancelado não pode ser editado');
    }

    const newPrincipal  = dto.principalAmount != null ? new Decimal(dto.principalAmount) : new Decimal(loan.principalAmount.toString());
    const newProfit     = dto.targetProfit   != null ? new Decimal(dto.targetProfit)    : new Decimal(loan.targetProfit.toString());
    const newN          = dto.numeroParcelas ?? loan.numeroParcelas;
    const newDataInicio = dto.dataInicio ? dataDia(dto.dataInicio) : loan.dataInicio;
    const newDiaVenc    = dto.diaVencimento !== undefined ? dto.diaVencimento : loan.diaVencimento;
    // Data do 1º vencimento (mesmo tratamento do create); quando informada, redefine
    // o cronograma das parcelas pendentes (1ª pendente nessa data, demais mensais).
    const primeiroVenc = dto.dataPrimeiroVencimento ? dataDia(dto.dataPrimeiroVencimento) : null;

    if (newPrincipal.lte(0)) throw new BadRequestException('principalAmount deve ser positivo.');
    if (newProfit.lt(0))     throw new BadRequestException('targetProfit não pode ser negativo.');
    if (Number(dto.comissaoPercentual ?? loan.comissaoPercentual ?? 0) + Number(dto.comissaoAdministradorPercentual ?? loan.comissaoAdministradorPercentual ?? 0) > 100) {
      throw new BadRequestException('As comissões do consultor e do administrador não podem ultrapassar 100% do lucro.');
    }

    const comissaoConsultorFinal =
      dto.comissaoPercentual !== undefined ? dto.comissaoPercentual : loan.comissaoPercentual;
    const comissaoAdministradorFinal =
      dto.comissaoAdministradorPercentual !== undefined
        ? dto.comissaoAdministradorPercentual
        : loan.comissaoAdministradorPercentual;

    const newTotal = newPrincipal.plus(newProfit);

    const cronogramaMudou =
      (dto.principalAmount != null && !newPrincipal.equals(loan.principalAmount.toString())) ||
      (dto.targetProfit   != null && !newProfit.equals(loan.targetProfit.toString())) ||
      (dto.numeroParcelas != null && newN !== loan.numeroParcelas) ||
      (dto.dataInicio     != null && newDataInicio.getTime() !== loan.dataInicio.getTime()) ||
      (dto.diaVencimento  !== undefined && newDiaVenc !== loan.diaVencimento) ||
      (primeiroVenc != null);

    // Parcelas preservadas (histórico) vs. regeneráveis (sem pagamento)
    const travadas = loan.installments.filter(
      (i) => i.status === 'pago' || i.status === 'parcialmente_pago' || i.status === 'cancelado' || Number(i.totalPago) > 0,
    );
    const regeneraveis = loan.installments.filter(
      (i) => (i.status === 'pendente' || i.status === 'atrasado') && Number(i.totalPago) === 0,
    );

    let novasParcelas: Array<Record<string, unknown>> = [];
    if (cronogramaMudou) {
      const lockedCount  = travadas.length;
      const maxTravada   = travadas.length ? Math.max(...travadas.map((t) => t.numero)) : 0;
      const regenCount   = newN - lockedCount;

      if (newN < maxTravada) {
        throw new BadRequestException(`numeroParcelas (${newN}) é menor que a posição de uma parcela já paga (#${maxTravada}).`);
      }
      if (regenCount < 0) {
        throw new BadRequestException(`numeroParcelas (${newN}) é menor que as ${lockedCount} parcelas já pagas/canceladas.`);
      }

      const somaInstLocked  = travadas.reduce((acc, i) => acc.plus(i.installmentAmount.toString()), new Decimal(0));
      const somaPrincLocked = travadas.reduce((acc, i) => acc.plus(i.principalPayback.toString()), new Decimal(0));
      const remainingTotal  = newTotal.minus(somaInstLocked);
      const remainingPrinc  = newPrincipal.minus(somaPrincLocked);

      if (regenCount === 0) {
        if (remainingTotal.greaterThan(0)) {
          throw new BadRequestException('Não há parcelas pendentes para acomodar o saldo restante. Aumente o número de parcelas.');
        }
      } else {
        if (remainingTotal.lt(0) || remainingPrinc.lt(0)) {
          throw new BadRequestException('Os novos valores são menores que o total já comprometido em parcelas pagas deste contrato.');
        }

        // Slots livres = números em [1..newN] não usados por parcelas preservadas
        const usados = new Set(travadas.map((t) => t.numero));
        const slots: number[] = [];
        for (let num = 1; num <= newN; num++) if (!usados.has(num)) slots.push(num);

        const baseInst    = remainingTotal.dividedBy(regenCount).toDecimalPlaces(2, Decimal.ROUND_DOWN);
        const basePrinc   = remainingPrinc.dividedBy(regenCount).toDecimalPlaces(2, Decimal.ROUND_DOWN);
        const ajusteInst  = remainingTotal.minus(baseInst.times(regenCount));
        const ajustePrinc = remainingPrinc.minus(basePrinc.times(regenCount));

        novasParcelas = slots.map((numero, k) => {
          const isUltima     = k === slots.length - 1;
          const installAmt   = isUltima ? baseInst.plus(ajusteInst)   : baseInst;
          const principalPay = isUltima ? basePrinc.plus(ajustePrinc) : basePrinc;
          const gain         = installAmt.minus(principalPay);
          const amt          = installAmt.toDecimalPlaces(2).toNumber();
          return {
            loanId:            id,
            numero,
            installmentAmount: amt,
            principalPayback:  principalPay.toDecimalPlaces(2).toNumber(),
            netGain:           gain.toDecimalPlaces(2).toNumber(),
            dataVencimento:    primeiroVenc ? addMonthsSafe(primeiroVenc, k) : calcularDataVencimento(newDataInicio, numero, newDiaVenc),
            status:            'pendente' as const,
            totalPago:         0,
            saldoDevedor:      amt,
            valorMulta:        0,
            valorMora:         0,
          };
        });
      }
    }

    const snapshotAntes = {
      principalAmount: loan.principalAmount.toString(),
      targetProfit:    loan.targetProfit.toString(),
      totalReceivable: loan.totalReceivable.toString(),
      numeroParcelas:  loan.numeroParcelas,
      dataInicio:      loan.dataInicio.toISOString(),
      status:          loan.status,
      comissaoPercentual: loan.comissaoPercentual?.toString() ?? null,
      comissaoAdministradorPercentual: loan.comissaoAdministradorPercentual?.toString() ?? null,
    };

    await this.prisma.$transaction(async (tx) => {
      let baixasComissaoSincronizadas = 0;
      await tx.loan.update({
        where: { id },
        data: {
          principalAmount:      newPrincipal.toDecimalPlaces(2).toNumber(),
          targetProfit:         newProfit.toDecimalPlaces(2).toNumber(),
          totalReceivable:      newTotal.toDecimalPlaces(2).toNumber(),
          numeroParcelas:       newN,
          dataInicio:           newDataInicio,
          diaVencimento:        newDiaVenc ?? null,
          metodoPagamento:      dto.metodoPagamento ?? loan.metodoPagamento,
          observacoes:          dto.observacoes !== undefined ? dto.observacoes : loan.observacoes,
          multaPercentual:      dto.multaPercentual !== undefined ? dto.multaPercentual : loan.multaPercentual,
          moraDiariaPercentual: dto.moraDiariaPercentual !== undefined ? dto.moraDiariaPercentual : loan.moraDiariaPercentual,
          comissaoPercentual:   comissaoConsultorFinal,
          comissaoAdministradorPercentual: comissaoAdministradorFinal,
          descontoQuitacaoPercentual: dto.descontoQuitacaoPercentual !== undefined ? dto.descontoQuitacaoPercentual : loan.descontoQuitacaoPercentual,
          diasAntecedenciaCobranca: dto.diasAntecedenciaCobranca ?? loan.diasAntecedenciaCobranca,
          cobrarWhatsapp:       dto.cobrarWhatsapp ?? loan.cobrarWhatsapp,
          cobrarEmail:          dto.cobrarEmail ?? loan.cobrarEmail,
          cobrarPortal:         dto.cobrarPortal ?? loan.cobrarPortal,
        },
      });

      if (dto.comissaoPercentual !== undefined || dto.comissaoAdministradorPercentual !== undefined) {
        const comissaoBaixa: Prisma.PaymentUpdateManyMutationInput = {};
        if (dto.comissaoPercentual !== undefined) {
          comissaoBaixa.comissaoPercentual = comissaoConsultorFinal;
        }
        if (dto.comissaoAdministradorPercentual !== undefined) {
          comissaoBaixa.comissaoAdministradorPercentual = comissaoAdministradorFinal;
        }
        const sincronizacao = await tx.payment.updateMany({
          where: { estornado: false, installment: { is: { loanId: id } } },
          data: comissaoBaixa,
        });
        baixasComissaoSincronizadas = sincronizacao.count;
      }

      if (cronogramaMudou) {
        await tx.installment.deleteMany({
          where: { loanId: id, id: { in: regeneraveis.map((r) => r.id) } },
        });
        if (novasParcelas.length) {
          await tx.installment.createMany({ data: novasParcelas as Prisma.InstallmentCreateManyInput[] });
        }
      }

      await this.writeAuditLog(tx, {
        ...ctx,
        acao:       'LOAN_UPDATED',
        entidade:   'Loan',
        entidadeId: id,
        dadosAntes:  snapshotAntes,
        dadosDepois: {
          principalAmount:      newPrincipal.toString(),
          targetProfit:         newProfit.toString(),
          totalReceivable:      newTotal.toString(),
          numeroParcelas:       newN,
          cronogramaRegenerado: cronogramaMudou,
          parcelasPreservadas:  travadas.length,
          parcelasRegeneradas:  novasParcelas.length,
          comissaoPercentual: comissaoConsultorFinal?.toString() ?? null,
          comissaoAdministradorPercentual: comissaoAdministradorFinal?.toString() ?? null,
          baixasComissaoSincronizadas,
        },
      });
    });

    return this.findById(id);
  }

  // ─── Comissão do consultor: pagamento e estorno ──────────────────────────────

  async registrarComissao(
    loanId: number,
    dto: { valor: number; dataPagamento: string; observacao?: string },
    ctx: RequestContext = {},
  ): Promise<unknown> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: { client: { select: { nome: true } } },
    });
    if (!loan) throw new NotFoundException(`Empréstimo ${loanId} não encontrado`);

    const valor = new Decimal(dto.valor);
    if (valor.lte(0)) throw new BadRequestException('Valor da comissão deve ser positivo.');

    await this.prisma.$transaction(async (tx) => {
      await tx.comissaoPagamento.create({
        data: {
          loanId,
          consultorId:   loan.consultorId ?? null,
          valor:         valor.toDecimalPlaces(2).toNumber(),
          dataPagamento: dataLocal(dto.dataPagamento),
          observacao:    dto.observacao ?? null,
          registradoPor: ctx.userId ?? null,
        },
      });
      await tx.transaction.create({
        data: {
          tipo:      'saida',
          valor:     valor.toDecimalPlaces(2).toNumber(),
          descricao: `Comissão consultor — Contrato #${loanId} · ${loan.client.nome}${dto.observacao ? ` — ${dto.observacao}` : ''}`,
          categoria: 'Comissão Consultor',
          data:      dataLocal(dto.dataPagamento),
          userId:    ctx.userId ?? null,
        },
      });
      await this.writeAuditLog(tx, {
        ...ctx,
        acao:        'COMISSAO_PAGA',
        entidade:    'Loan',
        entidadeId:  loanId,
        dadosAntes:  null,
        dadosDepois: { valor: valor.toString(), consultorId: loan.consultorId, dataPagamento: dto.dataPagamento },
      });
    });

    return this.findById(loanId);
  }

  async estornarComissao(loanId: number, pagamentoId: number, ctx: RequestContext = {}): Promise<unknown> {
    const pag = await this.prisma.comissaoPagamento.findUnique({ where: { id: pagamentoId } });
    if (!pag || pag.loanId !== loanId) {
      throw new NotFoundException('Pagamento de comissão não encontrado para este contrato.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.comissaoPagamento.delete({ where: { id: pagamentoId } });
      await tx.transaction.create({
        data: {
          tipo:      'entrada',
          valor:     pag.valor,
          descricao: `Estorno comissão consultor — Contrato #${loanId}`,
          categoria: 'Estorno',
          data:      new Date(),
          userId:    ctx.userId ?? null,
        },
      });
      await this.writeAuditLog(tx, {
        ...ctx,
        acao:        'COMISSAO_ESTORNADA',
        entidade:    'Loan',
        entidadeId:  loanId,
        dadosAntes:  { pagamentoId, valor: pag.valor.toString() },
        dadosDepois: { estornado: true },
      });
    });

    return this.findById(loanId);
  }

  async cancel(id: number, ctx: RequestContext = {}): Promise<unknown> {
    const loan = await this.prisma.loan.findUnique({ where: { id } });
    if (!loan) throw new NotFoundException(`Empréstimo ${id} não encontrado`);

    if (loan.status === 'cancelado') throw new ConflictException('Empréstimo já está cancelado');
    if (loan.status === 'quitado')   throw new ConflictException('Empréstimo quitado não pode ser cancelado');

    const snapshotAntes = this.serializeLoan(loan);

    await this.prisma.$transaction(async (tx) => {
      await tx.loan.update({ where: { id }, data: { status: 'cancelado' } });

      await tx.installment.updateMany({
        where: { loanId: id, status: { in: ['pendente', 'atrasado'] } },
        data: { status: 'cancelado' },
      });

      await this.writeAuditLog(tx, {
        ...ctx,
        acao:       'LOAN_CANCELLED',
        entidade:   'Loan',
        entidadeId: id,
        dadosAntes:  snapshotAntes,
        dadosDepois: { ...snapshotAntes, status: 'cancelado' },
      });
    });

    return this.findById(id);
  }

  // ─── Reenviar link de aceite ─────────────────────────────────────────────────

  async reenviarAceite(id: number, user: RequestUser): Promise<unknown> {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      select: { id: true, status: true, clientId: true },
    });
    if (!loan) throw new NotFoundException(`Empréstimo ${id} não encontrado`);
    if (loan.status !== 'aguardando_aceite') {
      throw new BadRequestException('Link de aceite só pode ser reenviado quando o contrato está aguardando aceite do cliente.');
    }

    return this.portalService.notificarAceiteContrato(loan.clientId, user, id);
  }

  // ─── Liberações pendentes ────────────────────────────────────────────────────

  async findPendentesLiberacao(): Promise<unknown[]> {
    return this.prisma.loan.findMany({
      where: { status: 'aguardando_liberacao' },
      select: {
        id: true,
        principalAmount: true,
        numeroParcelas: true,
        aceiteClienteEm: true,
        aceiteClienteIp: true,
        createdAt: true,
        client: { select: { id: true, nome: true, nomeSocial: true, whatsapp: true } },
        consultor: { select: { nome: true } },
      },
      orderBy: { aceiteClienteEm: 'asc' },
    });
  }

  // ─── Liberação manual de capital ────────────────────────────────────────────

  async liberarCapital(
    loanId: number,
    dto: { metodoLiberacao: string; dataLiberacao?: string; observacao?: string },
    ctx: RequestContext = {},
  ): Promise<unknown> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: { client: { select: { id: true, nome: true, whatsapp: true } } },
    });

    if (!loan) throw new NotFoundException(`Empréstimo ${loanId} não encontrado`);
    if (loan.status !== 'aguardando_liberacao') {
      throw new BadRequestException('Contrato não está aguardando liberação de capital.');
    }

    const dataLib = dto.dataLiberacao ? dataLocal(dto.dataLiberacao) : new Date();

    await this.prisma.$transaction(async (tx) => {
      // 1. Ativar o contrato
      await tx.loan.update({
        where: { id: loanId },
        data: {
          status:          'ativo',
          dataInicio:      dataDia(dataLib),
          liberadoPor:     ctx.userId ?? null,
          liberadoEm:      dataLib,
          metodoLiberacao: dto.metodoLiberacao,
        },
      });

      // 2. Reajustar datas de vencimento das parcelas pendentes (data provisória → data real)
      const installments = await tx.installment.findMany({
        where:   { loanId, status: 'pendente' },
        orderBy: { numero: 'asc' },
        select:  { id: true, numero: true },
      });
      for (const inst of installments) {
        await tx.installment.update({
          where: { id: inst.id },
          data:  { dataVencimento: addMonthsSafe(dataDia(dataLib), inst.numero) },
        });
      }

      // 3. Registrar saída no caixa
      await tx.transaction.create({
        data: {
          tipo:      'saida',
          valor:     loan.principalAmount,
          descricao: `Liberação de capital — Contrato #${loanId} · ${loan.client.nome}${dto.observacao ? ` — ${dto.observacao}` : ''}`,
          categoria: 'Liberação de Empréstimo',
          data:      dataLib,
          userId:    ctx.userId ?? null,
        },
      });

      // 4. AuditLog
      await this.writeAuditLog(tx, {
        ...ctx,
        acao:       'CAPITAL_LIBERADO',
        entidade:   'Loan',
        entidadeId: loanId,
        dadosAntes:  { status: 'aguardando_liberacao' },
        dadosDepois: {
          status:          'ativo',
          metodo:          dto.metodoLiberacao,
          valor:           loan.principalAmount.toString(),
          dataLib:         dataLib.toISOString(),
          clientId:        loan.clientId,
          parcelasAjustadas: installments.length,
        },
      });
    });

    // Notificar cliente sobre liberação do capital (fire-and-forget)
    this.portalService.notificarCapitalLiberado(loanId).catch(() => {});

    return this.findById(loanId);
  }

  // ─── Utilitário de integridade ───────────────────────────────────────────────

  async verificarIntegridadeLoan(loanId: number): Promise<{
    integro: boolean;
    divergencias: string[];
  }> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: { installments: true },
    });

    if (!loan) throw new NotFoundException(`Empréstimo ${loanId} não encontrado`);

    const divergencias: string[] = [];
    const total         = new Decimal(loan.totalReceivable.toString());
    const principal     = new Decimal(loan.principalAmount.toString());
    const profit        = new Decimal(loan.targetProfit.toString());

    const somaInstallments = loan.installments.reduce(
      (acc, i) => acc.plus(i.installmentAmount.toString()),
      new Decimal(0),
    );
    const somaPrincipal = loan.installments.reduce(
      (acc, i) => acc.plus(i.principalPayback.toString()),
      new Decimal(0),
    );
    const somaGain = loan.installments.reduce(
      (acc, i) => acc.plus(i.netGain.toString()),
      new Decimal(0),
    );

    if (!total.equals(principal.plus(profit)))
      divergencias.push(`totalReceivable (${total}) ≠ principalAmount + targetProfit (${principal.plus(profit)})`);

    if (!somaInstallments.equals(total))
      divergencias.push(`Soma installmentAmount (${somaInstallments}) ≠ totalReceivable (${total})`);

    if (!somaPrincipal.equals(principal))
      divergencias.push(`Soma principalPayback (${somaPrincipal}) ≠ principalAmount (${principal})`);

    if (!somaGain.equals(profit))
      divergencias.push(`Soma netGain (${somaGain}) ≠ targetProfit (${profit})`);

    return { integro: divergencias.length === 0, divergencias };
  }

  // ─── Private: Audit ─────────────────────────────────────────────────────────

  private async writeAuditLog(
    tx: Prisma.TransactionClient,
    params: RequestContext & {
      acao: string;
      entidade: string;
      entidadeId: number;
      dadosAntes: Record<string, unknown> | null;
      dadosDepois: Record<string, unknown>;
    },
  ): Promise<void> {
    const { userId, ip, userAgent, acao, entidade, entidadeId, dadosAntes, dadosDepois } = params;

    const hash = createHash('sha256')
      .update(JSON.stringify({ userId, acao, entidade, entidadeId, dadosDepois, ts: Date.now() }))
      .digest('hex');

    await tx.auditLog.create({
      data: {
        userId:     userId ?? null,
        acao,
        entidade,
        entidadeId,
        dadosAntes:  (dadosAntes ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        dadosDepois: dadosDepois as Prisma.InputJsonValue,
        hash,
        ip:        ip ?? null,
        userAgent: userAgent ?? null,
      },
    });
  }

  // Remove financial split fields (targetProfit, principalAmount, principalPayback, netGain)
  // from loans and installments returned to users with role 'caixa'.
  private sanitizeForCaixa(loan: Record<string, unknown>): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { targetProfit, principalAmount, comissaoResumo, comissaoPagamentos, comissaoPercentual, comissaoAdministradorPercentual, ...loanRest } = loan as Record<string, unknown>;
    if (Array.isArray(loanRest['installments'])) {
      loanRest['installments'] = (loanRest['installments'] as Record<string, unknown>[]).map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ principalPayback, netGain, ...instRest }) => {
          // O split por baixa (capital/lucro/comissão) é informação interna.
          if (Array.isArray(instRest['payments'])) {
            instRest['payments'] = (instRest['payments'] as Record<string, unknown>[]).map(
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ({ split, ...payRest }) => payRest,
            );
          }
          return instRest;
        },
      );
    }
    return loanRest;
  }

  private serializeLoan(loan: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(loan).map(([k, v]) => [k, v instanceof Decimal ? v.toString() : v]),
    );
  }
}
