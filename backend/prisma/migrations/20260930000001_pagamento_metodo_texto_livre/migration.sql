-- Forma de pagamento da baixa vira texto livre (antes: enum PaymentMethod).
-- Os valores existentes sao preservados como texto; contratos continuam com o enum.
ALTER TABLE "payments" ALTER COLUMN "metodo_pagamento" DROP DEFAULT;
ALTER TABLE "payments" ALTER COLUMN "metodo_pagamento" TYPE VARCHAR(60) USING "metodo_pagamento"::text;
ALTER TABLE "payments" ALTER COLUMN "metodo_pagamento" SET DEFAULT 'dinheiro';
