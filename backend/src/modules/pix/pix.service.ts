import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import Decimal from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import { InstallmentsService } from '../installments/installments.service';
import { GeneratePixDto, ChargeTipo } from './dto/generate-pix.dto';
import type { RequestUser } from '../auth/guards/supabase-auth.guard';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

interface MpPaymentResponse {
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
  barcode?: { content?: string };
  transaction_details?: { external_resource_url?: string };
}

type PixPaymentWithInstallment = Awaited<
  ReturnType<PrismaService['pixPayment']['findUniqueOrThrow']>
> & {
  installment: {
    id: number;
    numero: number;
    loanId: number;
    totalPago: Decimal;
    installmentAmount: Decimal;
    status: string;
    dataVencimento: Date;
    loan: { id: number; numeroParcelas: number };
  };
};

@Injectable()
export class PixService {
  private readonly logger = new Logger(PixService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly installments: InstallmentsService,
  ) {}

  async generate(dto: GeneratePixDto, user: RequestUser): Promise<unknown> {
    const tipo = dto.tipo ?? ChargeTipo.PIX;

    const installment = await this.prisma.installment.findUnique({
      where: { id: dto.installmentId },
      include: {
        loan: {
          select: {
            id: true,
            numeroParcelas: true,
            client: {
              select: {
                id: true,
                nome: true,
                email: true,
                cpf: true,
                whatsapp: true,
                endereco: true,
                bairro: true,
                cidade: true,
                estado: true,
                cep: true,
              },
            },
          },
        },
      },
    });

    if (!installment) {
      throw new NotFoundException(`Parcela ${dto.installmentId} não encontrada`);
    }

    // REGRA 1: parcela paga → 422
    if (installment.status === 'pago') {
      throw new BadRequestException('Esta parcela já foi paga. Não é possível gerar QR Code.');
    }

    // REGRA 2: parcela cancelada → 422
    if (installment.status === 'cancelado') {
      throw new BadRequestException('Esta parcela está cancelada.');
    }

    const saldo = new Decimal(installment.installmentAmount.toString()).minus(
      installment.totalPago.toString(),
    );

    if (saldo.lte(0)) {
      throw new BadRequestException('Parcela já está quitada.');
    }

    // REGRA 3 e 4: verificar QR Code existente
    const pixExistente = await this.prisma.pixPayment.findFirst({
      where: { installmentId: dto.installmentId, tipo, status: 'pendente' },
      orderBy: { createdAt: 'desc' },
    });

    if (pixExistente) {
      const agora       = new Date();
      const vencParcela = new Date(installment.dataVencimento);
      const expirouPix  = pixExistente.expiresAt != null && pixExistente.expiresAt <= agora;
      const parcVencida = vencParcela <= agora;

      if (!expirouPix && !parcVencida) {
        // REGRA 3: QR Code ainda válido — retornar o existente diretamente
        return pixExistente;
      }

      // REGRA 4: QR Code ou parcela vencida — somente admin/financeiro podem reemitir
      if (!['admin', 'financeiro'].includes(user.role)) {
        throw new ForbiddenException(
          'O QR Code desta parcela expirou. Solicite ao financeiro para gerar um novo.',
        );
      }

      // Cancelar o QR Code anterior
      await this.prisma.pixPayment.update({
        where: { id: pixExistente.id },
        data: { status: 'cancelado' },
      });
    }

    const client = installment.loan.client;

    // REGRA 5: expiresAt = MIN(dataVencimento, agora + validade_selecionada)
    const expiresAt = this._computeExpiresAt(tipo, dto, installment.dataVencimento);

    // externalReference rastreável e estável (sem timestamp — idempotência via X-Idempotency-Key)
    const externalReference = `SIAFI_INST_${installment.id}_LOAN_${installment.loanId}`;

    const mpResponse = await this._callMpApi(
      tipo,
      saldo.toNumber(),
      installment,
      client,
      dto,
      expiresAt,
      externalReference,
    );

    return this.prisma.pixPayment.create({
      data: {
        installmentId:  dto.installmentId,
        clientId:       client.id,
        paymentId:      String(mpResponse.id),
        tipo,
        qrCode:         mpResponse.point_of_interaction?.transaction_data?.qr_code ?? null,
        qrImage:        mpResponse.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
        barcodeContent: mpResponse.barcode?.content ?? null,
        boletoUrl:      mpResponse.transaction_details?.external_resource_url ?? null,
        amount:         saldo.toDecimalPlaces(2).toNumber(),
        valorEncargos:  null,
        expiresAt,
        status:         'pendente',
      },
    });
  }

