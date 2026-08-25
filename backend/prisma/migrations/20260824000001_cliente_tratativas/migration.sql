-- Log append-only das tratativas do consultor com o cliente.
CREATE TABLE IF NOT EXISTS "cliente_tratativas" (
  "id"         SERIAL       NOT NULL,
  "client_id"  INTEGER      NOT NULL,
  "user_id"    INTEGER      NOT NULL,
  "canal"      VARCHAR(20)  NOT NULL,
  "descricao"  TEXT         NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cliente_tratativas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cliente_tratativas_client_id_created_at_idx"
  ON "cliente_tratativas" ("client_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cliente_tratativas_client_id_fkey'
  ) THEN
    ALTER TABLE "cliente_tratativas"
      ADD CONSTRAINT "cliente_tratativas_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cliente_tratativas_user_id_fkey'
  ) THEN
    ALTER TABLE "cliente_tratativas"
      ADD CONSTRAINT "cliente_tratativas_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
