-- Remove campos legados de multa/mora (substituídos por multa_percentual + mora_diaria_percentual
-- com fallback nas settings). Cálculo de encargos unificado em InstallmentsService.calcEncargos.
ALTER TABLE "loans" DROP COLUMN "taxa_mora",
DROP COLUMN "taxa_multa";
