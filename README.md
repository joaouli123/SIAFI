# SIAFI 2.0 — Sistema Integrado de Apoio Financeiro

> Plataforma moderna de gestão de empréstimos e financeiro da **Lidera**.

- **URL Produção:** https://siafi.app.br
- **Portal do Cliente:** https://siafi.app.br/portal
- **Repositório:** https://github.com/lideratecnologiaegestao/SIAFI
- **Backend API (local):** http://localhost:4010/api
- **Frontend (local):** http://localhost:4011

> O domínio anterior `financeiro.lidera.app.br` foi substituído por `siafi.app.br`.
> Serviços auxiliares seguem o mesmo padrão: `evolution.siafi.app.br`, `files.siafi.app.br`, etc.
> (os hosts `*.lidera.app.br` permanecem como alias no Nginx).

---

## Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Backend | NestJS + TypeScript + Prisma | 10 / 5 / 5 |
| Frontend | Next.js (App Router) + Tailwind CSS + shadcn/ui | 16 / 4 |
| Banco | **PostgreSQL via Supabase** (região `sa-east-1`) — schema `siafi_v2` | 15+ |
| Auth | **Supabase Auth (GoTrue)** + JWT local (15min) + Refresh (7d) | — |
| Realtime | Supabase Realtime (`postgres_changes`) — chat interno | — |
| Filas | BullMQ + Redis — notificações assíncronas e jobs | — |
| Deploy | NSSM (Windows Service) + Nginx 1.28 + Windows Server 2022 + SSL Let's Encrypt | — |

> ⚠️ O banco **não é MySQL** (era, antes da migração para Supabase). Conexões usam
> `DATABASE_URL` (Transaction Pooler, runtime) e `DIRECT_URL` (Session Pooler, migrações).

---

## Estrutura do Projeto

```
d:\Sistemas\SIAFI\CLIENTE-001\
├── CLAUDE.md      ← Contexto técnico completo e atualizado (leia primeiro)
├── README.md      ← Este arquivo
├── HANDOFF.md     ← Notas de handoff entre sessões
├── docs/          ← Documentação técnica (arquitetura, backend, frontend, DB, manual)
├── backend/       ← NestJS :4010 (src/modules/ — 21 módulos · prisma/schema.prisma)
└── frontend/      ← Next.js :4011 (src/app — 35+ páginas)
```

> **Fonte da verdade técnica:** [CLAUDE.md](CLAUDE.md) contém a lista completa e atualizada
> de módulos, endpoints, rotas, regras de negócio e estado do sistema.

---

## Iniciar / Parar Serviços (NSSM)

| Serviço | Início | Porta |
|---------|--------|-------|
| SIAFI-API | Automático | 4010 |
| SIAFI-WEB | Automático | 4011 |
| SIAFI-API-DEV | Manual | 4010 |
| SIAFI-WEB-DEV | Manual | 4011 |

```powershell
# Status
sc.exe query SIAFI-API; sc.exe query SIAFI-WEB

# Produção
sc.exe start SIAFI-API; sc.exe start SIAFI-WEB
sc.exe stop  SIAFI-API; sc.exe stop  SIAFI-WEB

# Logs em tempo real
Get-Content d:\Sistemas\SIAFI\CLIENTE-001\logs\api-out.log -Tail 50 -Wait
Get-Content d:\Sistemas\SIAFI\CLIENTE-001\logs\web-out.log -Tail 50 -Wait
```

---

## Desenvolvimento Local (onboarding)

```powershell
# 1. Clonar
git clone https://github.com/lideratecnologiaegestao/SIAFI.git
cd SIAFI

# 2. Backend
cd backend
copy .env.example .env          # preencher variáveis (ver seção abaixo)
npm install
npx prisma generate
npm run start:dev               # http://localhost:4010

# 3. Frontend (outro terminal)
cd ../frontend
copy .env.example .env.local    # NEXT_PUBLIC_API_URL, chaves Supabase públicas
npm install
npm run dev                     # http://localhost:4011
```

> Os arquivos `.env` **não são versionados** (só os `.env.example`). Solicite os valores
> reais de produção/dev ao responsável antes de rodar contra o banco real.

---

## Deploy após Alterações de Código

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

> **Migrações Prisma:** o banco usa workflow `db push` / `db execute` (não há histórico
> `migrate` aplicado). Para mudanças de schema, gerar SQL com `prisma migrate diff` e
> aplicar com `prisma db execute --file ...`. `prisma migrate dev` **falha** (o shadow DB
> tenta usar o schema `auth` do Supabase). Detalhes em [CLAUDE.md](CLAUDE.md).

---

## Módulos e Rotas

O sistema tem **21 módulos** no backend e **35+ páginas** no frontend. A tabela completa
(módulos, endpoints, roles e rotas) é mantida em [CLAUDE.md](CLAUDE.md). Resumo:

