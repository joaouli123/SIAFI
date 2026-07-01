-- Descontos: na baixa da parcela (Payment) e na quitação total do contrato (Loan).
ALTER TABLE "loans" ADD COLUMN     "desconto_quitacao_percentual" DECIMAL(5,2);

ALTER TABLE "payments" ADD COLUMN     "desconto" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "desconto_motivo" TEXT,
ADD COLUMN     "desconto_tipo" VARCHAR(20);
