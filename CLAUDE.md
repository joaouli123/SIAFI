# SIAFI 2.0 — Sistema Integrado de Apoio Financeiro
## Contexto para Claude Code (Sessão Persistente)

> **Este arquivo é lido automaticamente em toda sessão. Contém o contexto completo do sistema 2.0.**

---

## Identidade do Sistema

| Campo | Valor |
|-------|-------|
| **Nome** | SIAFI — Sistema Integrado de Apoio Financeiro |
| **Versão** | 2.0 (NestJS + Next.js) |
| **URL Produção** | https://2wm.siafi.app.br (apex/www redirecionam p/ lideratecnologia.com.br) |
| **Empresa** | Lidera |
| **Email** | lideraabrange@gmail.com |
| **Servidor** | Windows Server 2022 + Nginx 1.28.0 |
| **Sistema Legado** | D:\LIDERA\FINANCEIRO\ (PHP 8+, em manutenção) |

---

## Stack Tecnológico (SIAFI 2.0)

```
Backend:   NestJS 10 · TypeScript 5 · Prisma 5 · PostgreSQL via Supabase (sa-east-1)
Frontend:  Next.js 16 (App Router) · TypeScript 5 · Tailwind CSS 4 · shadcn/ui
Auth:      Supabase Auth (GoTrue) + JWT local  [MIGRAÇÃO CONCLUÍDA]
Realtime:  Supabase Realtime (postgres_changes) — chat de mensagens internas
Filas:     BullMQ + Redis — notificações assíncronas e jobs
Portas:    Backend :4010  Frontend :4011
Deploy:    NSSM (Windows Service) · Nginx reverse proxy · SSL Let's Encrypt
Supabase:  aejlmkwqddlpxtwbtknk · https://aejlmkwqddlpxtwbtknk.supabase.co (IPv6-only; usar pooler aws-0-sa-east-1)
```

---

## Estrutura de Diretórios

```
d:\Sistemas\SIAFI\CLIENTE-001\
├── CLAUDE.md               ← Este arquivo
├── README.md               ← Documentação principal
├── docs/
│   ├── 01_ARQUITETURA.md
│   ├── 02_BACKEND.md
│   ├── 03_FRONTEND.md
│   ├── 04_DATABASE.md
│   ├── 05_MANUAL_USUARIO.md
│   └── 06_APRESENTACAO.md
├── backend/                ← NestJS :4010
│   ├── src/modules/        ← 21 módulos funcionais
│   ├── prisma/schema.prisma← Schema siafi_v2
│   └── .env                ← Variáveis de ambiente (não commitar!)
└── frontend/               ← Next.js :4011
    └── src/
        ├── app/(auth)/     ← Login, MFA
        ├── app/(dashboard)/← 35+ páginas protegidas
        ├── app/portal/     ← Portal do cliente (role=cliente)
        ├── components/ui/  ← button, input, card, badge, skeleton, select, textarea
        ├── hooks/          ← useUnreadCount, etc.
        └── lib/            ← api.ts, utils.ts, supabase/client.ts
```

---

## Módulos do Backend (21 total)