- **Core financeiro:** clientes, empréstimos, parcelas, pagamentos, caixa, PIX/Mercado Pago,
  renegociações, conciliação, relatórios (incl. Central de Relatórios em múltiplos formatos).
- **Avançados:** score de risco, intenções de empréstimo, reparcelamento, chat interno
  (Supabase Realtime), portal do cliente, módulo consultor, LGPD, auditoria.
- **Ciclo de vida do contrato:** SLA de aceite digital, liberação manual de capital,
  pagamentos parciais, avalistas/referências, edição de contrato, descontos e comissão do consultor.

---

## Estrutura de Permissões (roles)

| Role | Acesso |
|------|--------|
| `admin` | Acesso total ao sistema |
| `financeiro` | Operacional completo (sem gestão de usuários) |
| `caixa` | Clientes (leitura) + Pagamentos + Caixa |
| `consultor` | Carteira, solicitações, intenções, cobranças, reparcelamentos |
| `usuario` | Apenas Dashboard |
| `cliente` | Apenas Portal do Cliente (`/api/portal`) |

---

## Variáveis de Ambiente

Template completo em [backend/.env.example](backend/.env.example). Arquivo real: `backend/.env` (não versionado).

```env
NODE_ENV=production
PORT=4010
APP_URL=https://siafi.app.br
FRONTEND_URL=https://siafi.app.br,http://localhost:4011

# Banco (Supabase PostgreSQL)
DATABASE_URL="postgresql://postgres.PROJECT_REF:SENHA@aws-X-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.PROJECT_REF:SENHA@aws-X-sa-east-1.pooler.supabase.com:5432/postgres"

# Supabase
SUPABASE_URL="https://PROJECT_REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."   # NUNCA expor no frontend

# JWT (legado — mantido para compatibilidade)
JWT_SECRET=...        JWT_REFRESH_SECRET=...

# Mercado Pago · WhatsApp (Evolution) · SMTP · Redis (BullMQ)
MP_ACCESS_TOKEN=...   MP_WEBHOOK_SECRET=...
EVOLUTION_API_URL=https://evolution.siafi.app.br   EVOLUTION_API_KEY=...   EVOLUTION_INSTANCE=lidera
MAIL_HOST=...  MAIL_PORT=...  MAIL_USER=...  MAIL_PASS=...
REDIS_HOST=...  REDIS_PORT=6379  REDIS_PASSWORD=...  REDIS_TLS=true
```

> ⚠️ **Nunca commitar arquivos `.env` ou backups (`.env.bkp*`, `.env.local.bak`)** —
> o `.gitignore` já cobre todas as variantes. O GitHub Push Protection bloqueia segredos.

---

## Nginx

Config **viva** de produção: `C:\nginx\conf\sites\siafi.conf` (`server_name siafi.app.br www.siafi.app.br`).
Faz proxy: `/api/` → `127.0.0.1:4010`, demais rotas → `127.0.0.1:4011`.

```powershell
C:\nginx\nginx.exe -t                 # testar configuração
C:\nginx\nginx.exe -s reload          # recarregar sem derrubar
```

> A cópia [nginx/siafi.conf](nginx/siafi.conf) no repositório é histórica e pode estar
> desatualizada — a config efetiva é a de `C:\nginx\conf\sites\`.

---

## Documentação Técnica

| Arquivo | Conteúdo |
|---------|---------|
| [CLAUDE.md](CLAUDE.md) | **Contexto completo e atualizado** (módulos, endpoints, regras) |
| [HANDOFF.md](HANDOFF.md) | Notas de handoff e pendências entre sessões |
| [docs/01_ARQUITETURA.md](docs/01_ARQUITETURA.md) | Decisões de arquitetura e fluxo de requisição |
| [docs/02_BACKEND.md](docs/02_BACKEND.md) | Guia do backend NestJS |
| [docs/03_FRONTEND.md](docs/03_FRONTEND.md) | Guia do frontend Next.js |
| [docs/04_DATABASE.md](docs/04_DATABASE.md) | Schema do banco e migrações |
| [docs/05_MANUAL_USUARIO.md](docs/05_MANUAL_USUARIO.md) | Manual do operador |
| [docs/06_APRESENTACAO.md](docs/06_APRESENTACAO.md) | Apresentação executiva |

---

## Contribuição / Fluxo Git (para novos desenvolvedores)

- `main` é a branch de produção — **não commitar direto nela**.
- Criar uma branch por tarefa: `fix/...`, `feat/...` ou `chore/...`.
- Abrir **Pull Request** para `main`; aguardar revisão antes do merge.
- As pendências abertas ficam em **Issues** no GitHub.
- Nunca versionar segredos (`.env*`), `node_modules/`, `dist/`, `.next/`.

---

*Última atualização: 2026-07-01*
