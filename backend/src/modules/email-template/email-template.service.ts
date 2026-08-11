import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const PORTAL_URL = 'https://siafi.app.br/portal';
const LOGO_URL   = 'https://siafi.app.br/logo.png';

const FOOTER = `
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#9ca3af;font-size:12px;text-align:center">
    {{empresaNome}} — Sistema de Apoio Financeiro<br>
    Dúvidas? Acesse <a href="${PORTAL_URL}" style="color:#6b7280">${PORTAL_URL}</a>
  </p>`;

const WRAP = (inner: string) => `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff">
  <img src="${LOGO_URL}" alt="{{empresaNome}}" style="height:40px;margin-bottom:24px">
  ${inner}
  ${FOOTER}
</div>`;

const DEFAULT_TEMPLATES = [
  {
    slug:      'email.lembrete-vencimento',
    nome:      'Lembrete de Vencimento',
    assunto:   'Lembrete: parcela de {{valorParcela}} vence em {{dataVencimento}}',
    variaveis: ['clienteNome', 'valorParcela', 'dataVencimento', 'empresaNome'],
    corpo: WRAP(`
      <h2 style="color:#111827">Lembrete de Vencimento</h2>
      <p>Olá, <strong>{{clienteNome}}</strong>!</p>
      <p>Sua parcela de <strong>{{valorParcela}}</strong> vence em <strong>{{dataVencimento}}</strong>.</p>
      <p>Acesse o portal para efetuar o pagamento:</p>
      <a href="${PORTAL_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
        Pagar agora
      </a>`),
  },
  {
    slug:      'email.confirmacao-pagamento',
    nome:      'Confirmação de Pagamento',
    assunto:   '✅ Pagamento de {{valorParcela}} confirmado',
    variaveis: ['clienteNome', 'valorParcela', 'dataPagamento', 'empresaNome'],
    corpo: WRAP(`
      <h2 style="color:#16a34a">Pagamento Confirmado</h2>
      <p>Olá, <strong>{{clienteNome}}</strong>!</p>
      <p>Recebemos seu pagamento de <strong>{{valorParcela}}</strong> em <strong>{{dataPagamento}}</strong>. Obrigado pela pontualidade! 🎉</p>
      <a href="${PORTAL_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
        Ver extrato
      </a>`),
  },
  {
    slug:      'email.portal-ativado',
    nome:      'Portal Ativado / Nova Senha',
    assunto:   'SIAFI — Seu acesso ao portal foi ativado',
    variaveis: ['clienteNome', 'senhaTemporaria', 'empresaNome'],
    corpo: WRAP(`
      <h2 style="color:#111827">Bem-vindo ao Portal!</h2>
      <p>Olá, <strong>{{clienteNome}}</strong>!</p>
      <p>Seu acesso foi criado. Use a senha temporária abaixo para entrar:</p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0;text-align:center">
        <span style="font-size:24px;font-weight:bold;letter-spacing:4px">{{senhaTemporaria}}</span>
      </div>
      <p style="color:#ef4444;font-size:14px">⚠️ Troque sua senha imediatamente após o primeiro acesso.</p>
      <a href="${PORTAL_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
        Acessar portal
      </a>`),
  },
  {
    slug:      'email.cobranca-antecipada',
    nome:      'Cobrança Antecipada com Boleto',
    assunto:   'Aviso: parcela de {{valorParcela}} vence em {{dataVencimento}}',
    variaveis: ['clienteNome', 'valorParcela', 'dataVencimento', 'empresaNome'],
    corpo: WRAP(`
      <h2 style="color:#1e40af">Aviso de Vencimento</h2>
      <p>Olá, <strong>{{clienteNome}}</strong>!</p>
      <p>Sua parcela de <strong>{{valorParcela}}</strong> vence em <strong>{{dataVencimento}}</strong>.</p>
      <p>O boleto está em anexo neste e-mail. Você também pode pagar via PIX pelo portal:</p>
      <a href="${PORTAL_URL}" style="display:inline-block;background:#1e40af;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
        Acessar portal
      </a>`),
  },
  {
    slug:      'intencao.aprovada',
    nome:      'Intenção Aprovada (para cliente)',
    assunto:   '🎉 Seu empréstimo foi aprovado!',
    variaveis: ['clienteNome', 'valorAprovado', 'numeroParcelas', 'valorParcela', 'empresaNome'],
    corpo: WRAP(`
      <h2 style="color:#16a34a">Empréstimo Aprovado!</h2>
      <p>Olá, <strong>{{clienteNome}}</strong>!</p>
      <p>Temos uma ótima notícia: seu empréstimo de <strong>{{valorAprovado}}</strong> foi aprovado!</p>
      <ul style="margin:16px 0;padding-left:24px">
        <li>Valor: <strong>{{valorAprovado}}</strong></li>
        <li>Parcelas: <strong>{{numeroParcelas}}x de {{valorParcela}}</strong></li>
      </ul>
      <p>Acesse o portal para assinar o contrato e confirmar o recebimento:</p>
      <a href="${PORTAL_URL}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
        Assinar contrato
      </a>`),
  },
  {
    slug:      'intencao.rejeitada',
    nome:      'Intenção Rejeitada (para cliente)',
    assunto:   'Atualização sobre sua solicitação de empréstimo',
    variaveis: ['clienteNome', 'motivoTipo', 'empresaNome'],
    corpo: WRAP(`
      <h2 style="color:#dc2626">Solicitação não aprovada</h2>
      <p>Olá, <strong>{{clienteNome}}</strong>,</p>
      <p>Após análise, não foi possível aprovar sua solicitação de empréstimo no momento.</p>
      <p style="color:#6b7280;font-size:14px">Motivo: {{motivoTipo}}</p>
      <p>Caso tenha dúvidas, entre em contato com seu consultor ou acesse o portal.</p>
      <a href="${PORTAL_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
        Acessar portal
      </a>`),
  },
  {
    slug:      'proposta.capital-liberado',
    nome:      'Capital Liberado (para cliente)',
    assunto:   '💰 Seu empréstimo foi liberado!',
    variaveis: ['clienteNome', 'valorCapital', 'dataLiberacao', 'empresaNome'],
    corpo: WRAP(`
      <h2 style="color:#16a34a">Capital Liberado!</h2>
      <p>Olá, <strong>{{clienteNome}}</strong>!</p>
      <p>O valor de <strong>{{valorCapital}}</strong> foi entregue em <strong>{{dataLiberacao}}</strong>.</p>
      <p>Suas parcelas começam a vencer conforme o contrato. Acompanhe pelo portal:</p>
      <a href="${PORTAL_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
        Ver meu contrato
      </a>`),
  },
  {
    slug:      'proposta.expirando-cliente',
    nome:      'Aceite de Contrato Expirando',
    assunto:   '⏰ Seu contrato precisa ser aceito — {{diasRestantes}} dia(s) restante(s)',
    variaveis: ['clienteNome', 'diasRestantes', 'empresaNome'],
    corpo: WRAP(`
      <h2 style="color:#d97706">Aceite Pendente</h2>
      <p>Olá, <strong>{{clienteNome}}</strong>!</p>
      <p>Seu contrato foi aprovado, mas ainda aguarda sua assinatura digital.</p>
      <p><strong>Restam apenas {{diasRestantes}} dia(s)</strong> para aceitar o contrato. Após esse prazo, a proposta será cancelada automaticamente.</p>
      <a href="${PORTAL_URL}" style="display:inline-block;background:#d97706;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
        Assinar agora
      </a>`),
  },
];

