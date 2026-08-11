'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/auth.context'
import { cn, hojeISODate } from '@/lib/utils'
import { Search, ChevronRight, Lock, FileDown, Loader2 } from 'lucide-react'
import api from '@/lib/api'

// ─── Content helpers ──────────────────────────────────────────────────────────

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 mb-2 text-base font-semibold text-foreground">{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-foreground">{children}</p>
}

function Code({ children }: { children: string }) {
  return (
    <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
      <code>{children.trim()}</code>
    </pre>
  )
}

function DocTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="border border-border bg-muted px-3 py-2 text-left font-medium text-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="even:bg-muted/30">
              {row.map((cell, j) => (
                <td key={j} className="border border-border px-3 py-2 text-muted-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Ol({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 text-sm text-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  )
}

// ─── Docs data ────────────────────────────────────────────────────────────────

interface DocItem {
  id: string
  title: string
  content: React.ReactNode
}

interface DocSection {
  id: string
  title: string
  items: DocItem[]
}

const DOCS: DocSection[] = [
  {
    id: 'visao-geral',
    title: 'Visão Geral',
    items: [
      {
        id: 'arquitetura',
        title: 'Arquitetura do sistema',
        content: (
          <>
            <P>
              O SIAFI 2.0 é um monolito modular composto por backend NestJS e frontend Next.js,
              conectados ao Supabase (PostgreSQL + Auth + Storage + Realtime) e à infraestrutura
              de filas BullMQ + Redis (Upstash).
            </P>
            <DocTable
              headers={['Componente', 'Tecnologia', 'Porta']}
              rows={[
                ['Backend API', 'NestJS 10 + TypeScript 5 + Prisma 5', '4010'],
                ['Frontend Web', 'Next.js 16 + TypeScript 5 + Tailwind CSS 4', '4011'],
                ['Banco de Dados', 'PostgreSQL via Supabase (sa-east-1)', '—'],
                ['Autenticação', 'Supabase Auth (GoTrue) + JWT local', '—'],
                ['Filas', 'BullMQ + Redis (Upstash)', '—'],
                ['Realtime', 'Supabase Realtime (postgres_changes)', '—'],
                ['Deploy', 'NSSM (Windows Service) + Nginx 1.28 + SSL', '443/80'],
              ]}
            />
            <P>
              21 módulos NestJS organizados em domínios: Core (auth, users, settings, audit),
              Financeiro (clients, loans, installments, payments, transactions, renegociacoes,
              reports), Operações (intencao, reparcelamento, consultor, score-risco, cobranca,
              pix, webhook), Comunicação (mensagem, email, notifications) e Portal
              (client-portal, support).
            </P>
          </>
        ),
      },
      {
        id: 'stack',
        title: 'Stack tecnológica',
        content: (
          <DocTable
            headers={['Camada', 'Tecnologia', 'Versão']}
            rows={[
              ['Backend', 'NestJS', '10'],
              ['Backend', 'TypeScript', '5'],
              ['Backend', 'Prisma ORM', '5'],
              ['Frontend', 'Next.js (App Router)', '16'],
              ['Frontend', 'Tailwind CSS', '4'],
              ['Frontend', 'shadcn/ui', 'latest'],
              ['Banco', 'PostgreSQL via Supabase', 'Cloud (sa-east-1)'],
              ['Auth', 'Supabase Auth (GoTrue)', 'Cloud'],
              ['Filas', 'BullMQ', 'latest'],
              ['Cache/Filas', 'Redis — Upstash', 'Cloud'],
              ['Pagamentos', 'Mercado Pago SDK', 'latest'],
              ['WhatsApp', 'Evolution API', 'v2'],
              ['E-mail', 'Nodemailer + SMTP', '—'],
            ]}
          />
        ),
      },
      {
        id: 'ambientes',
        title: 'Ambientes',
        content: (
          <>
            <DocTable
              headers={['Item', 'Desenvolvimento', 'Produção']}
              rows={[
                ['Backend', 'npm run start:dev (:4010)', 'NSSM SIAFI-API (:4010)'],
                ['Frontend', 'npm run dev (:4011)', 'NSSM SIAFI-WEB (:4011)'],
                ['SSL', 'Não', "Let's Encrypt via Nginx"],
                ['URL', 'http://localhost:4011', 'https://financeiro.lidera.app.br'],
                ['Banco', 'Supabase Cloud (mesmo projeto)', 'Supabase Cloud'],
                ['Redis', 'Upstash (mesmo)', 'Upstash'],
              ]}
            />
            <H3>Comandos NSSM em produção</H3>
            <Code>{`
# Backend
sc.exe stop SIAFI-API && sc.exe start SIAFI-API

# Frontend
sc.exe stop SIAFI-WEB && sc.exe start SIAFI-WEB

# Serviços de DEV (manuais — não iniciam automaticamente)
# SIAFI-API-DEV · SIAFI-WEB-DEV
            `}</Code>
          </>
        ),
      },
      {
        id: 'env-vars',
        title: 'Variáveis de ambiente',
        content: (
          <>
            <H3>Backend — backend/.env</H3>
            <DocTable
              headers={['Variável', 'Descrição']}
              rows={[
                ['DATABASE_URL', 'Pooler Supabase — Transaction mode, porta 6543'],
                ['DIRECT_DATABASE_URL', 'Conexão direta Supabase, porta 5432 (migrations)'],
                ['JWT_SECRET', 'Chave para assinar tokens JWT locais'],
                ['SUPABASE_URL', 'URL do projeto Supabase'],
                ['SUPABASE_SERVICE_KEY', 'Service role key — nunca expor ao cliente'],
                ['REDIS_URL', 'URL do Redis Upstash'],
                ['MP_ACCESS_TOKEN', 'Access Token do Mercado Pago (produção)'],
                ['MP_WEBHOOK_SECRET', 'Chave de validação do webhook MP'],
                ['WHATSAPP_API_URL', 'URL da Evolution API'],
                ['WHATSAPP_API_KEY', 'Chave de autenticação da Evolution API'],
                ['WHATSAPP_INSTANCE', 'Nome da instância WhatsApp'],
                ['MAIL_HOST', 'Servidor SMTP (ex: smtp.hostinger.com)'],
                ['MAIL_PORT', 'Porta SMTP (ex: 465)'],
                ['MAIL_USER', 'E-mail remetente'],
                ['MAIL_PASS', 'Senha do e-mail remetente'],
              ]}
            />
            <H3>Frontend — frontend/.env.local</H3>
            <DocTable
              headers={['Variável', 'Descrição']}
              rows={[
                ['NEXT_PUBLIC_API_URL', 'URL do backend (ex: http://localhost:4010)'],
                ['NEXT_PUBLIC_SUPABASE_URL', 'URL do projeto Supabase'],
                ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Anon key do Supabase (pública)'],
              ]}
            />
          </>
        ),
      },
    ],
  },

  {
    id: 'banco',
    title: 'Banco de Dados',
    items: [
      {
        id: 'models',
        title: 'Models e relacionamentos',
        content: (
          <>
            <P>
              Schema <code className="font-mono text-emerald-600 dark:text-emerald-400">siafi_v2</code> no Supabase. ORM Prisma 5.
              Todos os valores monetários usam tipo{' '}
              <code className="font-mono text-emerald-600 dark:text-emerald-400">Decimal</code> — nunca{' '}
              <code className="font-mono text-red-600 dark:text-red-400">Float</code>.
            </P>
            <DocTable
              headers={['Model', 'Descrição', 'Relacionamentos principais']}
              rows={[
                ['User', 'Operadores e clientes autenticados', 'Client (via consultorId)'],
                ['Client', 'Clientes do sistema', 'Loan[], ScoreRisco, User (consultor)'],
                ['Loan', 'Contratos de crédito', 'Installment[], Client, User'],
                ['Installment', 'Parcelas do contrato', 'Payment[], Loan'],
                ['Payment', 'Pagamentos registrados', 'Installment, Transaction'],
                ['Transaction', 'Movimentações do caixa', 'Loan?, Payment?'],
                ['IntencaoEmprestimo', 'Solicitações de novos contratos', 'Client, User, Loan?'],
                ['SolicitacaoReparcelamento', 'Fluxo de reparcelamento', 'Loan, Client'],
                ['ScoreRisco', 'Pontuação de crédito (1:1)', 'Client'],
                ['Conversa', 'Conversas do chat interno', 'ConversaParticipante[], Mensagem[]'],
                ['Mensagem', 'Mensagens do chat', 'Conversa, User'],
                ['EmailTemplate', 'Templates editáveis de e-mail', '—'],
                ['CobrancaContato', 'Tentativas de cobrança registradas', 'Installment, Client, User'],
                ['ConsultorSolicitacao', 'Pedidos do consultor ao financeiro', 'User'],
                ['AuditLog', 'Log imutável de ações', 'User'],
                ['SiteSetting', 'Parâmetros globais (chave/valor)', '—'],
                ['SupportTicket', 'Chamados de suporte', 'Client?, User?'],
                ['Notification', 'Log de notificações enviadas', 'User?, Client?'],
                ['Renegociacao', 'Renegociações de dívida', 'Loan'],
              ]}
            />
          </>
        ),
      },
      {
        id: 'enums',
        title: 'Enums ativos',
        content: (
          <DocTable
            headers={['Enum', 'Valores']}
            rows={[
              ['UserRole', 'admin · financeiro · consultor · caixa · cliente'],
              [
                'LoanStatus',
                'aguardando_aceite · aguardando_liberacao · ativo · quitado · cancelado · renegociado',
              ],
              ['InstallmentStatus', 'pendente · parcialmente_pago · pago · atrasado · cancelado'],
              ['PaymentMethod', 'dinheiro · pix · ted · boleto · outros'],
              ['TransactionType', 'entrada · saida'],
              [
                'IntencaoStatus',
                'rascunho · pendente · em_analise · aprovada · rejeitada · expirada',
              ],
              [
                'ReparcelamentoStatus',
                'solicitado · proposta_enviada · aguardando_aprovacao · aprovado · rejeitado · executado',
              ],
              ['CobrancaCanal', 'whatsapp · email · portal · presencial · telefone'],
              [
                'CobrancaResultado',
                'contactado_pagamento_prometido · sem_contato · solicitou_reparcelamento · outros',
              ],
            ]}
          />
        ),
      },
      {
        id: 'convencoes-db',
        title: 'Convenções',
        content: (
          <DocTable
            headers={['Convenção', 'Regra']}
            rows={[
              ['Nomenclatura', 'snake_case no banco · camelCase nos models Prisma'],
              ['Soft-delete', 'active: Boolean @default(true) em User e Client'],
              ['Timestamps', 'createdAt @default(now()) + updatedAt @updatedAt'],
              ['Monetário', 'Sempre Decimal — nunca Float'],
              ['IDs', 'String @id @default(cuid())'],
              ['AuditLog', 'Sem cascade delete — imutável por design'],
              [
                'Campos protegidos',
                'principal_payback e net_gain jamais serializados para caixa/cliente',
              ],
            ]}
          />
        ),
      },
      {
        id: 'conexao-supabase',
        title: 'Conexão Supabase',
        content: (
          <>
            <P>
              Projeto <code className="font-mono text-emerald-600 dark:text-emerald-400">lvpseuaybpnmrneuyndi</code> — região{' '}
              <code className="font-mono text-emerald-600 dark:text-emerald-400">sa-east-1</code> (São Paulo).
            </P>
            <Code>{`
// prisma/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")        // pooler :6543 — usar na API
  directUrl = env("DIRECT_DATABASE_URL") // direct :5432 — usar em migrations
}`}</Code>
            <P>
              Use o pooler em Transaction mode na API. Use a conexão direta apenas ao rodar{' '}
              <code className="font-mono text-emerald-600 dark:text-emerald-400">prisma migrate deploy</code>.
            </P>
          </>
        ),
      },
    ],
  },

  {
    id: 'autenticacao',
    title: 'Autenticação',
    items: [
      {
        id: 'fluxo-auth',
        title: 'Fluxo Supabase Auth + JWT',
        content: (
          <>
            <P>
              Autenticação em duas camadas: Supabase Auth valida credenciais, backend emite JWT
              local com o campo <code className="font-mono text-emerald-600 dark:text-emerald-400">role</code>.
            </P>
            <Code>{`
// Login
POST /api/auth/login
→ Supabase signInWithPassword(email, senha)
→ Valida role no banco local (tabela User)
→ Emite JWT: { sub, email, role }
→ Retorna: { accessToken, refreshToken, user }

// Renovação automática
POST /api/auth/refresh   ← frontend intercepta 401 e chama antes de retentar

// Proteção de endpoint
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'financeiro')
@Get('/rota')
findAll() { ... }`}</Code>
          </>
        ),
      },
      {
        id: 'roles',
        title: 'Roles e permissões',
        content: (
          <DocTable
            headers={['Role', 'Acesso', 'Restrições']}
            rows={[
              ['admin', 'Tudo', 'Nenhuma'],
              [
                'financeiro',
                'Clientes, contratos, pagamentos, relatórios, reparcelamentos, caixa',
                'Sem acesso a usuários, configurações, auditoria',
              ],
              [
                'consultor',
                'Carteira, intenções, solicitações, cobranças, reparcelamentos, mensagens',
                'Filtrado por consultorId — só vê os próprios clientes',
              ],
              [
                'caixa',
                'Liberações, pagamentos, parcelas, caixa, clientes (leitura)',
                'Não vê split (principal_payback/net_gain) nem score',
              ],
              [
                'cliente',
                'Portal: contratos, parcelas, PIX, suporte, perfil',
                'Isolado por RLS — acessa apenas os próprios dados',
              ],
            ]}
          />
        ),
      },
      {
        id: 'mfa',
        title: 'MFA por perfil',
        content: (
          <>
            <DocTable
              headers={['Perfil', 'Obrigatório', 'Prazo']}
              rows={[
                ['admin', 'Sim', 'No primeiro acesso'],
                ['financeiro', 'Sim', 'No primeiro acesso'],
                ['consultor', 'Sim', 'No primeiro acesso'],
                ['caixa', 'Sim', 'Até o 5º login'],
                ['cliente', 'Sim', 'Até o 5º login'],
              ]}
            />
            <P>
              Implementado via Supabase TOTP (Google Authenticator). Campo{' '}
              <code className="font-mono text-emerald-600 dark:text-emerald-400">loginCount</code> no model User controla o
              prazo. Campo <code className="font-mono text-emerald-600 dark:text-emerald-400">mfaEnabled</code> indica se já
              configurou.
            </P>
          </>
        ),
      },
      {
        id: 'oauth-google',
        title: 'OAuth Google',
        content: (
          <>
            <Code>{`
// Fluxo OAuth
1. supabase.auth.signInWithOAuth({ provider: 'google' })
2. Supabase redireciona para Google OAuth
3. Google retorna para /auth/callback
4. Backend valida session, emite JWT local com role
5. Frontend armazena tokens e redireciona por role

// Restrição: e-mail da conta Google deve estar
// cadastrado no model User — caso contrário, acesso negado`}</Code>
          </>
        ),
      },
    ],
  },

  {
    id: 'modulos-backend',
    title: 'Módulos Backend',
    items: [
      {
        id: 'lista-modulos',
        title: 'Lista de módulos',
        content: (
          <DocTable
            headers={['Módulo', 'Base', 'Roles', 'Descrição']}
            rows={[
              ['auth', '/api/auth', 'público', 'Login, refresh, logout, me, MFA'],
              ['users', '/api/users', 'admin', 'CRUD de operadores'],
              ['clients', '/api/clients', 'admin, financeiro, caixa', 'CRUD + upload documentos'],
              ['loans', '/api/loans', 'admin, financeiro', 'Contratos + split decimal.js'],
              ['installments', '/api/installments', 'admin, financeiro, caixa', 'Parcelas + pagamento parcial'],
              ['payments', '/api/payments', 'admin, financeiro, caixa', 'Pagamentos + estorno'],
              ['transactions', '/api/transactions', 'admin, financeiro, caixa', 'Saldo e movimentações'],
              ['renegociacoes', '/api/renegociacoes', 'admin, financeiro', 'Renegociação de dívidas'],
              ['pix', '/api/pix', 'admin, financeiro, consultor', 'QR Code Mercado Pago'],
              ['webhook', '/api/webhook/mp', 'público', 'Confirmação MP'],
              ['notifications', '/api/notifications', 'admin, financeiro', 'Log de notificações'],
              ['reports', '/api/reports', 'admin, financeiro', 'Carteira, faturamento, aging'],
              ['audit', '/api/audit', 'admin', 'Log imutável'],
              ['settings', '/api/settings', 'admin', 'Parâmetros globais'],
              ['client-portal', '/api/portal', 'cliente', 'Portal do cliente'],
              ['score-risco', '/api/score-risco', 'admin, financeiro, consultor', 'Score ponderado'],
              ['intencao', '/api/intencoes', 'admin, financeiro, consultor', 'Intenções + SLA'],
              ['reparcelamento', '/api/reparcelamentos', 'admin, financeiro, consultor', 'Fluxo completo'],
              ['mensagem', '/api/mensagens', 'admin, financeiro, consultor, caixa', 'Chat + Realtime'],
              ['email', '(interno)', 'sistema', 'Templates + BullMQ'],
              ['cobranca', '(interno)', 'sistema', 'Cobrança antecipada'],
              ['consultor', '/api/consultor', 'consultor, admin, financeiro', 'Carteira filtrada'],
            ]}
          />
        ),
      },
      {
        id: 'guards-decorators',
        title: 'Guards e decorators',
        content: (
          <>
            <Code>{`
@UseGuards(JwtAuthGuard, RolesGuard) // controller ou método
@Roles('admin', 'financeiro')        // roles permitidas
@CurrentUser() user: AuthUser        // injetar usuário
@Public()                            // bypassar guards

// Regra crítica: rotas estáticas ANTES de /:id
@Get('stats')   // ← primeiro
@Get('simular') // ← depois
@Get(':id')     // ← por último`}</Code>
          </>
        ),
      },
      {
        id: 'audit-interceptor',
        title: 'AuditInterceptor',
        content: (
          <>
            <P>
              Intercepta POST, PATCH e DELETE. Persiste no model{' '}
              <code className="font-mono text-emerald-600 dark:text-emerald-400">AuditLog</code>: userId, action, entity,
              entityId, before, after, ip, createdAt. Imutável — sem endpoint de DELETE.
            </P>
          </>
        ),
      },
      {
        id: 'filas-bullmq',
        title: 'Filas BullMQ',
        content: (
          <>
            <H3>notif-queue</H3>
            <DocTable
              headers={['Job', 'Trigger', 'Ação']}
              rows={[
                ['send-whatsapp', 'Pagamento, vencimento, cobrança', 'Evolution API'],
                ['send-email', 'Boas-vindas, aprovação, cobrança', 'SMTP via Nodemailer'],
                ['activate-portal', 'Intenção aprovada (sem supabaseId)', 'Cria user Supabase + e-mail'],
              ]}
            />
            <H3>payment-queue</H3>
            <DocTable
              headers={['Job', 'Trigger', 'Ação']}
              rows={[
                ['confirm-mp-payment', 'Webhook Mercado Pago', 'Marca parcela como paga'],
                ['retry-webhook', 'Falha na confirmação', 'Reprocessa até 3 tentativas'],
              ]}
            />
            <P>
              BullBoard disponível em{' '}
              <code className="font-mono text-emerald-600 dark:text-emerald-400">/admin/queues</code> para monitoramento em
              tempo real.
            </P>
          </>
        ),
      },
    ],
  },

  {
    id: 'frontend-doc',
    title: 'Frontend',
    items: [
      {
        id: 'estrutura-rotas',
        title: 'Estrutura de rotas',
        content: (
          <DocTable
            headers={['Grupo', 'Path', 'Roles', 'Descrição']}
            rows={[
              ['(auth)', '/login', 'público', 'Login + OAuth Google + MFA'],
              [
                '(dashboard)',
                '/dashboard, /clientes, /emprestimos, ...',
                'operadores internos',
                '35+ páginas — protegidas por RouteRoleGuard',
              ],
              [
                '(portal)',
                '/portal, /portal/contratos, ...',
                'cliente',
                'Portal mobile-first com BottomNav',
              ],
            ]}
          />
        ),
      },
      {
        id: 'route-role-guard',
        title: 'Route-Role Guard',
        content: (
          <>
            <P>
              Implementado em{' '}
              <code className="font-mono text-emerald-600 dark:text-emerald-400">app/(dashboard)/layout.tsx</code> via array{' '}
              <code className="font-mono text-emerald-600 dark:text-emerald-400">ROUTE_ROLES</code>. Rotas sem match são
              acessíveis a todos os perfis internos autenticados.
            </P>
            <Code>{`
const ROUTE_ROLES = [
  { prefix: '/usuarios',        roles: ['admin'] },
  { prefix: '/emprestimos',     roles: ['admin', 'financeiro'] },
  { prefix: '/reparcelamentos', roles: ['admin', 'financeiro', 'consultor'] },
  { prefix: '/clientes',        roles: ['admin', 'financeiro', 'caixa', 'consultor'] },
  // ...
]

function isAllowed(pathname, role) {
  const match = ROUTE_ROLES.find(r => pathname.startsWith(r.prefix))
  if (!match) return true // sem match = permitido a todos
  return match.roles.includes(role)
}`}</Code>
          </>
        ),
      },
      {
        id: 'dashboards',
        title: 'Dashboards por perfil',
        content: (
          <>
            <DocTable
              headers={['Role', 'Componente', 'Foco']}
              rows={[
                ['admin, financeiro', 'DashboardFinanceiro', 'KPIs, Fila SLA, Liberações, Aging'],
                ['consultor', 'DashboardConsultor', 'Carteira, cobranças urgentes, intenções'],
                ['caixa', 'DashboardCaixa', 'Liberações pendentes, parcelas do dia, saldo'],
              ]}
            />
            <Code>{`
if (user.role === 'consultor') return <DashboardConsultor />
if (user.role === 'caixa')    return <DashboardCaixa />
return <DashboardFinanceiro />`}</Code>
          </>
        ),
      },
      {
        id: 'componentes-doc',
        title: 'Componentes reutilizáveis',
        content: (
          <>
            <H3>Portal do cliente</H3>
            <DocTable
              headers={['Componente', 'Arquivo', 'Descrição']}
              rows={[
                ['MoneyDisplay', 'portal/money-display.tsx', 'Valor monetário formatado'],
                ['ProgressBar', 'portal/progress-bar.tsx', 'Progresso das parcelas'],
                ['StatusBadge', 'portal/status-badges.tsx', 'Badge por status'],
                ['SkeletonCard', 'portal/skeleton-card.tsx', 'Skeleton de carregamento'],
                ['PixCopyButton', 'portal/pix-copy-button.tsx', 'Copia-e-cola com feedback'],
                ['ScoreIndicator', 'portal/score-indicator.tsx', 'Indicador visual de score'],
              ]}
            />
            <H3>Negócio</H3>
            <DocTable
              headers={['Componente', 'Descrição']}
              rows={[
                ['SimuladorReparcelamento', 'Simulação inline com Decimal.js'],
                ['ScoreRiscoCard', 'Score + histórico de fatores de risco'],
                ['EmailPreview', 'Preview do template com variáveis substituídas'],
                ['AceiteDigital', 'Assinatura do contrato no portal'],
                ['LiberacaoCapital', 'Confirmação de entrega do capital (caixa)'],
              ]}
            />
          </>
        ),
      },
    ],
  },

  {
    id: 'fluxos',
    title: 'Fluxos de Negócio',
    items: [
      {
        id: 'fluxo-emprestimo',
        title: 'Ciclo completo de empréstimo',
        content: (
          <Ol
            items={[
              'Consultor cadastra o cliente (foto, RG, comprovante de residência)',
              'Consultor cria Intenção de Empréstimo com valor e parcelas desejadas',
              'Financeiro analisa em até 24h (SLA) — aprova com termos finais ou rejeita com motivo',
              <>Sistema gera o contrato (<code className="font-mono text-emerald-600 dark:text-emerald-400">status: aguardando_aceite</code>) e notifica o cliente por e-mail</>,
              'Cliente assina digitalmente no portal em até 7 dias (SLA configurável)',
              <>Contrato muda para <code className="font-mono text-emerald-600 dark:text-emerald-400">aguardando_liberacao</code></>,
              'Caixa confirma a entrega do capital — saída registrada automaticamente no caixa',
              <>Contrato ativa (<code className="font-mono text-emerald-600 dark:text-emerald-400">ativo</code>), datas das parcelas reajustadas a partir da entrega</>,
              'Sistema envia cobranças automáticas X dias antes de cada vencimento',
              'Caixa registra pagamentos — split no caixa (entrada por parcela)',
              <>Após última parcela paga → contrato <code className="font-mono text-emerald-600 dark:text-emerald-400">quitado</code>, score recalculado</>,
            ]}
          />
        ),
      },
      {
        id: 'fluxo-reparcelamento',
        title: 'Fluxo de reparcelamento',
        content: (
          <Ol
            items={[
              'Consultor ou cliente via portal cria a solicitação',
              'Financeiro analisa saldo devedor + encargos e propõe novos termos',
              'Se acima do limite configurável → 2ª instância de aprovação',
              'Cliente recebe proposta no portal e aceita ou recusa digitalmente',
              <>Ao executar (<code className="font-mono text-emerald-600 dark:text-emerald-400">PATCH /:id/executar</code>): cancela loan original + parcelas não pagas → cria novo loan com origemLoanId + reparcelamentoCount+1 → gera aceiteClienteHash SHA-256 → recalcula score (fire-and-forget)</>,
            ]}
          />
        ),
      },
      {
        id: 'fluxo-portal',
        title: 'Fluxo do portal do cliente',
        content: (
          <Ol
            items={[
              <>Intenção aprovada → job BullMQ <code className="font-mono text-emerald-600 dark:text-emerald-400">activate-portal</code> cria usuário Supabase</>,
              'Cliente recebe e-mail com link e senha temporária',
              'Primeiro acesso → troca de senha obrigatória',
              'Até o 5º login para configurar MFA (Google Authenticator)',
              'Acessa contratos, parcelas e histórico de pagamentos',
              'Paga com PIX: gera QR Code → Mercado Pago → webhook → parcela atualizada automaticamente',
              'Pode solicitar reparcelamento diretamente pelo portal',
              'Abre chamados de suporte (respondidos pelos operadores internos)',
            ]}
          />
        ),
      },
      {
        id: 'fluxo-inadimplencia',
        title: 'Inadimplência e encargos',
        content: (
          <>
            <P>
              O cron <code className="font-mono text-emerald-600 dark:text-emerald-400">markOverdue</code> (08h) marca parcelas
              vencidas. O cron{' '}
              <code className="font-mono text-emerald-600 dark:text-emerald-400">atualizarEncargos</code> (00h) recalcula mora
              sobre saldos devedores.
            </P>
            <DocTable
              headers={['Campo', 'Comportamento']}
              rows={[
                ['multa', 'Percentual aplicado uma única vez no 1º dia de atraso'],
                ['mora diária', 'Percentual aplicado por dia sobre o saldo devedor'],
                ['saldoDevedor', 'Acumulado em pagamentos parciais — mora incide sobre ele'],
                ['moraAcumulada', 'Recalculada diariamente pelo cron atualizarEncargos'],
                ['score', 'Recalculado após markOverdue (fire-and-forget, nunca propaga erro)'],
              ]}
            />
          </>
        ),
      },
    ],
  },

  {
    id: 'integracoes',
    title: 'Integrações',
    items: [
      {
        id: 'mercado-pago',
        title: 'Mercado Pago (PIX)',
        content: (
          <>
            <P>
              Geração de QR Code via SDK oficial. Configurar{' '}
              <code className="font-mono text-emerald-600 dark:text-emerald-400">MP_ACCESS_TOKEN</code> com o token de produção.
            </P>
            <Code>{`
// Configurar webhook no painel do Mercado Pago:
// URL: https://financeiro.lidera.app.br/api/webhook/mp
// Eventos: payment.created, payment.updated

// QR Code válido por 24h
// Webhook → job confirm-mp-payment → marca parcela como paga
// Idempotente: verifica mercadoPagoId antes de registrar`}</Code>
          </>
        ),
      },
      {
        id: 'evolution-api',
        title: 'Evolution API (WhatsApp)',
        content: (
          <DocTable
            headers={['Variável', 'Descrição']}
            rows={[
              ['WHATSAPP_API_URL', 'URL da instância Evolution API'],
              ['WHATSAPP_API_KEY', 'Chave de autenticação'],
              ['WHATSAPP_INSTANCE', 'Nome da instância configurada no painel'],
            ]}
          />
        ),
      },
      {
        id: 'supabase-realtime-int',
        title: 'Supabase Realtime',
        content: (
          <>
            <DocTable
              headers={['Tabela', 'Evento', 'Consumidor']}
              rows={[
                ['mensagens', 'INSERT', 'useConversaRealtime — chat interno'],
                ['solicitacoes_reparcelamento', 'UPDATE', 'Dashboard financeiro'],
                ['installments', 'UPDATE', 'Portal do cliente'],
                ['payments', 'INSERT', 'Dashboard caixa'],
                ['transactions', 'INSERT', 'Saldo em tempo real'],
              ]}
            />
            <Code>{`
// Habilitar no SQL Editor do Supabase
ALTER PUBLICATION supabase_realtime ADD TABLE mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE installments;
// ... demais tabelas`}</Code>
          </>
        ),
      },
      {
        id: 'smtp-int',
        title: 'SMTP (e-mail)',
        content: (
          <P>
            Servidor padrão:{' '}
            <code className="font-mono text-emerald-600 dark:text-emerald-400">smtp.hostinger.com:465 (SSL)</code>. Remetente:{' '}
            <code className="font-mono text-emerald-600 dark:text-emerald-400">nao-responder@siafi.lidera.srv.br</code>. Templates
            editáveis pelo admin em Configurações → Templates de E-mail. Dispatch via BullMQ
            (job <code className="font-mono text-emerald-600 dark:text-emerald-400">send-email</code>) com retentativas automáticas.
          </P>
        ),
      },
    ],
  },

  {
    id: 'deploy',
    title: 'Deploy e Operações',
    items: [
      {
        id: 'build-deploy',
        title: 'Build e deploy',
        content: (
          <>
            <H3>Backend</H3>
            <Code>{`
sc.exe stop SIAFI-API
cd D:\\LIDERA\\SIAFI\\backend && npm run build
sc.exe start SIAFI-API`}</Code>
            <H3>Frontend</H3>
            <Code>{`
sc.exe stop SIAFI-WEB
cd D:\\LIDERA\\SIAFI\\frontend && npm run build
sc.exe start SIAFI-WEB`}</Code>
            <P>
              Após alterações no schema Prisma, rodar{' '}
              <code className="font-mono text-emerald-600 dark:text-emerald-400">npx prisma migrate deploy</code> antes de
              iniciar o backend.
            </P>
          </>
        ),
      },
      {
        id: 'nginx-doc',
        title: 'Nginx',
        content: (
          <DocTable
            headers={['Path', 'Proxy para']}
            rows={[
              ['/api/*', 'http://localhost:4010 (backend NestJS)'],
              ['/admin/queues', 'http://localhost:4010/admin/queues (BullBoard)'],
              ['/* (resto)', 'http://localhost:4011 (frontend Next.js)'],
            ]}
          />
        ),
      },
      {
        id: 'migrations-ops',
        title: 'Migrations (Prisma)',
        content: (
          <>
            <Code>{`
# Verificar estado antes de qualquer operação
npx prisma migrate status

# Produção — nunca usar migrate reset
npx prisma migrate deploy

# Desenvolvimento
npx prisma migrate dev --name YYYYMMDD_descricao_curta`}</Code>
            <P>
              Usar sempre <code className="font-mono text-emerald-600 dark:text-emerald-400">directUrl</code> (porta 5432) para
              migrations — nunca o pooler.
            </P>
          </>
        ),
      },
      {
        id: 'bullboard',
        title: 'BullBoard (monitoramento)',
        content: (
          <P>
            Disponível em{' '}
            <code className="font-mono text-emerald-600 dark:text-emerald-400">
              https://financeiro.lidera.app.br/admin/queues
            </code>
            . Exibe jobs pendentes, ativos, completados e com falha das filas{' '}
            <code className="font-mono text-emerald-600 dark:text-emerald-400">notif-queue</code> e{' '}
            <code className="font-mono text-emerald-600 dark:text-emerald-400">payment-queue</code>. Protegido por autenticação —
            acessível apenas por admin.
          </P>
        ),
      },
    ],
  },
]

// ─── Flat index for search ────────────────────────────────────────────────────

const ALL_ITEMS = DOCS.flatMap((section) =>
  section.items.map((item) => ({
    ...item,
    sectionId: section.id,
    sectionTitle: section.title,
  }))
)

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DocumentacaoPage() {
  const { user } = useAuth()
  const [activeId, setActiveId] = useState('arquitetura')
  const [search, setSearch] = useState('')
  const [downloading, setDownloading] = useState(false)

  async function handleDownloadManual() {
    setDownloading(true)
    try {
      const res = await api.get('/export/manual-sistema', { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }))
      a.download = `manual-siafi-${hojeISODate()}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setDownloading(false)
    }
  }

  if (user && user.role !== 'admin') {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Lock className="size-8" />
        <p className="text-sm">Acesso restrito a administradores.</p>
      </div>
    )
  }

  const filteredItems = search.trim()
    ? ALL_ITEMS.filter((item) =>
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.sectionTitle.toLowerCase().includes(search.toLowerCase())
      )
    : null

  const activeItem = ALL_ITEMS.find((i) => i.id === activeId)
  const activeSectionTitle =
    DOCS.find((s) => s.items.some((i) => i.id === activeId))?.title ?? ''

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3">
        {/* Download manual */}
        <button
          onClick={handleDownloadManual}
          disabled={downloading}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-600/20 disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileDown className="size-3.5" />
          )}
          {downloading ? 'Gerando PDF...' : 'Baixar Manual do Sistema'}
        </button>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tópico..."
            className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {filteredItems ? (
          <div className="space-y-0.5">
            {filteredItems.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">Nenhum resultado.</p>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveId(item.id)
                    setSearch('')
                  }}
                  className="w-full rounded-md px-2 py-2 text-left hover:bg-accent"
                >
                  <span className="block text-xs text-muted-foreground">{item.sectionTitle}</span>
                  <span className="text-sm text-foreground">{item.title}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <nav className="space-y-5">
            {DOCS.map((section) => (
              <div key={section.id}>
                <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveId(item.id)}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                        activeId === item.id
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          'size-3 shrink-0 transition-transform',
                          activeId === item.id && 'rotate-90'
                        )}
                      />
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        )}
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto p-8">
        {activeItem ? (
          <>
            {/* Breadcrumb */}
            <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <span>Documentação</span>
              <ChevronRight className="size-3" />
              <span>{activeSectionTitle}</span>
              <ChevronRight className="size-3" />
              <span className="text-foreground">{activeItem.title}</span>
            </div>

            <h1 className="mb-6 text-2xl font-bold text-foreground">{activeItem.title}</h1>

            <div>{activeItem.content}</div>
          </>
        ) : (
          <p className="text-muted-foreground">Selecione um tópico na barra lateral.</p>
        )}
      </main>
    </div>
  )
}