| Módulo | Endpoint base | Roles | Endpoints principais |
|--------|--------------|-------|---------------------|
| auth | /api/auth | público | POST /login, /refresh, /logout · GET /me |
| users | /api/users | admin | GET / · POST / · PATCH /:id · DELETE /:id |
| clients | /api/clients | admin,financeiro,caixa | GET /,/stats,/quitados,/:id · POST / · PATCH /:id · DELETE /:id |
| loans | /api/loans | admin,financeiro | GET /,/stats,/pendentes-liberacao,/:id · POST / · PATCH /:id (editar) · PATCH /:id/cancel,/:id/liberar-capital,/:id/reenviar-aceite |
| installments | /api/installments | admin,financeiro,caixa | GET / (lista+filtros),/overdue,/hoje,/:id,/:id/encargos |
| payments | /api/payments | admin,financeiro,caixa | GET / · POST / · DELETE /:id/estornar |
| transactions | /api/transactions | admin,financeiro,caixa | GET /,/saldo,/movimento · POST / |
| renegociacoes | /api/renegociacoes | admin,financeiro | GET /?loanId= · POST / |
| pix | /api/pix | admin,financeiro | GET /:installmentId · POST /generate |
| webhook | /api/webhook/mp | público | POST / |
| notifications | /api/notifications | admin,financeiro | GET / |
| cron | — | sistema | markOverdue(8h) · sendReminders(9h) · sendOverdue(10h) · verificarSlaIntencoes(*/2h) · lembreteReparcelamentos(11h) |
| reports | /api/reports | admin,financeiro | GET /carteira,/clientes,/movimentacao,/contratos,/faturamento |
| audit | /api/audit | admin | GET / |
| settings | /api/settings | admin | GET / · PATCH / |
| client-portal | /api/portal | cliente | GET /me,/loans,/installments · POST /tickets |
| score-risco | /api/score-risco | admin,financeiro,consultor | GET /:clientId · POST /recalcular/:clientId |
| intencao | /api/intencoes | admin,financeiro,consultor | GET /,/:id · POST / · PATCH /:id/aprovar,/rejeitar,/feedback |
| reparcelamento | /api/reparcelamentos | admin,financeiro,consultor | GET /,/:id · POST / · PATCH /:id/proposta,/aprovar,/rejeitar,/executar · POST /simular |
| mensagem | /api/mensagens | admin,financeiro,consultor,caixa | GET /badge,/conversas,/conversas/:id · POST /conversas,/conversas/:id |
| consultor | /api/consultor | consultor,admin,financeiro | GET /carteira,/carteira/:clientId,/solicitacoes,/cobrancas |

---

## Endpoints Importantes — Clientes

```
GET  /api/clients/stats     → { total, ativos, inativos, quitados, atrasados }
GET  /api/clients/quitados  → [{ id, nome, cpf }]
GET  /api/clients           → paginado com search/status
GET  /api/clients/:id       → detalhe com loans[]
POST /api/clients           → criar (multipart: foto, rg, comprovante)
PATCH /api/clients/:id      → atualizar
DELETE /api/clients/:id     → soft-delete (active: false)

GET    /api/clients/:id/tratativas        → log de tratativas (consultor só na própria carteira)
POST   /api/clients/:id/tratativas        → registrar { canal, descricao } — append-only, com autor e data
DELETE /api/clients/:id/tratativas/:tId   → remover (só o autor, ou admin/financeiro)
```

## Endpoints Importantes — Empréstimos

```
GET  /api/loans             → paginado (search, status, clientId, page, limit)
GET  /api/loans/stats       → { totalAtivos, totalQuitados, valorEmCarteira, valorRecebidoMes }
GET  /api/loans/:id         → detalhe com installments[] e client
POST /api/loans             → criar com geração automática de parcelas
                              Body: { clientId, principalAmount, targetProfit, numeroParcelas,
                                      dataInicio, dataPrimeiroVencimento?, diaVencimento?,
                                      metodoPagamento?, observacoes?,
                                      multaPercentual?, moraDiariaPercentual?, comissaoPercentual?,
                                      avalistas?: [{ clienteId?, nome, cpf?, telefone?, email?, parentesco? }],
                                      referencia1Nome?/Telefone?/Vinculo?, referencia2... }
                              dataPrimeiroVencimento define o venc. da 1ª parcela (senão: 1 mês após início)
PATCH /api/loans/:id        → EDITAR contrato (campos financeiros regeneram parcelas pendentes;
                              parcelas pagas/parciais/canceladas preservadas; auditado LOAN_UPDATED)
PATCH /api/loans/:id/cancel → cancelar (status=cancelado, parcelas→cancelado)
PATCH /api/loans/:id/liberar-capital → ativar contrato + saída no caixa
POST  /api/loans/:id/comissao → registrar pagamento de comissão ao consultor (saída no caixa)
DELETE /api/loans/:id/comissao/:pagamentoId → estornar pagamento de comissão
POST  /api/payments/quitar/:loanId → quita todas as parcelas em aberto aplicando desconto
                                      (descontoPercentual? sobrescreve loan.descontoQuitacaoPercentual)
GET   /api/loans/:id → inclui comissaoResumo { percentual, prevista, realizada, paga, saldo, status }
                       e comissaoPagamentos[] (preservados ao editar/regenerar o contrato)
```

