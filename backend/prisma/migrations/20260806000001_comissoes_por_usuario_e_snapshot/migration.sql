ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "comissao_percentual" DECIMAL(5,2);

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "comissao_percentual" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "comissao_administrador_percentual" DECIMAL(5,2);

-- Congela os recebimentos já existentes com a regra que estava no contrato.
-- Assim, uma alteração posterior do contrato não muda o histórico.
UPDATE "payments" p
SET
  "comissao_percentual" = l."comissao_percentual",
  "comissao_administrador_percentual" = l."comissao_administrador_percentual"
FROM "installments" i
JOIN "loans" l ON l."id" = i."loan_id"
WHERE p."installment_id" = i."id"
  AND p."comissao_percentual" IS NULL
  AND p."comissao_administrador_percentual" IS NULL;
