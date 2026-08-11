
-- Seed default operators
INSERT INTO "users" ("nome", "username", "password", "role", "email", "active", "created_at", "updated_at")
VALUES 
('Administrador', 'adm', '$2b$12$RHk49ke0ZPGoVuHtbrx1f.9xrWe/FP.EaAwFQWjS6.EItK4/fMVae', 'admin', 'adm@siafi.lidera.srv.br', true, NOW(), NOW()),
('Financeiro', 'financeiro', '$2b$12$RHk49ke0ZPGoVuHtbrx1f.9xrWe/FP.EaAwFQWjS6.EItK4/fMVae', 'financeiro', 'financeiro@siafi.lidera.srv.br', true, NOW(), NOW()),
('Caixa', 'caixa', '$2b$12$RHk49ke0ZPGoVuHtbrx1f.9xrWe/FP.EaAwFQWjS6.EItK4/fMVae', 'caixa', 'caixa@siafi.lidera.srv.br', true, NOW(), NOW()),
('Consultor', 'consultor', '$2b$12$RHk49ke0ZPGoVuHtbrx1f.9xrWe/FP.EaAwFQWjS6.EItK4/fMVae', 'consultor', 'consultor@siafi.lidera.srv.br', true, NOW(), NOW())
ON CONFLICT ("username") DO NOTHING;

-- Seed default client users
INSERT INTO "users" ("nome", "username", "password", "role", "email", "active", "created_at", "updated_at")
VALUES 
('Eloá Clara Analu Nascimento', 'cliente1', '$2b$12$RHk49ke0ZPGoVuHtbrx1f.9xrWe/FP.EaAwFQWjS6.EItK4/fMVae', 'cliente', 'cliente1@siafi.lidera.srv.br', true, NOW(), NOW()),
('Juan Ian Barros', 'cliente2', '$2b$12$RHk49ke0ZPGoVuHtbrx1f.9xrWe/FP.EaAwFQWjS6.EItK4/fMVae', 'cliente', 'cliente2@siafi.lidera.srv.br', true, NOW(), NOW()),
('Fernanda Alícia Teixeira', 'cliente3', '$2b$12$RHk49ke0ZPGoVuHtbrx1f.9xrWe/FP.EaAwFQWjS6.EItK4/fMVae', 'cliente', 'cliente3@siafi.lidera.srv.br', true, NOW(), NOW())
ON CONFLICT ("username") DO NOTHING;

-- Seed clients (linked to users)
INSERT INTO "clients" ("nome", "cpf", "rg", "data_nascimento", "identidade_genero", "email", "whatsapp", "telefone", "endereco", "bairro", "cidade", "estado", "cep", "user_id", "active", "portal_ativo", "portal_ativado_em", "created_at", "updated_at")
VALUES
('Eloá Clara Analu Nascimento', '90150459173', '207958312', '1987-05-05 00:00:00', 'feminino', 'cliente1@siafi.lidera.srv.br', '66987868475', '6628852692', 'Avenida Carlos Hugney, 923', 'Centro', 'Alto Araguaia', 'MT', '78780970', (SELECT id FROM users WHERE username = 'cliente1'), true, true, NOW(), NOW(), NOW()),
('Juan Ian Barros', '38979033184', '454429939', '1987-05-19 00:00:00', 'masculino', 'cliente2@siafi.lidera.srv.br', '66992010928', '6635574121', 'Avenida Carlos Hugney, 245', 'Centro', 'Alto Araguaia', 'MT', '78780970', (SELECT id FROM users WHERE username = 'cliente2'), true, true, NOW(), NOW(), NOW()),
('Fernanda Alícia Teixeira', '63231627176', '236314993', '1987-02-16 00:00:00', 'feminino', 'cliente3@siafi.lidera.srv.br', '66999571196', '6626587467', 'Avenida Carlos Hugney, 904', 'Centro', 'Alto Araguaia', 'MT', '78780970', (SELECT id FROM users WHERE username = 'cliente3'), true, true, NOW(), NOW(), NOW())
ON CONFLICT ("cpf") DO NOTHING;

-- Seed default consultor linkage
UPDATE "clients" SET "consultor_id" = (SELECT id FROM users WHERE username = 'consultor');
