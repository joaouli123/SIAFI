-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "referencia1_nome" VARCHAR(150),
ADD COLUMN     "referencia1_telefone" VARCHAR(30),
ADD COLUMN     "referencia1_vinculo" VARCHAR(50),
ADD COLUMN     "referencia2_nome" VARCHAR(150),
ADD COLUMN     "referencia2_telefone" VARCHAR(30),
ADD COLUMN     "referencia2_vinculo" VARCHAR(50);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "conta_destino" VARCHAR(150);

-- CreateTable
CREATE TABLE "avalistas" (
    "id" SERIAL NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "cliente_id" INTEGER,
    "nome" VARCHAR(150) NOT NULL,
    "cpf" VARCHAR(20),
    "telefone" VARCHAR(30),
    "email" VARCHAR(150),
    "endereco" VARCHAR(255),
    "parentesco" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avalistas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avalistas_loan_id_idx" ON "avalistas"("loan_id");

-- CreateIndex
CREATE INDEX "avalistas_cliente_id_idx" ON "avalistas"("cliente_id");

-- AddForeignKey
ALTER TABLE "avalistas" ADD CONSTRAINT "avalistas_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avalistas" ADD CONSTRAINT "avalistas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
