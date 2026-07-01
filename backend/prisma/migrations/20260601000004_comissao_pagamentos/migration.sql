-- Pagamentos de comissão ao consultor (independentes das parcelas; preservados na edição).
CREATE TABLE "comissao_pagamentos" (
    "id" SERIAL NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "consultor_id" INTEGER,
    "valor" DECIMAL(15,2) NOT NULL,
    "data_pagamento" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "registrado_por" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comissao_pagamentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "comissao_pagamentos_loan_id_idx" ON "comissao_pagamentos"("loan_id");

ALTER TABLE "comissao_pagamentos" ADD CONSTRAINT "comissao_pagamentos_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
