-- Comissão do consultor por contrato: % sobre o lucro (netGain) de cada parcela.
ALTER TABLE "loans" ADD COLUMN     "comissao_percentual" DECIMAL(5,2);
