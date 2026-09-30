-- Periodicidade dos vencimentos: mensal (padrao, comportamento atual), quinzenal (15 dias) ou semanal (7 dias).
ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "periodicidade" VARCHAR(10) NOT NULL DEFAULT 'mensal';
ALTER TABLE "renegociacoes" ADD COLUMN IF NOT EXISTS "periodicidade" VARCHAR(10) NOT NULL DEFAULT 'mensal';
ALTER TABLE "solicitacoes_reparcelamento" ADD COLUMN IF NOT EXISTS "nova_periodicidade" VARCHAR(10);