export interface UpdateTemplateDto {
  nome?:    string;
  assunto?: string;
  corpo?:   string;
  ativo?:   boolean;
}

@Injectable()
export class EmailTemplateService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

  private async seedDefaults() {
    for (const tpl of DEFAULT_TEMPLATES) {
      await this.prisma.emailTemplate.upsert({
        where:  { slug: tpl.slug },
        create: tpl,
        update: { variaveis: tpl.variaveis },  // keep user edits, refresh variable list only
      });
    }
  }

  async findAll() {
    return this.prisma.emailTemplate.findMany({ orderBy: { slug: 'asc' } });
  }

  async findBySlug(slug: string) {
    const tpl = await this.prisma.emailTemplate.findUnique({ where: { slug } });
    if (!tpl) throw new NotFoundException(`Template "${slug}" não encontrado`);
    return tpl;
  }

  async update(slug: string, dto: UpdateTemplateDto) {
    await this.findBySlug(slug);
    return this.prisma.emailTemplate.update({ where: { slug }, data: dto });
  }

  async renderPreview(slug: string, vars: Record<string, string>) {
    const tpl = await this.findBySlug(slug);
    let corpo   = tpl.corpo;
    let assunto = tpl.assunto;
    const defaults: Record<string, string> = {
      clienteNome:     vars.clienteNome   ?? 'João da Silva',
      empresaNome:     vars.empresaNome   ?? 'Lidera',
      valorParcela:    vars.valorParcela  ?? 'R$ 250,00',
      dataVencimento:  vars.dataVencimento ?? '15/06/2026',
      dataPagamento:   vars.dataPagamento  ?? '10/06/2026',
      senhaTemporaria: vars.senhaTemporaria ?? 'Abc123!@',
      valorAprovado:   vars.valorAprovado  ?? 'R$ 3.000,00',
      numeroParcelas:  vars.numeroParcelas ?? '12',
      motivoTipo:      vars.motivoTipo     ?? 'Renda insuficiente',
      valorCapital:    vars.valorCapital   ?? 'R$ 3.000,00',
      dataLiberacao:   vars.dataLiberacao  ?? '10/06/2026',
      diasRestantes:   vars.diasRestantes  ?? '2',
      ...vars,
    };
    for (const [k, v] of Object.entries(defaults)) {
      corpo   = corpo.replaceAll(`{{${k}}}`, v);
      assunto = assunto.replaceAll(`{{${k}}}`, v);
    }
    return { assunto, corpo };
  }

  getTemplate(slug: string): Promise<{ assunto: string; corpo: string } | null> {
    return this.prisma.emailTemplate
      .findUnique({ where: { slug, ativo: true } })
      .then(t => (t ? { assunto: t.assunto, corpo: t.corpo } : null));
  }
}
