# Pendências → Issues (SIAFI 2.0)

> Rascunho de Issues a partir do que está documentado em `HANDOFF.md` e `CLAUDE.md`.
> Cada bloco pode ser colado como uma nova Issue no GitHub. Data base: 2026-07-01.

---

## 1. [VERIFICAÇÃO] Tela branca ao expirar sessão
**Labels:** `verificacao`, `bug`

A correção foi implementada e deployada, mas **não confirmada** pelo usuário.
Testar manualmente: logar, esperar o token expirar (~15min), voltar à aba. Deve aparecer
spinner e redirecionar para `/login?redirect=/dashboard` (sem tela branca, sem loop).

Arquivos envolvidos: `frontend/src/app/(dashboard)/layout.tsx`,
`frontend/src/hooks/use-session-recovery.ts`, `frontend/src/contexts/auth.context.tsx`,
`frontend/src/app/(auth)/login/page.tsx`.

**Critério de aceite:** sessão expirada nunca deixa tela branca; redirect preserva a rota original.

---

## 2. [VERIFICAÇÃO] Geração de PDFs (Puppeteer/NSSM)
**Labels:** `verificacao`, `bug`

Testar todos os endpoints de PDF em produção (o serviço NSSM roda como usuário sem acesso
ao cache do Puppeteer):
- `/export/carteira` — Relatório de Carteira
- `/export/clientes/:id/extrato` — Extrato do Cliente
- `/export/contratos/:id/pdf` — Contrato
- `/export/pagamentos/:id/recibo` — Recibo

Se falhar: `dir "C:\Users\Administrator\.cache\puppeteer\chrome\" -Directory`, adicionar o
caminho ao array `candidatos` em `backend/src/modules/pdf/pdf.service.ts` ou setar
`PUPPETEER_EXECUTABLE_PATH` no `backend/.env`.

**Critério de aceite:** os 4 PDFs geram corretamente pelo serviço em produção.

---

## 3. [SECURITY] Aplicar Supabase RLS
**Labels:** `security`, `infra`

Aplicar as policies de Row Level Security no Supabase (`lvpseuaybpnmrneuyndi`), via SQL Editor,
para `loans` e `installments` (cliente só vê os próprios). SQL pronto em `CLAUDE.md`
(§"Supabase RLS — Pendente de Aplicação Manual").

**Critério de aceite:** RLS habilitado e policies criadas; portal do cliente continua funcionando.

---

## 4. [INFRA] Configurar segredos de produção
**Labels:** `infra`

Preencher no `backend/.env` de produção (valores reais, por canal privado):
- `MP_ACCESS_TOKEN` / `MP_WEBHOOK_SECRET` — Mercado Pago real (sair de sandbox)
- `WHATSAPP_API_URL` / `WHATSAPP_API_KEY` / `WHATSAPP_INSTANCE` (Evolution API)
- `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` — SMTP

**Critério de aceite:** PIX, WhatsApp e e-mails funcionando em produção.

---

## 5. [FEAT] Dashboard com gráficos (recharts)
**Labels:** `feature`

Evolução mensal de pagamentos e inadimplência com `recharts`. Os dados já existem em
`/api/reports/carteira` e `/api/reports/faturamento`.

**Critério de aceite:** dashboard exibe gráfico(s) de evolução mensal e inadimplência.

---

## 6. [FEAT] Geração de contratos em PDF
**Labels:** `feature`

Gerar o contrato de empréstimo em PDF (o `PdfModule` já existe). Manter dados internos
(comissão, `principalPayback`/`netGain`) **fora** do PDF do cliente.

**Critério de aceite:** contrato em PDF gerado a partir do detalhe do empréstimo.

---

## 7. [FEAT] Notificações push (PWA)
**Labels:** `feature`

Service Worker + Web Push API para notificações (lembretes de vencimento, etc.).

**Critério de aceite:** cliente/operador recebe push com opt-in.

---

## ⚠️ Revisar antes de criar (podem já estar resolvidas)

- **Multa por atraso automática** — o `HANDOFF.md` lista como pendente, mas o `CLAUDE.md`
  indica que multa/mora foi **unificada** em `InstallmentsService.calcEncargos` e aplicada
  pelo cron `atualizarEncargos`. Confirmar se ainda há algo a fazer.
- **Exportação de relatórios Excel/PDF** — a **Central de Relatórios** (`/relatorios/central`)
  já exporta PDF/XLSX/CSV/XML/TXT/HTML. Provavelmente já coberto.