## Endpoints Importantes — Relatórios

```
GET /api/reports/carteira       → { valorInvestido, valorTotalParcelado, valorRecebido,
                                     aReceber, totalAtivos, totalAtrasados,
                                     principalEmCarteira, faturamentoAReceber, principalARecuperar }
GET /api/reports/faturamento?mes=YYYY-MM
                                → { mes, totalRecebido, faturamentoBruto, recuperacaoCapital,
                                     comissaoConsultores, lucroLiquidoEmpresa, quantidadeParcelas,
                                     porConsultor[{ ..., comissao, lucroLiquido }] }
GET /api/reports/clientes       → lista de clientes ativos com próxima parcela
GET /api/reports/movimentacao?startDate=&endDate=
GET /api/reports/contratos?status=
```

## Central de Relatórios (matriz relatório × formato)

```
GET /api/reports/catalogo            → { relatorios[], formatos[] } (13 relatórios pré-definidos)
GET /api/reports/gerar/:key?formato=pdf|xlsx|csv|xml|txt|html&startDate=&endDate=&mes=&status=&clientId=
                                     → stream do arquivo no formato escolhido
GET /api/reports/zip?formato=&startDate=&endDate=&status=
                                     → ZIP com todos os relatórios (exceto os que exigem cliente)
```
Relatórios: carteira-contratos, aging-carteira, inadimplencia, provisao-pdd, clientes-risco,
dre-periodo, fluxo-caixa, faturamento-consultor, recebimentos-metodo, projecao-recebiveis,
renegociacoes-reparcelamentos, auditoria-operacoes, extrato-cliente (exige clientId).
Arquitetura: `ReportGeneratorService` (providers de dados → `{colunas, linhas, totais, grafico?}`) +
`ReportExportService` (motor único: PDF/HTML via PdfService/puppeteer com gráfico SVG de barras,
XLSX via exceljs, CSV/XML/TXT, ZIP via jszip).
Tela: `/relatorios/central` (matriz relatórios × formatos, filtro de período/status, seletor de
cliente para o extrato, e "Baixar tudo em ZIP").

## Endpoints Importantes — Reparcelamento

```
GET  /api/reparcelamentos        → lista (filtro por status, clientId, loanId)
POST /api/reparcelamentos        → criar solicitação (consultor/cliente via portal)
PATCH /api/reparcelamentos/:id/proposta  → financeiro envia proposta (novoValorPrincipal, etc.)
PATCH /api/reparcelamentos/:id/aprovar   → 2ª instância aprova
PATCH /api/reparcelamentos/:id/rejeitar  → rejeitar em qualquer etapa
PATCH /api/reparcelamentos/:id/executar  → executa atomicamente ($transaction):
                                            cancela loan original + parcelas não pagas →
                                            cria novo loan com origemLoanId + reparcelamentoCount+1 +
                                            aceiteClienteHash (SHA-256) → atualiza solicitação
POST /api/reparcelamentos/simular        → simulação sem gravar (retorna parcelas)
```

## Endpoints Importantes — Mensagens (Chat Interno)

