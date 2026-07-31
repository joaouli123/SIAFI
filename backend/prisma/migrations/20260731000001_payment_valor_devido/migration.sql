ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "valor_devido" DECIMAL(15, 2);
