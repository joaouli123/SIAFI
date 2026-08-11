-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'financeiro', 'consultor', 'caixa', 'cliente');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('aguardando_aceite', 'aguardando_liberacao', 'ativo', 'quitado', 'cancelado', 'inadimplente');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('pendente', 'parcialmente_pago', 'pago', 'atrasado', 'cancelado');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('dinheiro', 'pix', 'mercadopago', 'transferencia', 'cheque', 'cartao');

-- CreateEnum
CREATE TYPE "AmortizationType" AS ENUM ('simples', 'price', 'sac');

-- CreateEnum
CREATE TYPE "GenderIdentity" AS ENUM ('masculino', 'feminino', 'nao_binario', 'genero_fluido', 'agender', 'outro', 'prefiro_nao_informar');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('uso_dados', 'comunicacao_whatsapp', 'comunicacao_email', 'compartilhamento_bureaus', 'marketing');

-- CreateEnum
CREATE TYPE "ConsentAction" AS ENUM ('concedido', 'revogado');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('muito_baixo', 'baixo', 'medio', 'alto', 'muito_alto', 'sem_score');

-- CreateEnum
CREATE TYPE "DataDeletionStatus" AS ENUM ('solicitado', 'em_analise', 'anonimizado', 'rejeitado');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'caixa',
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "supabase_id" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" VARCHAR(64),
    "mfa_login_count" INTEGER NOT NULL DEFAULT 0,
    "mfa_decided_at" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "nome_social" TEXT,
    "identidade_genero" "GenderIdentity",
    "pronome" VARCHAR(30),
    "cpf" VARCHAR(255),
    "rg" VARCHAR(255),
    "data_nascimento" TIMESTAMP(3),
    "email" TEXT,
    "whatsapp" TEXT,
    "telefone" TEXT,
    "endereco" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" CHAR(2),
    "cep" TEXT,
    "foto_path" TEXT,
    "rg_path" TEXT,
    "comprovante_path" TEXT,
    "user_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notificacoes_email" BOOLEAN NOT NULL DEFAULT true,
    "notificacoes_whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "lgpd_consent_at" TIMESTAMP(3),
    "anonimizado_em" TIMESTAMP(3),
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'sem_score',
    "score_numerico" INTEGER,
    "supabase_id" TEXT,
    "portal_ativo" BOOLEAN NOT NULL DEFAULT false,
    "portal_ativado_em" TIMESTAMP(3),
    "portal_ativado_por" INTEGER,
    "senha_temporaria" BOOLEAN NOT NULL DEFAULT false,
    "primeiro_acesso" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_acesso_portal" TIMESTAMP(3),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_login_count" INTEGER NOT NULL DEFAULT 0,
    "mfa_decided_at" TIMESTAMP(3),
    "consultor_id" INTEGER,
    "termos_aceitos_em" TIMESTAMP(3),
    "termos_versao" VARCHAR(20),
    "politica_aceita_em" TIMESTAMP(3),
    "referencia1_nome" VARCHAR(150),
    "referencia1_telefone" VARCHAR(30),
    "referencia1_vinculo" VARCHAR(50),
    "referencia2_nome" VARCHAR(150),
    "referencia2_telefone" VARCHAR(30),
    "referencia2_vinculo" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultor_solicitacoes" (
    "id" SERIAL NOT NULL,
    "consultor_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "loan_id" INTEGER,
    "tipo" VARCHAR(30) NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor_solicitado" DECIMAL(10,2),
    "urgencia" VARCHAR(10) NOT NULL DEFAULT 'normal',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pendente',
    "resposta_financeiro" TEXT,
    "respondido_por" INTEGER,
    "respondido_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultor_solicitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intencoes_emprestimo" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "consultor_id" INTEGER NOT NULL,
    "valor_solicitado" DECIMAL(10,2) NOT NULL,
    "numero_parcelas" INTEGER NOT NULL,
    "finalidade" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'aguardando',
    "observacoes" TEXT,
    "aprovado_por" INTEGER,
    "aprovado_em" TIMESTAMP(3),
    "loan_id" INTEGER,
    "motivo_rejeicao" TEXT,
    "motivo_rejeicao_tipo" VARCHAR(50),
    "prazo_analise_horas" INTEGER NOT NULL DEFAULT 24,
    "prazo_expiracao_em" TIMESTAMP(3),
    "sla_notificado" BOOLEAN NOT NULL DEFAULT false,
    "sla_escalonado" BOOLEAN NOT NULL DEFAULT false,
    "feedback_enviado_em" TIMESTAMP(3),
    "feedback_enviado_por" INTEGER,
    "feedback_canal" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intencoes_emprestimo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "consultor_id" INTEGER,
    "principal_amount" DECIMAL(15,2) NOT NULL,
    "target_profit" DECIMAL(15,2) NOT NULL,
    "total_receivable" DECIMAL(15,2) NOT NULL,
    "taxa_juros" DECIMAL(8,4),
    "modo_taxa" TEXT DEFAULT 'mensal',
    "tipo_amortizacao" "AmortizationType" DEFAULT 'simples',
    "periodo_carencia" INTEGER NOT NULL DEFAULT 0,
    "comissao_percentual" DECIMAL(5,2),
    "desconto_quitacao_percentual" DECIMAL(5,2),
    "numero_parcelas" INTEGER NOT NULL,
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ativo',
    "metodo_pagamento" "PaymentMethod",
    "observacoes" TEXT,
    "origem_loan_id" INTEGER,
    "reparcelamento_count" INTEGER NOT NULL DEFAULT 0,
    "aceite_cliente_em" TIMESTAMP(3),
    "aceite_cliente_ip" VARCHAR(45),
    "aceite_cliente_hash" VARCHAR(64),
    "aceite_expira_em" TIMESTAMP(3),
    "aceite_sla_notificado" BOOLEAN NOT NULL DEFAULT false,
    "aceite_sla_consultor" BOOLEAN NOT NULL DEFAULT false,
    "liberado_por" INTEGER,
    "liberado_em" TIMESTAMP(3),
    "metodo_liberacao" VARCHAR(20),
    "multa_percentual" DECIMAL(5,4),
    "mora_diaria_percentual" DECIMAL(7,6),
    "dias_antecedencia_cobranca" INTEGER NOT NULL DEFAULT 10,
    "dia_vencimento" INTEGER,
    "cobrar_whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "cobrar_email" BOOLEAN NOT NULL DEFAULT true,
    "cobrar_portal" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "avalistas" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "cliente_vinculado_id" INTEGER,
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