```
GET  /api/mensagens/badge            → { count: number } — não-lidas (sidebar badge)
GET  /api/mensagens/conversas        → lista de conversas com naoLidas por conversa
GET  /api/mensagens/conversas/:id    → mensagens da conversa + marca ultimaLeitura = now()
POST /api/mensagens/conversas        → criar conversa direta (idempotente)
POST /api/mensagens/conversas/:id    → enviar mensagem
```

---

## Rotas do Frontend (35+ páginas)

| Rota | Roles | Descrição |
|------|-------|-----------|
| /dashboard | todos | KPIs + sub-indicadores + listas |
| /clientes | admin,financeiro,caixa | Lista + busca + paginação |
| /clientes/novo | admin,financeiro | Formulário com endereço |
| /clientes/[id] | admin,financeiro,caixa | Detalhe + contratos + score |
| /clientes/[id]/editar | admin,financeiro | Edição |
| /emprestimos | admin,financeiro | Lista + filtro + soma por status |
| /emprestimos/novo | admin,financeiro | valorParcela direto + simulador inline |
| /emprestimos/[id] | admin,financeiro,caixa | Detalhe + pagamento rápido + split de parcela |
| /parcelas | admin,financeiro,caixa | Parcelas em atraso |
| /pagamentos | admin,financeiro,caixa | Histórico + estorno |
| /pagamentos/novo | admin,financeiro,caixa | Seleção cliente→loan→parcela |
| /inadimplentes | admin,financeiro | Carteira inadimplente |
| /caixa | admin,financeiro,caixa | Saldo + transações + lançamento |
| /renegociacoes | admin,financeiro | Lista |
| /renegociacoes/nova | admin,financeiro | Formulário |
| /reparcelamentos | admin,financeiro,consultor | Lista + proposta + aprovação + execução |
| /reparcelamentos/nova | consultor,admin,financeiro | Formulário + simulador |
| /pix | admin,financeiro | Gerador QR Code PIX |
| /conciliacao | admin,financeiro | Conciliação mensal |
| /relatorios | admin,financeiro | 5 abas: carteira, clientes, movimentação, contratos, **faturamento** |
| /intencoes | admin,financeiro,consultor | Intenções de empréstimo com SLA + score |
| /solicitacoes | consultor,admin,financeiro | Solicitações do consultor |
| /cobrancas | consultor,admin,financeiro | Cobranças da carteira |
| /consultor/carteira | consultor | Carteira do consultor |
| /mensagens | admin,financeiro,consultor,caixa | Chat interno + Supabase Realtime |
| /notificacoes | admin,financeiro | Log de notificações |
| /suporte | admin,financeiro,caixa | Tickets de suporte |
| /usuarios | admin | CRUD de operadores |
| /usuarios/novo | admin | Criar operador |
| /usuarios/[id]/editar | admin | Editar operador |
| /configuracoes | admin | Parâmetros do sistema |
| /auditoria | admin | Log de auditoria |
| /portal/* | cliente | Portal do cliente (home, contratos, pagamentos, suporte, perfil) |

---

## Dashboard — Estrutura Atual

**4 cards clicáveis:**
- Clientes Ativos → /clientes
- Empréstimos Ativos → /emprestimos (sub: "A faturar" + "Capital em risco" via /reports/carteira)
- Clientes Atrasados → /inadimplentes
- Clientes Quitados (informativo)

**2 listas detalhadas:**
- Clientes Atrasados: nomes + quantidade de parcelas em atraso
- Clientes Quitados: nomes de clientes com empréstimos quitados

---

## Padrões de Desenvolvimento

### Backend
```typescript
// Controller padrão
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('endpoint')
export class MeuController {
  @Get() @Roles('admin', 'financeiro')
  findAll() { return this.service.findAll() }
}
// Rotas estáticas ANTES de /:id (ex: /badge antes de /conversas/:id)
// Score de risco: void this.scoreRisco.recalcularScore(clientId) — never propagates
// Cálculos financeiros: Decimal.js via safeDecimal() helper
// Non-null assertions (!) em campos nullable do Prisma após guard check
```

### Frontend
```typescript
// Página de lista padrão
'use client'
const { data, isLoading } = useQuery({
  queryKey: ['entidade'],
  queryFn: () => api.get('/endpoint').then(r => r.data),
})
// Mutations: useMutation + onSuccess: qc.invalidateQueries(...)
// Formulários: useForm + zodResolver(schema) as any (Zod v4 + react-hook-form)
// Dados monetários: sempre formatCurrency()
// Datas: sempre formatDate() ou formatDateTime()
// Simulações financeiras: decimal.js no cliente, nunca Math.round()
// Supabase Realtime: 'postgres_changes' as any (cast necessário)
```

### Convenções Obrigatórias
- Rotas sempre em **português** (`/clientes`, `/emprestimos`, `/pagamentos`)
- Operações destrutivas: `confirm()` antes de executar
- Validação Zod v4: usar `zodResolver(schema) as any`
- Sem comentários exceto WHY não-óbvio
- Score de risco: sempre fire-and-forget (`void`) após pagamentos/estornos/markOverdue/execução reparcelamento

---

## Serviços Windows (NSSM)

| Serviço | Início | Porta |
|---------|--------|-------|
| SIAFI-API | Automático | 4010 |
| SIAFI-WEB | Automático | 4011 |
| SIAFI-API-DEV | Manual | 4010 |
| SIAFI-WEB-DEV | Manual | 4011 |

```powershell
# Reiniciar produção (após build)
sc.exe stop SIAFI-API; Start-Sleep 2; sc.exe start SIAFI-API
sc.exe stop SIAFI-WEB; Start-Sleep 3; sc.exe start SIAFI-WEB
```

---

## Deploy após Alterações

```powershell
# Backend
sc.exe stop SIAFI-API
cd d:\Sistemas\SIAFI\CLIENTE-001\backend; npm run build
sc.exe start SIAFI-API

# Frontend
sc.exe stop SIAFI-WEB
cd d:\Sistemas\SIAFI\CLIENTE-001\frontend; npm run build
sc.exe start SIAFI-WEB
```

> Migrações Prisma: o banco usa workflow `db push`/`db execute` (não há histórico `migrate` aplicado).
> Para mudanças de schema: gerar SQL com `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel`
> e aplicar com `prisma db execute --file ...`. `prisma migrate dev` falha (shadow DB tenta usar schema `auth` do Supabase).

---

## Estado Atual (Maio 2026)

### ✅ Implementado e Funcionando

**Core financeiro:**
- Autenticação Supabase Auth + JWT (login/MFA/refresh/logout/me)
- CRUD Clientes (com upload foto/RG/comprovante)
- Empréstimos com valorParcela direto + split de parcela (principalPayback / netGain)
- Parcelas geradas automaticamente via Decimal.js
- Pagamentos com estorno
- Caixa (transações manuais)
- Carteira inadimplente
- Renegociação de dívidas
- PIX / Mercado Pago + webhook
- Relatórios: Carteira, Faturamento mensal (por consultor), Movimentação, Contratos
- Conciliação bancária
- Auditoria de ações
- Gestão de Usuários com roles

**Módulos avançados (implementados Mai/2026):**
- **Score de risco interno** — ponderado (pontualidade 50%, reparcelamentos 30%, quitações 20%); recalculado automaticamente após pagamentos, estornos e markOverdue
- **Intenções de empréstimo** — fluxo consultor→financeiro com SLA (cron a cada 2h), auto-aprovação configurável, ativação automática do portal, feedback
- **Reparcelamento** — fluxo completo: solicitação → proposta → 2ª instância → execução atômica com aceite digital (SHA-256); simulador inline; score recalculado após execução
- **Chat interno (Mensagens)** — conversas diretas + Supabase Realtime (postgres_changes INSERT); badge de não-lidas no sidebar (polling 30s + Realtime)
- **Portal do Cliente** — home, contratos, parcelas, pagamentos via PIX, suporte, perfil; campos internos (principalPayback/netGain) nunca retornados
- **Módulo Consultor** — carteira, solicitações, intenções, cobranças

**Fluxos de ciclo de vida do contrato (implementados Mai/2026):**
- **SLA de aceite** — Loan criado com `aguardando_aceite`; cliente tem N dias (configurável via `financeiro.sla_aceite_dias`) para assinar no portal; cron 07h envia alertas D-2 (cliente) e D-1 (consultor); D+0 cancela loan + parcelas + reverte IntencaoEmprestimo para `aprovado`
- **Liberação manual de capital** — após aceite digital (`aguardando_liberacao`), caixa/financeiro confirma entrega via `PATCH /loans/:id/liberar-capital`; ativa contrato, reajusta datas das parcelas, registra saída no caixa, notifica cliente; painel "Liberações pendentes" no dashboard
- **Pagamentos parciais** — status `parcialmente_pago`; `saldoDevedor` e `moraAcumulada` acumulam por dia sobre o saldo; tabela de parcelas exibe colunas Pago/Saldo/Mora; formulário de pagamento pré-preenchido com total para quitação; estorno recalcula saldo e status corretamente

**Melhorias (implementadas Jun/2026):**
- **Avalistas** — por contrato (`model Avalista`); podem referenciar um cliente existente (`clienteId`) ou ser pessoa avulsa; cadastrados em `/emprestimos/novo` e na edição
- **Referências de contato** — `referencia1/2` (nome/telefone/vínculo) por contrato
- **Edição de contrato** — `PATCH /loans/:id` + tela `/emprestimos/[id]/editar`: edita qualquer dado; campos financeiros regeneram as parcelas pendentes/atrasadas e preservam as pagas/parciais/canceladas; auditado
- **Baixa manual** — `Payment.contaDestino` (conta/banco) + data do pagamento no formulário inline e no `/pagamentos/novo`
- **`/parcelas` aba "Todas"** — `GET /installments` com filtros (status, cliente, contrato, período) + paginação
- **`dataPrimeiroVencimento`** em `/emprestimos/novo` — separa início do contrato × 1º vencimento; Valor da Parcela editável com cálculo reverso (preenche Lucro Alvo) + detalhamento Capital/Lucro
- **Descontos** — `Payment.desconto`/`descontoTipo` ('saldo' | 'encargos')/`descontoMotivo`. Desconto sobre **saldo** conta para quitar a parcela (reduz lucro/comissão; não entra no caixa); sobre **encargos** perdoa multa/mora. Quitação total: `Loan.descontoQuitacaoPercentual` (% sobre lucro a vencer) + `POST /payments/quitar/:loanId`. Exibido em /pagamentos, recibo PDF, KPI "Descontos no mês" no dashboard, DRE (linha "Descontos concedidos") e relatório **Descontos Concedidos**. `valorPago=0` permitido quando há desconto.
- **Comissão do consultor** — `Loan.comissaoPercentual` (% sobre o lucro/netGain de cada parcela), definida no contrato com entrada bidirecional valor↔% (sobre o Lucro Alvo). Apuração **realizada** com regra **capital-primeiro** (lucro da parcela = `totalPago − principalPayback`); split por baixa em `GET /payments` (`split: { capital, lucro, comissao, lucroEmpresa }`, oculto para caixa), no relatório de faturamento (comissão + lucro líquido, total e por consultor) e no resumo da carteira do consultor (`GET /consultor/relatorio` → `comissaoPrevista`/`comissaoRealizada`). Visível a admin/financeiro e ao consultor (a sua). **Mantida fora dos PDFs do cliente** (contrato/recibo) por ser informação interna.
- **Pagamento de comissão ao consultor** — `model ComissaoPagamento` (independente das parcelas; preservado ao editar/regenerar o contrato). Tela de detalhe do contrato mostra: resumo (prevista/realizada/paga/saldo + status paga/parcial/a pagar), tabela das parcelas quitadas com a parte do consultor, e lista de pagamentos com registrar/estornar (gera saída no caixa, categoria 'Comissão Consultor'). Endpoints `POST/DELETE /loans/:id/comissao`.
- **Multa/mora unificada** — fórmula ÚNICA em `common/encargos.ts` → `calcularEncargos()` (multa única sobre a parcela + mora diária, fallback `financeiro.multa_atraso_percentual`/`mora_dia_percentual`), usada por `InstallmentsService.calcEncargos`, cron `atualizarEncargos`, `getEncargos`, `markOverdue` e PIX. Campos legados `taxaMulta`/`taxaMora` **removidos** do schema.
  **Mora por trechos:** a mora corre sobre o saldo que existia em CADA período (vencimento → cada baixa → hoje). Recalcular tudo sobre o saldo atual apagava retroativamente a mora já corrida sobre o saldo maior, fazendo o total da parcela CAIR após um pagamento parcial. Por isso todo `select`/`include` que alimenta o cálculo precisa trazer `payments { dataPagamento, valorPago, estornado }`; sem eles a função cai no cálculo simples (fallback).
  **`saldoDevedor` só vale como "dívida atual com encargos" quando uma baixa o escreveu.** O schema
  aplica `@default(0)`, então parcela que nunca recebeu baixa chega ao cálculo com 0 — e em 01/08/2026
  isso fez 14 parcelas em aberto (R$ 8.696,00) valerem R$ 0,00: sumiam da carteira, o PIX sairia zerado
  e toda baixa era recusada por *"excede o total devido com encargos (0,00)"*. `calcularEncargos()` agora
  ignora o campo quando não há baixa viva ou quando ele é 0 com `totalPago` 0.
- **Datas do front (`YYYY-MM-DD`)** — sempre via `common/data.ts` → `dataLocal()`. `new Date('2026-07-27')` é lido como UTC e, em fuso negativo, cai no dia anterior. Os contêineres de produção rodam em **UTC** (`TZ` vazio), então as datas gravadas historicamente em `00:00Z` são lidas no dia correto lá — não há dado a migrar; `formatDate` no front já trata `T00:00:00.000Z` como dia UTC.

### ⚠️ Configurar em Produção
- `MP_ACCESS_TOKEN` — Mercado Pago real
- `WHATSAPP_API_URL` + `WHATSAPP_API_KEY` + `WHATSAPP_INSTANCE` — Evolution API
- ~~SMTP~~ ✅ Cloudflare Email Sending (`smtp.mx.cloudflare.net:465`, user literal `api_token`, remetente `nao-responder@siafi.app.br` — precisa ser da zona `siafi.app.br`)
- **Supabase RLS** — aplicar policies via SQL Editor (ver abaixo)

### ⚠️ Supabase RLS — Pendente de Aplicação Manual

Executar no SQL Editor do Supabase (`aejlmkwqddlpxtwbtknk`):

```sql
ALTER TABLE loans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_ver_proprios_loans" ON loans
  FOR SELECT TO authenticated
  USING (client_id = (SELECT id FROM clients WHERE supabase_id = auth.uid() LIMIT 1));

CREATE POLICY "cliente_ver_proprias_installments" ON installments
  FOR SELECT TO authenticated
  USING (loan_id IN (
    SELECT id FROM loans
    WHERE client_id = (SELECT id FROM clients WHERE supabase_id = auth.uid() LIMIT 1)
  ));
```

### 🔮 Próximas Implementações
- Geração de contratos em PDF (PdfModule já existe)
- Dashboard com gráficos (recharts) — evolução mensal, inadimplência
- Exportação de relatórios Excel/PDF
- Notificações push (PWA)

---

*Última atualização: 2026-06-01 | Mantido por: Claude Code + equipe Lidera*
