import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { PixService } from '../pix/pix.service';
import { InstallmentsService } from '../installments/installments.service';

@Injectable()
export class ClientPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly pixService: PixService,
    private readonly installmentsService: InstallmentsService,
  ) {}

  // clientId vem do JWT (RequestUser.id = client.id via JwtAuthGuard)

  // ─── Home ─────────────────────────────────────────────────────────────────

  async getHome(clientId: number) {
    const hoje = new Date();
    const em3dias = new Date(hoje.getTime() + 3 * 24 * 60 * 60 * 1000);

    const [loans, ultimosPagamentos, client] = await Promise.all([
      this.prisma.loan.findMany({
        where: { clientId, status: { not: 'cancelado' } },
        include: {
          installments: {
            where: { status: { not: 'cancelado' } },
            orderBy: { dataVencimento: 'asc' },
            select: {
              id: true,
              loanId: true,
              numero: true,
              installmentAmount: true,
              dataVencimento: true,
              status: true,
              totalPago: true,
              // principalPayback e netGain são campos INTERNOS — não selecionar no portal
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.findMany({
        where: { installment: { loan: { clientId } } },
        include: {
          installment: {
            select: { numero: true, loan: { select: { id: true } } },
          },
        },
        orderBy: { dataPagamento: 'desc' },
        take: 5,
      }),
      this.prisma.client.findUnique({
        where: { id: clientId },
        select: { mfaEnabled: true, mfaLoginCount: true, primeiroAcesso: true },
      }),
    ]);

    const contratosAtivos = loans.filter(l => l.status === 'ativo' || l.status === 'inadimplente');
    const contratosPendentesAceite = loans.filter(l => l.status === 'aguardando_aceite');
    const todasParcelas = loans.flatMap(l => l.installments);

    // Parcela em aberto = não paga/cancelada, com saldo > 0 (inclui 'parcialmente_pago').
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const isAberta = (p: { status: string }) => p.status !== 'pago' && p.status !== 'cancelado';
    const saldoDe = (p: { installmentAmount: unknown; totalPago: unknown }) =>
      Math.max(0, Number(p.installmentAmount) - Number(p.totalPago));

    const parcelasAtrasadas = todasParcelas.filter(
      p => isAberta(p) && saldoDe(p) > 0 && p.dataVencimento < inicioHoje,
    );
    const proxVencimento = todasParcelas
      .filter(p => isAberta(p) && saldoDe(p) > 0 && p.dataVencimento >= inicioHoje)
      .sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime())[0];

    // Total em aberto = soma dos SALDOS (installmentAmount - totalPago) das parcelas em aberto.
    const totalEmAberto = todasParcelas
      .filter(isAberta)
      .reduce((sum, p) => sum + saldoDe(p), 0);

    // Banner mais urgente
    let alerta: { tipo: string; mensagem: string; loanId?: number } | null = null;
    if (parcelasAtrasadas.length > 0) {
      const p = parcelasAtrasadas[0];
      const loan = loans.find(l => l.installments.some(i => i.id === p.id));
      const diasAtraso = Math.floor((hoje.getTime() - p.dataVencimento.getTime()) / 86400000);
      alerta = {
        tipo: 'atrasado',
        mensagem: `Você possui ${parcelasAtrasadas.length} parcela(s) em atraso. Vencida há ${diasAtraso} dia(s).`,
        loanId: loan?.id,
      };
    } else if (proxVencimento && proxVencimento.dataVencimento <= em3dias) {
      const loan = loans.find(l => l.installments.some(i => i.id === proxVencimento.id));
      alerta = {
        tipo: 'vencendo',
        mensagem: `Parcela de R$ ${Number(proxVencimento.installmentAmount).toFixed(2)} vence em breve.`,
        loanId: loan?.id,
      };
    } else if (client && !client.mfaEnabled) {
      const restantes = Math.max(0, 5 - (client.mfaLoginCount ?? 0));
      if (restantes > 0) {
        alerta = {
          tipo: 'mfa',
          mensagem: `Configure o Google Authenticator. Você tem ${restantes} acesso(s) antes de ser obrigatório.`,
        };
      }
    }

    return {
      contratosAtivos: contratosAtivos.length,
      contratosPendentesAceite: contratosPendentesAceite.map(l => ({
        id: l.id,
        valor: Number(l.principalAmount),
        numeroParcelas: l.numeroParcelas,
        aceiteExpiraEm: l.aceiteExpiraEm,
      })),
      proximaParcela: proxVencimento
        ? {
            valor: Number(proxVencimento.installmentAmount),
            dataVencimento: proxVencimento.dataVencimento,
            installmentId: proxVencimento.id,
          }
        : null,
      totalEmAberto,
      ultimosPagamentos: ultimosPagamentos.map(p => ({
        id: p.id,
        valor: Number(p.valorPago),
        dataPagamento: p.dataPagamento,
        numeroParcela: p.installment.numero,
        loanId: p.installment.loan.id,
        metodoPagamento: p.metodoPagamento,
      })),
      alerta,
    };
  }

  // ─── Contratos ────────────────────────────────────────────────────────────

  async getContratos(clientId: number) {
    const loans = await this.prisma.loan.findMany({
      where: { clientId, status: { not: 'cancelado' } },
      include: {
        installments: {
          where: { status: { not: 'cancelado' } },
          orderBy: { numero: 'asc' },
          select: {
            id: true,
            numero: true,
            installmentAmount: true,
            dataVencimento: true,
            status: true,
            totalPago: true,
            // principalPayback e netGain são campos INTERNOS — não retornar ao cliente
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return loans.map(loan => {
      const pagas = loan.installments.filter(i => i.status === 'pago').length;
      const percentual = loan.numeroParcelas > 0 ? Math.round((pagas / loan.numeroParcelas) * 100) : 0;
      const proxParcela = loan.installments.find(i => i.status === 'pendente' || i.status === 'atrasado');
      const totalPago = loan.installments.reduce((s, i) => s + Number(i.totalPago), 0);

      return {
        id: loan.id,
        valor: Number(loan.principalAmount),
        numeroParcelas: loan.numeroParcelas,
        dataInicio: loan.dataInicio,
        status: loan.status,
        metodoPagamento: loan.metodoPagamento,
        percentualPago: percentual,
        totalPago,
        proximaParcela: proxParcela
          ? { id: proxParcela.id, valor: Number(proxParcela.installmentAmount), dataVencimento: proxParcela.dataVencimento }
          : null,
      };
    });
  }

  async getContrato(loanId: number, clientId: number) {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, clientId },
      include: {
        installments: {
          where: { status: { not: 'cancelado' } },
          orderBy: { numero: 'asc' },
          select: {
            id: true,
            numero: true,
            installmentAmount: true,
            dataVencimento: true,
            status: true,
            totalPago: true,
            // principalPayback e netGain são campos INTERNOS — não selecionar no portal.
            // valorPago/estornado são necessários para fatiar a mora por período.
            payments: {
              select: { dataPagamento: true, valorPago: true, estornado: true },
              orderBy: { dataPagamento: 'desc' },
            },
          },
        },
      },
    });
    if (!loan) throw new ForbiddenException('Acesso negado.');

    const totalPago = loan.installments.reduce((s, i) => s + Number(i.totalPago), 0);
    const totalParcelado = Number(loan.totalReceivable);

    // Recalcula multa/mora em tempo real (mesma fórmula única do sistema) para o
    // cliente ver o total real a pagar — idêntico ao gerado no PIX e nas telas admin.
    const parcelasComEncargos = await this.installmentsService.recalcularEncargosLista(
      loan.installments,
      loan.multaPercentual,
      loan.moraDiariaPercentual,
    );

    return {
      id: loan.id,
      valor: Number(loan.principalAmount),
      numeroParcelas: loan.numeroParcelas,
      dataInicio: loan.dataInicio,
      status: loan.status,
      metodoPagamento: loan.metodoPagamento,
      aceiteExpiraEm: loan.aceiteExpiraEm,
      totalParcelado,
      totalPago,
      saldoRestante: totalParcelado - totalPago,
      parcelas: parcelasComEncargos.map(i => ({
        id: i.id,
        numero: i.numero,
        valor: Number(i.installmentAmount),
        saldoDevedor: Math.max(0, Number(i.installmentAmount) - Number(i.totalPago)),
        moraAcumulada: Number(i.moraAcumulada),
        multaAplicada: Number(i.multaAplicada),
        valorComEncargos: Number(i.valorComEncargos),
        dataVencimento: i.dataVencimento,
        status: i.status,
        dataPagamento: i.payments[0]?.dataPagamento ?? null,
      })),
    };
  }

  // ─── Aceite digital de proposta ───────────────────────────────────────────

  async aceitarContrato(loanId: number, clientId: number, ip: string): Promise<unknown> {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, clientId },
      select: { id: true, status: true, aceiteExpiraEm: true, clientId: true, principalAmount: true, numeroParcelas: true, totalReceivable: true, dataInicio: true },
    });

    if (!loan) throw new ForbiddenException('Contrato não encontrado.');

    if (loan.status !== 'aguardando_aceite') {
      throw new BadRequestException(
        loan.status === 'aguardando_liberacao' || loan.status === 'ativo'
          ? 'Contrato já foi aceito anteriormente.'
          : 'Este contrato não está disponível para aceite.',
      );
    }

    if (loan.aceiteExpiraEm && loan.aceiteExpiraEm < new Date()) {
      throw new BadRequestException('O prazo para aceite desta proposta expirou.');
    }

    const agora = new Date();
    const payload = JSON.stringify({
      loanId:          loan.id,
      clientId:        loan.clientId,
      principal:       loan.principalAmount.toString(),
      totalReceivable: loan.totalReceivable.toString(),
      numeroParcelas:  loan.numeroParcelas,
      dataInicio:      loan.dataInicio?.toISOString(),
      timestamp:       agora.toISOString(),
    });
    const aceiteHash = createHash('sha256').update(payload).digest('hex');

    await this.prisma.loan.update({
      where: { id: loanId },
      data: {
        status:           'aguardando_liberacao',
        aceiteClienteEm:  agora,
        aceiteClienteIp:  ip,
        aceiteClienteHash: aceiteHash,
      },
    });

    return { sucesso: true, aceiteEm: agora };
  }

  // ─── Pagamentos ───────────────────────────────────────────────────────────

  async getPagamentos(clientId: number, loanId?: number) {
    const where: Record<string, unknown> = {
      installment: { loan: { clientId } },
    };
    if (loanId) {
      (where.installment as Record<string, unknown>) = { loan: { clientId, id: loanId } };
    }

    const pagamentos = await this.prisma.payment.findMany({
      where,
      include: {
        installment: {
          select: {
            numero: true,
            loan: { select: { id: true } },
          },
        },
      },
      orderBy: { dataPagamento: 'desc' },
    });

    return pagamentos.map(p => ({
      id: p.id,
      valor: Number(p.valorPago),
      dataPagamento: p.dataPagamento,
      metodoPagamento: p.metodoPagamento,
      numeroParcela: p.installment.numero,
      loanId: p.installment.loan.id,
    }));
  }

  // ─── PIX ──────────────────────────────────────────────────────────────────

  async gerarPix(installmentId: number, clientId: number) {
    // Validar ownership
    const installment = await this.prisma.installment.findFirst({
      where: { id: installmentId, loan: { clientId } },
    });
    if (!installment) throw new ForbiddenException('Parcela não encontrada.');

    // Delegar geração ao PixService — cliente pode gerar QR para parcelas não vencidas
    const portalUser = { id: clientId, role: 'cliente', tipo: 'cliente' as const, supabaseId: '', username: '', nome: '', aal: undefined }
    const pix = await this.pixService.generate({ installmentId, tipo: 'pix' } as any, portalUser) as any;

    return {
      pixId: pix.id,
      qrCode: pix.qrCode ?? null,
      qrImage: pix.qrImage ?? null,
      valor: Number(pix.amount ?? installment.installmentAmount),
      expiresAt: pix.expiresAt ?? null,
      status: pix.status,
    };
  }

  async getPixStatus(pixId: number, clientId: number) {
    const pix = await this.prisma.pixPayment.findFirst({
      where: {
        id: pixId,
        client: { id: clientId },
      },
      select: { id: true, status: true, updatedAt: true },
    });
    if (!pix) throw new ForbiddenException('Pagamento não encontrado.');
    return { status: pix.status, updatedAt: pix.updatedAt };
  }

  // ─── Suporte ──────────────────────────────────────────────────────────────

  async getTickets(clientId: number) {
    return this.prisma.supportTicket.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Listagem de todos os tickets para operadores (tela administrativa /suporte).
  async listAllTickets(status?: string) {
    return this.prisma.supportTicket.findMany({
      where: status ? { status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { client: { select: { id: true, nome: true } } },
    });
  }

  async getTicket(ticketId: number, clientId: number) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, clientId },
    });
    if (!ticket) throw new ForbiddenException('Ticket não encontrado.');
    return ticket;
  }

  async createTicket(clientId: number, assunto: string, mensagem: string) {
    return this.prisma.supportTicket.create({
      data: { clientId, assunto, mensagem },
    });
  }

  // ─── Perfil ───────────────────────────────────────────────────────────────

  async getPerfil(clientId: number) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        nome: true,
        cpf: true,
        email: true,
        whatsapp: true,
        telefone: true,
        endereco: true,
        bairro: true,
        cidade: true,
        estado: true,
        mfaEnabled: true,
        mfaLoginCount: true,
        notificacoesEmail: true,
        notificacoesWhatsapp: true,
        senhaTemporaria: true,
        primeiroAcesso: true,
      },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado.');
    return client;
  }

  async marcarPrimeiroAcessoConcluido(clientId: number) {
    await this.prisma.client.update({
      where: { id: clientId },
      data: { primeiroAcesso: false, senhaTemporaria: false },
    });
    return { sucesso: true };
  }

  async redefinirSenha(clientId: number, password: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { supabaseId: true },
    });
    if (!client?.supabaseId) throw new NotFoundException('Conta não encontrada.');

    const { error } = await this.supabase.admin.auth.admin.updateUserById(client.supabaseId, { password });
    if (error) throw new InternalServerErrorException(`Erro ao redefinir senha: ${error.message}`);

    await this.prisma.client.update({
      where: { id: clientId },
      data: { primeiroAcesso: false, senhaTemporaria: false },
    });
    return { sucesso: true };
  }

  async marcarTicketLido(ticketId: number, clientId: number) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, clientId },
    });
    if (!ticket) throw new ForbiddenException('Ticket não encontrado.');
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { lido: true },
    });
  }

  async updateMfaStatus(clientId: number, mfaEnabled: boolean) {
    await this.prisma.client.update({
      where: { id: clientId },
      data: { mfaEnabled },
    });
    return { sucesso: true };
  }

  async updateNotificacoes(
    clientId: number,
    notificacoesEmail?: boolean,
    notificacoesWhatsapp?: boolean,
  ) {
    const data: Record<string, boolean> = {};
    if (notificacoesEmail !== undefined) data.notificacoesEmail = notificacoesEmail;
    if (notificacoesWhatsapp !== undefined) data.notificacoesWhatsapp = notificacoesWhatsapp;

    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data,
      select: { notificacoesEmail: true, notificacoesWhatsapp: true },
    });
    return updated;
  }
}