  async reissue(id: number): Promise<unknown> {
    const charge = await this.prisma.pixPayment.findUnique({
      where: { id },
      include: {
        installment: {
          include: {
            loan: {
              select: {
                id: true,
                numeroParcelas: true,
                client: {
                  select: {
                    id: true,
                    nome: true,
                    email: true,
                    cpf: true,
                    whatsapp: true,
                    endereco: true,
                    bairro: true,
                    cidade: true,
                    estado: true,
                    cep: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!charge) throw new NotFoundException(`Cobrança ${id} não encontrada`);

    await this.prisma.pixPayment.update({
      where: { id },
      data: { status: 'expirado' },
    });

    if (charge.paymentId) {
      try {
        await axios.put(
          `https://api.mercadopago.com/v1/payments/${charge.paymentId}`,
          { status: 'cancelled' },
          { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } },
        );
      } catch {
        /* PIX/boleto já pode estar expirado no MP — ignorar */
      }
    }

    const installment = charge.installment;
    const loan        = installment.loan;
    const client      = loan.client;

    // Encargos via fonte única do sistema (multa única + mora diária)
    const enc = await this.installments.getEncargos(installment.id);
    const valorEncargos = new Decimal(enc.valorMulta).plus(enc.valorMora).toDecimalPlaces(2);
    const valorTotal    = new Decimal(enc.totalDevido).toDecimalPlaces(2);
    const tipo               = charge.tipo as ChargeTipo;
    const expiresAt          = this._computeExpiresAt(tipo, {}, installment.dataVencimento);
    const externalReference  = `SIAFI_INST_${installment.id}_LOAN_${installment.loanId}`;

    const mpResponse = await this._callMpApi(
      tipo,
      valorTotal.toNumber(),
      installment,
      client,
      {},
      expiresAt,
      externalReference,
    );

    return this.prisma.pixPayment.create({
      data: {
        installmentId:  installment.id,
        clientId:       client.id,
        paymentId:      String(mpResponse.id),
        tipo,
        qrCode:         mpResponse.point_of_interaction?.transaction_data?.qr_code ?? null,
        qrImage:        mpResponse.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
        barcodeContent: mpResponse.barcode?.content ?? null,
        boletoUrl:      mpResponse.transaction_details?.external_resource_url ?? null,
        amount:         valorTotal.toDecimalPlaces(2).toNumber(),
        valorEncargos:  valorEncargos.gt(0) ? valorEncargos.toNumber() : null,
        expiresAt,
        status:         'pendente',
      },
    });
  }

  async findByInstallment(installmentId: number): Promise<unknown[]> {
    return this.prisma.pixPayment.findMany({
      where: { installmentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // checkStatus: quando aprovado no MP, executa a baixa completa em $transaction
  async checkStatus(id: number): Promise<unknown> {
    const pixPayment = await this.prisma.pixPayment.findUnique({
      where: { id },
      include: {
        installment: {
          include: {
            loan: { select: { id: true, numeroParcelas: true } },
          },
        },
      },
    });
    if (!pixPayment) throw new NotFoundException(`Cobrança ${id} não encontrada`);

    if (pixPayment.status === 'pago') return pixPayment;
    if (!pixPayment.paymentId) return pixPayment;

    try {
      const { data } = await axios.get<MpPaymentResponse>(
        `https://api.mercadopago.com/v1/payments/${pixPayment.paymentId}`,
        { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } },
      );

      if (data.status === 'approved') {
        const valor = data.transaction_amount ?? Number(pixPayment.amount);
        await this._registrarPagamentoPix(
          pixPayment as unknown as PixPaymentWithInstallment,
          valor,
          String(pixPayment.paymentId),
        );
        return this.prisma.pixPayment.findUnique({
          where: { id },
          include: { installment: { select: { id: true, status: true, totalPago: true } } },
        });
      }

      if (data.status === 'cancelled' && pixPayment.status === 'pendente') {
        await this.prisma.pixPayment.update({
          where: { id },
          data: { status: 'cancelado' },
        });
      }

      return { ...pixPayment, mpStatus: data.status, mpStatusDetail: data.status_detail };
    } catch {
      return pixPayment;
    }
  }

  // Registrar pagamento PIX com $transaction atômica — idempotente pelo mpPaymentId
  async _registrarPagamentoPix(
    pixPayment: PixPaymentWithInstallment,
    valorPago:  number,
    mpPaymentId: string,
  ): Promise<void> {
    const inst = pixPayment.installment;

    // Idempotência: checar se este mp_payment_id já foi processado
    const jaProcessado = await this.prisma.payment.findFirst({
      where: {
        installmentId:  inst.id,
        metodoPagamento: 'pix',
        observacao:     { contains: mpPaymentId },
      },
    });
    if (jaProcessado) {
      this.logger.log(`Pagamento MP #${mpPaymentId} já processado — ignorando`);
      return;
    }

    const valorDecimal = new Decimal(valorPago.toString());

    await this.prisma.$transaction(async (tx) => {
      // 1. Atualizar pix_payment → pago
      await tx.pixPayment.update({
        where: { id: pixPayment.id },
        data: { status: 'pago', paymentId: mpPaymentId },
      });

      // 2. Cancelar outros pix_payments pendentes da mesma parcela
      await tx.pixPayment.updateMany({
        where: {
          installmentId: inst.id,
          id:            { not: pixPayment.id },
          status:        'pendente',
        },
        data: { status: 'cancelado' },
      });

      // 3. Criar registro em payments
      await tx.payment.create({
        data: {
          installmentId:   inst.id,
          valorPago:       valorDecimal.toDecimalPlaces(2).toNumber(),
          dataPagamento:   new Date(),
          metodoPagamento: 'pix',
          observacao:      `Mercado Pago · PaymentId: ${mpPaymentId}`,
        },
      });

      // 4. Atualizar totalPago e status da installment
      const novoTotal     = new Decimal(inst.totalPago.toString()).plus(valorDecimal);
      const valorInst     = new Decimal(inst.installmentAmount.toString());
      const novoStatus    = novoTotal.gte(valorInst) ? 'pago' : inst.status;

      await tx.installment.update({
        where: { id: inst.id },
        data: {
          totalPago: novoTotal.toDecimalPlaces(2).toNumber(),
          status:    novoStatus as any,
        },
      });

      // 5. Criar Transaction de entrada no caixa
      await tx.transaction.create({
        data: {
          tipo:      'entrada',
          valor:     valorDecimal.toDecimalPlaces(2).toNumber(),
          descricao: `PIX · Parcela ${inst.numero}/${inst.loan.numeroParcelas} · Loan #${inst.loanId} · MP #${mpPaymentId}`,
          categoria: 'Pagamento de Parcela',
          data:      new Date(),
        },
      });

      // 6. Verificar se todas as parcelas estão pagas → quitar loan
      if (novoStatus === 'pago') {
        const parcelas = await tx.installment.findMany({ where: { loanId: inst.loanId } });
        const todasPagas = parcelas.every(
          p2 => p2.id === inst.id ? true : p2.status === 'pago' || p2.status === 'cancelado',
        );
        if (todasPagas) {
          await tx.loan.update({ where: { id: inst.loanId }, data: { status: 'quitado' } });
          this.logger.log(`Loan #${inst.loanId} marcado como quitado`);
        }
      }

      // 7. AuditLog
      await tx.auditLog.create({
        data: {
          acao:       'PAGAMENTO_PIX_CONFIRMADO',
          entidade:   'installments',
          entidadeId: inst.id,
          contexto: {
            mpPaymentId,
            valorPago,
            installmentStatus: novoStatus,
            pixPaymentId: pixPayment.id,
          },
        },
      });
    });

    this.logger.log(
      `✅ PIX confirmado — Parcela #${inst.id} · Loan #${inst.loanId} · R$ ${valorPago} · MP #${mpPaymentId}`,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _callMpApi(
    tipo: ChargeTipo,
    amount: number,
    installment: { id: number; numero: number },
    client: {
      nome:     string;
      email:    string | null;
      cpf:      string | null;
      endereco: string | null;
      bairro:   string | null;
      cidade:   string | null;
      estado:   string | null;
      cep:      string | null;
    },
    opts: { expirationHours?: number; expirationDays?: number },
    expiresAt:         Date,
    externalReference: string,
  ): Promise<MpPaymentResponse> {
    const mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken || !mpToken.startsWith('APP_USR-')) {
      throw new BadRequestException(
        'MP_ACCESS_TOKEN não configurado. Configure em backend/.env e reinicie o serviço.',
      );
    }

    const notificationUrl = process.env.MP_NOTIFICATION_URL
      ? `${process.env.MP_NOTIFICATION_URL}?source_news=webhooks`
      : undefined;

    const nomeParts = client.nome.trim().split(' ');
    const firstName = nomeParts[0];
    const lastName  = nomeParts.slice(1).join(' ') || firstName;
    const email     = client.email ?? 'cliente@siafi.app.br';
    const cpfDigits = client.cpf ? client.cpf.replace(/\D/g, '') : null;

    const payer: Record<string, unknown> = { email, first_name: firstName, last_name: lastName };

    if (cpfDigits && cpfDigits.length === 11) {
      payer.identification = { type: 'CPF', number: cpfDigits };
    }

    if (tipo === ChargeTipo.BOLETO && client.cep) {
      payer.address = {
        zip_code:      client.cep.replace(/\D/g, ''),
        street_name:   client.endereco ?? 'Endereço não informado',
        street_number: '0',
        neighborhood:  client.bairro ?? 'Não informado',
        city:          client.cidade ?? 'Não informado',
        federal_unit:  client.estado ?? 'SP',
      };
    }

    const payload: Record<string, unknown> = {
      transaction_amount:  amount,
      description:         `Parcela #${installment.numero} — ${client.nome}`,
      payment_method_id:   tipo === ChargeTipo.PIX ? 'pix' : 'bolbradesco',
      external_reference:  externalReference,
      date_of_expiration:  expiresAt.toISOString(),
      payer,
    };

    if (notificationUrl) payload.notification_url = notificationUrl;

    // Idempotency key inclui timestamp para permitir reemissões distintas
    const idempotencyKey = `${externalReference}_${Date.now()}`;

    try {
      const { data } = await axios.post<MpPaymentResponse>(
        'https://api.mercadopago.com/v1/payments',
        payload,
        {
          headers: {
            Authorization:      `Bearer ${mpToken}`,
            'Content-Type':     'application/json',
            'X-Idempotency-Key': idempotencyKey,
          },
        },
      );
      return data;
    } catch (err: any) {
      const detail = err.response?.data;
      this.logger.error(
        `MP ${tipo} generation failed`,
        JSON.stringify(detail ?? err.message),
      );
      throw new BadRequestException(
        `Falha ao gerar ${tipo === ChargeTipo.PIX ? 'PIX' : 'boleto'} no Mercado Pago: ${
          detail?.message ?? err.message
        }`,
      );
    }
  }

  // REGRA 5: expiresAt = MIN(dataVencimento, agora + validade_selecionada)
  // Se parcela já vencida: usar somente a validade escolhida (sem cap)
  private _computeExpiresAt(
    tipo:           ChargeTipo,
    opts:           { expirationHours?: number; expirationDays?: number },
    dataVencimento?: Date,
  ): Date {
    const agora = new Date();

    let limiteValidade: Date;
    if (tipo === ChargeTipo.PIX) {
      const hours = opts.expirationHours ?? 24;
      limiteValidade = new Date(agora.getTime() + hours * 3_600_000);
    } else {
      const days = opts.expirationDays ?? 3;
      limiteValidade = new Date(agora.getTime() + days * 86_400_000);
    }

    if (!dataVencimento || dataVencimento <= agora) {
      // Parcela vencida — sem cap, usar validade selecionada
      return limiteValidade;
    }

    // Cap: nunca expirar após o vencimento da parcela
    return limiteValidade.getTime() < dataVencimento.getTime() ? limiteValidade : dataVencimento;
  }
}
