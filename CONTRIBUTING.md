# Guia de Contribuição — SIAFI 2.0

Bem-vindo(a) ao SIAFI. Este guia descreve como trabalhar no repositório de forma segura,
já que a branch `main` reflete o que está **em produção** em https://siafi.app.br.

---

## 1. Ambiente local

```powershell
git clone https://github.com/lideratecnologiaegestao/SIAFI.git
cd SIAFI

# Backend (NestJS :4010)
cd backend
copy .env.example .env       # peça os valores reais ao responsável (canal privado)
npm install
npx prisma generate
npm run start:dev

# Frontend (Next.js :4011) — outro terminal
cd ../frontend
copy .env.example .env.local
npm install
npm run dev
```

- Banco: **PostgreSQL via Supabase** (não é MySQL). Ver `backend/.env.example`.
- Nunca rode migrações destrutivas contra o banco de produção.
- Detalhes de arquitetura, módulos e regras: [CLAUDE.md](CLAUDE.md).

---

## 2. Fluxo de trabalho (Git)

1. **Nunca commite direto na `main`.** Ela é protegida e representa produção.
2. Crie uma branch por tarefa, a partir da `main` atualizada:
   ```bash
   git checkout main && git pull
   git checkout -b feat/nome-curto      # ou fix/... , chore/... , docs/...
   ```
3. Faça commits pequenos e descritivos (ver seção 4).
4. Suba a branch e **abra um Pull Request** para `main`:
   ```bash
   git push -u origin feat/nome-curto
   ```
5. Relacione a Issue no PR: escreva `Closes #NN` na descrição.
6. Aguarde **revisão e aprovação** antes do merge. Não faça merge sem review.
7. Após o merge, delete a branch.

### Convenção de nomes de branch
| Prefixo | Uso |
|---------|-----|
| `feat/` | nova funcionalidade |
| `fix/` | correção de bug |
| `chore/` | manutenção, deps, config |
| `docs/` | documentação |
| `refactor/` | refatoração sem mudança de comportamento |

---

## 3. Segurança — NUNCA commitar segredos

- Arquivos `.env`, `.env.local`, `.env.production` e **backups** (`.env.bkp*`, `.env.local.bak`)
  estão no `.gitignore` — não force o add deles.
- Chaves (Supabase `service_role`, JWT, Mercado Pago, SMTP) só trafegam por canal privado.
- O **GitHub Push Protection** está ativo e bloqueia pushes com segredos detectados.
  Se for bloqueado, **remova o segredo do commit** (não use o link de "allow").

---

## 4. Padrões de código

Ver [CLAUDE.md](CLAUDE.md) para as convenções completas. Pontos que já causaram bugs:

- **Formulários:** `zodResolver(schema) as any` (incompatibilidade Zod v4 + react-hook-form).
- **Downloads autenticados:** sempre `api.get(url, { responseType: 'blob' })`, nunca `<a href="/api/...">`.
- **Score de risco:** sempre fire-and-forget — `void this.scoreRisco.recalcularScore(clientId)`.
- **NestJS:** rotas estáticas antes de `:id` (ex.: `/badge` antes de `/conversas/:id`).
- **Supabase Realtime:** cast `'postgres_changes' as any`.
- **Cálculos financeiros:** `decimal.js` (`safeDecimal()`), nunca `Math.round()`.
- Rotas do app sempre em **português** (`/clientes`, `/emprestimos`).

### Build antes do PR
```powershell
cd backend  && npm run build
cd frontend && npm run build
```

---

## 5. Issues

- Uma Issue por tarefa. Use os templates (`.github/ISSUE_TEMPLATE/`).
- Labels sugeridas: `bug`, `feature`, `infra`, `security`, `verificacao`.
- Pendências abertas listadas em [docs/PENDENCIAS.md](docs/PENDENCIAS.md).

---

## 6. Deploy (apenas mantenedores)

O deploy é manual no servidor Windows após merge na `main`:

```powershell
# Backend
sc.exe stop SIAFI-API
cd d:\Sistemas\SIAFI\CLIENTE-001\backend; git pull; npm run build
sc.exe start SIAFI-API

# Frontend
sc.exe stop SIAFI-WEB
cd d:\Sistemas\SIAFI\CLIENTE-001\frontend; git pull; npm run build
sc.exe start SIAFI-WEB
```
