-- Comissao do administrador por contrato, configuravel pelo administrador.
ALTER TABLE "loans"
  ADD COLUMN IF NOT EXISTS "comissao_administrador_percentual" DECIMAL(5,2);