-- CreateTable
CREATE TABLE "solicitacoes_reparcelamento" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "consultor_id" INTEGER,
    "tipo" VARCHAR(30) NOT NULL,
    "motivo_cliente" TEXT NOT NULL,
    "data_prevista_pagamento" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pendente',
    "novo_valor_principal" DECIMAL(10,2),
    "novo_target_profit" DECIMAL(10,2),
    "novo_numero_parcelas" INTEGER,
    "nova_data_inicio" TIMESTAMP(3),
    "multa_aplicada" DECIMAL(10,2),
    "mora_aplicada" DECIMAL(10,2),
    "observacao_financeiro" TEXT,
    "novo_loan_id" INTEGER,
    "respondido_por" INTEGER,
    "respondido_em" TIMESTAMP(3),
    "executado_por" INTEGER,
    "executado_em" TIMESTAMP(3),
    "aprovado_segunda_instancia" BOOLEAN NOT NULL DEFAULT false,
    "aprovado_segunda_instancia_por" INTEGER,
    "aprovado_segunda_instancia_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitacoes_reparcelamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores_risco" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "score_pontualidade" INTEGER NOT NULL DEFAULT 100,
    "score_reparcelamentos" INTEGER NOT NULL DEFAULT 100,
    "score_quitacoes" INTEGER NOT NULL DEFAULT 50,
    "score_geral" INTEGER NOT NULL DEFAULT 75,
    "classificacao" VARCHAR(20) NOT NULL DEFAULT 'regular',
    "total_emprestimos" INTEGER NOT NULL DEFAULT 0,
    "total_quitados" INTEGER NOT NULL DEFAULT 0,
    "total_reparcelamentos" INTEGER NOT NULL DEFAULT 0,
    "total_parcelas_atrasadas" INTEGER NOT NULL DEFAULT 0,
    "calculado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scores_risco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversas" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(255),
    "tipo" VARCHAR(30) NOT NULL DEFAULT 'direto',
    "intencao_id" INTEGER,
    "loan_id" INTEGER,
    "solicitacao_id" INTEGER,
    "client_id" INTEGER,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" SERIAL NOT NULL,
    "conversa_id" INTEGER NOT NULL,
    "remetente_id" INTEGER NOT NULL,
    "conteudo" TEXT NOT NULL,
    "tipo" VARCHAR(20) NOT NULL DEFAULT 'texto',
    "arquivo_path" VARCHAR(500),
    "arquivo_nome" VARCHAR(255),
    "arquivo_mime" VARCHAR(100),
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "lida_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversa_participantes" (
    "id" SERIAL NOT NULL,
    "conversa_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'membro',
    "silenciado" BOOLEAN NOT NULL DEFAULT false,
    "ultima_leitura" TIMESTAMP(3),
    "entrada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversa_participantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" SERIAL NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "installment_amount" DECIMAL(15,2) NOT NULL,
    "principal_payback" DECIMAL(15,2) NOT NULL,
    "net_gain" DECIMAL(15,2) NOT NULL,
    "valor_principal" DECIMAL(15,2),
    "valor_juros" DECIMAL(15,2),
    "saldo_devedor" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "mora_acumulada" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valor_multa" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valor_mora" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "data_vencimento" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'pendente',
    "total_pago" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cobranca_enviada_em" TIMESTAMP(3),
    "cobranca_whatsapp_ok" BOOLEAN NOT NULL DEFAULT false,
    "cobranca_email_ok" BOOLEAN NOT NULL DEFAULT false,
    "cobranca_portal_ok" BOOLEAN NOT NULL DEFAULT false,
    "multa_aplicada" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valor_com_encargos" DECIMAL(15,2),
    "pix_cobranca_id" INTEGER,
    "observacao" TEXT,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "installment_id" INTEGER NOT NULL,
    "valor_pago" DECIMAL(15,2) NOT NULL,
    "data_pagamento" TIMESTAMP(3) NOT NULL,
    "metodo_pagamento" "PaymentMethod" NOT NULL DEFAULT 'dinheiro',
    "observacao" TEXT,
    "conta_destino" VARCHAR(150),
    "desconto" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "desconto_tipo" VARCHAR(20),
    "desconto_motivo" TEXT,
    "estornado" BOOLEAN NOT NULL DEFAULT false,
    "estornado_em" TIMESTAMP(3),
    "estornado_por" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "user_id" INTEGER,
    "payment_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pix_payments" (
    "id" SERIAL NOT NULL,
    "installment_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "payment_id" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'pix',
    "qr_code" TEXT,
    "qr_image" TEXT,
    "barcode_content" TEXT,
    "boleto_url" VARCHAR(500),
    "amount" DECIMAL(15,2) NOT NULL,
    "valor_encargos" DECIMAL(15,2),
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "expires_at" TIMESTAMP(3),
    "sent_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pix_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mp_payments" (
    "id" SERIAL NOT NULL,
    "installment_id" INTEGER NOT NULL,
    "preference_id" TEXT,
    "payment_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "valor" DECIMAL(15,2) NOT NULL,
    "external_reference" TEXT,
    "loan_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mp_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renegociacoes" (
    "id" SERIAL NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "valor_total" DECIMAL(15,2) NOT NULL,
    "numero_parcelas" INTEGER NOT NULL,
    "taxa_juros" DECIMAL(8,4) NOT NULL,
    "tipo_amortizacao" "AmortizationType" NOT NULL DEFAULT 'simples',
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "parcelas_renegociadas_ids" JSONB,
    "valor_descontado" DECIMAL(15,2),
    "motivo_renegociacao" VARCHAR(100),
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renegociacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "loan_id" INTEGER,
    "tipo" VARCHAR(20) NOT NULL,
    "assunto" TEXT,
    "mensagem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidade_id" INTEGER,
    "dados_antes" JSONB,
    "dados_depois" JSONB,
    "dados" JSONB,
    "contexto" JSONB,
    "hash" VARCHAR(64),
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" SERIAL NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "assunto" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "resposta" TEXT,
    "lido" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobranca_contatos" (
    "id" SERIAL NOT NULL,
    "installment_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "consultor_id" INTEGER NOT NULL,
    "canal" VARCHAR(20) NOT NULL,
    "resultado" VARCHAR(50) NOT NULL,
    "prometeu_pagar_em" TIMESTAMP(3),
    "observacao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobranca_contatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_logs" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "tipo" "ConsentType" NOT NULL,
    "acao" "ConsentAction" NOT NULL,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_deletion_requests" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "motivo" TEXT,
    "status" "DataDeletionStatus" NOT NULL DEFAULT 'solicitado',
    "analisado_por" INTEGER,
    "analisado_em" TIMESTAMP(3),
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_scores" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "fonte" VARCHAR(50),
    "dados_brutos" JSONB,
    "valido_ate" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "assunto" VARCHAR(255) NOT NULL,
    "corpo" TEXT NOT NULL,
    "variaveis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consentimentos_lgpd" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "versao" VARCHAR(20) NOT NULL,
    "aceito" BOOLEAN NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consentimentos_lgpd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes_titular" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER,
    "nome_requerente" VARCHAR(200) NOT NULL,
    "email_requerente" VARCHAR(200) NOT NULL,
    "cpf_requerente" VARCHAR(14),
    "tipo" VARCHAR(50) NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'aberto',
    "resposta" TEXT,
    "respondido_em" TIMESTAMP(3),
    "respondido_por" INTEGER,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitacoes_titular_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_supabase_id_key" ON "users"("supabase_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_cpf_key" ON "clients"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "clients_user_id_key" ON "clients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_supabase_id_key" ON "clients"("supabase_id");

-- CreateIndex
CREATE INDEX "clients_nome_idx" ON "clients"("nome");

-- CreateIndex
CREATE INDEX "clients_risk_level_idx" ON "clients"("risk_level");

-- CreateIndex
CREATE INDEX "clients_consultor_id_idx" ON "clients"("consultor_id");

-- CreateIndex
CREATE INDEX "consultor_solicitacoes_consultor_id_idx" ON "consultor_solicitacoes"("consultor_id");

-- CreateIndex
CREATE INDEX "consultor_solicitacoes_client_id_idx" ON "consultor_solicitacoes"("client_id");

-- CreateIndex
CREATE INDEX "consultor_solicitacoes_status_idx" ON "consultor_solicitacoes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "intencoes_emprestimo_loan_id_key" ON "intencoes_emprestimo"("loan_id");

-- CreateIndex
CREATE INDEX "intencoes_emprestimo_consultor_id_idx" ON "intencoes_emprestimo"("consultor_id");

-- CreateIndex
CREATE INDEX "intencoes_emprestimo_status_idx" ON "intencoes_emprestimo"("status");

-- CreateIndex
CREATE INDEX "intencoes_emprestimo_prazo_expiracao_em_idx" ON "intencoes_emprestimo"("prazo_expiracao_em");

-- CreateIndex
CREATE UNIQUE INDEX "loans_origem_loan_id_key" ON "loans"("origem_loan_id");

-- CreateIndex
CREATE INDEX "loans_client_id_idx" ON "loans"("client_id");

-- CreateIndex
CREATE INDEX "loans_consultor_id_idx" ON "loans"("consultor_id");

-- CreateIndex
CREATE INDEX "loans_status_idx" ON "loans"("status");

-- CreateIndex
CREATE INDEX "comissao_pagamentos_loan_id_idx" ON "comissao_pagamentos"("loan_id");

-- CreateIndex
CREATE INDEX "avalistas_client_id_idx" ON "avalistas"("client_id");

-- CreateIndex
CREATE INDEX "avalistas_cliente_vinculado_id_idx" ON "avalistas"("cliente_vinculado_id");

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_reparcelamento_novo_loan_id_key" ON "solicitacoes_reparcelamento"("novo_loan_id");

-- CreateIndex
CREATE INDEX "solicitacoes_reparcelamento_client_id_idx" ON "solicitacoes_reparcelamento"("client_id");

-- CreateIndex
CREATE INDEX "solicitacoes_reparcelamento_loan_id_idx" ON "solicitacoes_reparcelamento"("loan_id");

-- CreateIndex
CREATE INDEX "solicitacoes_reparcelamento_status_idx" ON "solicitacoes_reparcelamento"("status");

-- CreateIndex
CREATE UNIQUE INDEX "scores_risco_client_id_key" ON "scores_risco"("client_id");

-- CreateIndex
CREATE INDEX "conversas_intencao_id_idx" ON "conversas"("intencao_id");

-- CreateIndex
CREATE INDEX "conversas_loan_id_idx" ON "conversas"("loan_id");

-- CreateIndex
CREATE INDEX "conversas_solicitacao_id_idx" ON "conversas"("solicitacao_id");

-- CreateIndex
CREATE INDEX "mensagens_conversa_id_idx" ON "mensagens"("conversa_id");

-- CreateIndex
CREATE INDEX "mensagens_remetente_id_idx" ON "mensagens"("remetente_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversa_participantes_conversa_id_user_id_key" ON "conversa_participantes"("conversa_id", "user_id");

-- CreateIndex
CREATE INDEX "installments_loan_id_idx" ON "installments"("loan_id");

-- CreateIndex
CREATE INDEX "installments_status_idx" ON "installments"("status");

-- CreateIndex
CREATE INDEX "installments_data_vencimento_idx" ON "installments"("data_vencimento");

-- CreateIndex
CREATE INDEX "payments_installment_id_idx" ON "payments"("installment_id");

-- CreateIndex
CREATE INDEX "payments_data_pagamento_idx" ON "payments"("data_pagamento");

-- CreateIndex
CREATE INDEX "transactions_data_idx" ON "transactions"("data");

-- CreateIndex
CREATE INDEX "transactions_tipo_idx" ON "transactions"("tipo");

-- CreateIndex
CREATE INDEX "pix_payments_installment_id_idx" ON "pix_payments"("installment_id");

-- CreateIndex
CREATE INDEX "pix_payments_payment_id_idx" ON "pix_payments"("payment_id");

-- CreateIndex
CREATE INDEX "pix_payments_tipo_idx" ON "pix_payments"("tipo");

-- CreateIndex
CREATE INDEX "mp_payments_installment_id_idx" ON "mp_payments"("installment_id");

-- CreateIndex
CREATE INDEX "mp_payments_external_reference_idx" ON "mp_payments"("external_reference");

-- CreateIndex
CREATE INDEX "renegociacoes_loan_id_idx" ON "renegociacoes"("loan_id");

-- CreateIndex
CREATE INDEX "notifications_client_id_idx" ON "notifications"("client_id");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entidade_entidade_id_idx" ON "audit_logs"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_chave_key" ON "site_settings"("chave");

-- CreateIndex
CREATE INDEX "support_tickets_client_id_idx" ON "support_tickets"("client_id");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "cobranca_contatos_installment_id_idx" ON "cobranca_contatos"("installment_id");

-- CreateIndex
CREATE INDEX "cobranca_contatos_client_id_idx" ON "cobranca_contatos"("client_id");

-- CreateIndex
CREATE INDEX "cobranca_contatos_consultor_id_idx" ON "cobranca_contatos"("consultor_id");

-- CreateIndex
CREATE INDEX "consent_logs_client_id_idx" ON "consent_logs"("client_id");

-- CreateIndex
CREATE INDEX "consent_logs_tipo_acao_idx" ON "consent_logs"("tipo", "acao");

-- CreateIndex
CREATE INDEX "data_deletion_requests_client_id_status_idx" ON "data_deletion_requests"("client_id", "status");

-- CreateIndex
CREATE INDEX "credit_scores_client_id_idx" ON "credit_scores"("client_id");

-- CreateIndex
CREATE INDEX "credit_scores_valido_ate_idx" ON "credit_scores"("valido_ate");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_slug_key" ON "email_templates"("slug");

-- CreateIndex
CREATE INDEX "consentimentos_lgpd_client_id_tipo_idx" ON "consentimentos_lgpd"("client_id", "tipo");

-- CreateIndex
CREATE INDEX "solicitacoes_titular_status_idx" ON "solicitacoes_titular"("status");

-- CreateIndex
CREATE INDEX "solicitacoes_titular_client_id_idx" ON "solicitacoes_titular"("client_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_consultor_id_fkey" FOREIGN KEY ("consultor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultor_solicitacoes" ADD CONSTRAINT "consultor_solicitacoes_consultor_id_fkey" FOREIGN KEY ("consultor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultor_solicitacoes" ADD CONSTRAINT "consultor_solicitacoes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultor_solicitacoes" ADD CONSTRAINT "consultor_solicitacoes_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intencoes_emprestimo" ADD CONSTRAINT "intencoes_emprestimo_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intencoes_emprestimo" ADD CONSTRAINT "intencoes_emprestimo_consultor_id_fkey" FOREIGN KEY ("consultor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_consultor_id_fkey" FOREIGN KEY ("consultor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_origem_loan_id_fkey" FOREIGN KEY ("origem_loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_pagamentos" ADD CONSTRAINT "comissao_pagamentos_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avalistas" ADD CONSTRAINT "avalistas_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avalistas" ADD CONSTRAINT "avalistas_cliente_vinculado_id_fkey" FOREIGN KEY ("cliente_vinculado_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_reparcelamento" ADD CONSTRAINT "solicitacoes_reparcelamento_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_reparcelamento" ADD CONSTRAINT "solicitacoes_reparcelamento_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_reparcelamento" ADD CONSTRAINT "solicitacoes_reparcelamento_consultor_id_fkey" FOREIGN KEY ("consultor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores_risco" ADD CONSTRAINT "scores_risco_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_intencao_id_fkey" FOREIGN KEY ("intencao_id") REFERENCES "intencoes_emprestimo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_reparcelamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_remetente_id_fkey" FOREIGN KEY ("remetente_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversa_participantes" ADD CONSTRAINT "conversa_participantes_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversa_participantes" ADD CONSTRAINT "conversa_participantes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_payments" ADD CONSTRAINT "pix_payments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_payments" ADD CONSTRAINT "pix_payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mp_payments" ADD CONSTRAINT "mp_payments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mp_payments" ADD CONSTRAINT "mp_payments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renegociacoes" ADD CONSTRAINT "renegociacoes_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobranca_contatos" ADD CONSTRAINT "cobranca_contatos_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobranca_contatos" ADD CONSTRAINT "cobranca_contatos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_scores" ADD CONSTRAINT "credit_scores_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimentos_lgpd" ADD CONSTRAINT "consentimentos_lgpd_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_titular" ADD CONSTRAINT "solicitacoes_titular_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_titular" ADD CONSTRAINT "solicitacoes_titular_respondido_por_fkey" FOREIGN KEY ("respondido_por") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

