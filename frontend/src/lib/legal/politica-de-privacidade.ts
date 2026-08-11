export const VERSAO = '1.0'
export const DATA_VIGENCIA = '24/05/2026'

export interface LegalSection {
  titulo: string
  conteudo: string
}

export const SECTIONS: LegalSection[] = [
  {
    titulo: '1. Controlador dos Dados',
    conteudo: `Razão social: Lidera Tecnologia e Gestão Ltda
CNPJ: [PREENCHER: CNPJ DA EMPRESA]
Endereço: [PREENCHER: ENDEREÇO COMPLETO], Cuiabá-MT, [PREENCHER: CEP]
Email do DPO: privacidade@lidera.com.br
Encarregado (DPO): Bruno Anderson`,
  },
  {
    titulo: '2. Que dados coletamos e por quê',
    conteudo: `2.1 Dados de clientes de empréstimo

• Nome completo — Identificação e contratos — Base Legal: Art. 7º, VI (execução de contrato)
• CPF — Identificação legal e consultas — Base Legal: Art. 7º, VI
• RG — Verificação de identidade — Base Legal: Art. 7º, VI
• Data de nascimento — Verificação de maioridade — Base Legal: Art. 7º, VI
• Email — Comunicação e autenticação — Base Legal: Art. 7º, VI
• WhatsApp — Notificações e cobranças — Base Legal: Art. 7º, IX (legítimo interesse)
• Endereço — Documentação contratual — Base Legal: Art. 7º, VI
• Foto pessoal — Verificação de identidade — Base Legal: Art. 7º, VI
• Comprovante de renda — Análise de crédito — Base Legal: Art. 7º, VI
• Histórico de pagamentos — Gestão do contrato — Base Legal: Art. 7º, VI
• Score de pontualidade — Análise interna de risco — Base Legal: Art. 7º, IX
• IP do aceite — Validade jurídica do contrato — Base Legal: Art. 7º, VI

2.2 Dados de operadores (funcionários e parceiros)

• Nome e email — Identificação e acesso — Base Legal: Art. 7º, II (obrigação legal)
• IP de acesso — Segurança e auditoria — Base Legal: Art. 7º, IX
• Logs de ação — Conformidade e auditoria — Base Legal: Art. 7º, II

2.3 Dados técnicos e cookies

• Cookie de sessão — Manter autenticação ativa — Base Legal: Art. 7º, VI (necessário para o serviço)
• IP de acesso — Segurança — Base Legal: Art. 7º, IX
• User-Agent — Compatibilidade e segurança — Base Legal: Art. 7º, IX`,
  },
  {
    titulo: '3. Compartilhamento com terceiros',
    conteudo: `Seus dados podem ser compartilhados com:

• Supabase Inc. — País: Brasil (SA-East-1, São Paulo) — Finalidade: Autenticação e armazenamento — Dados: Todos os dados do perfil
• Upstash — País: EUA* — Finalidade: Processamento de filas — Dados: Nome e contato (em trânsito, não persistido)
• Evolution API — País: Brasil — Finalidade: Envio de mensagens WhatsApp — Dados: Nome e número de telefone
• Mercado Pago — País: Brasil — Finalidade: Processamento de pagamentos PIX — Dados: Nome, CPF e valor
• Hostinger — País: Europa* — Finalidade: Envio de emails — Dados: Nome e email

*Dados transferidos para fora do Brasil com cláusulas contratuais de proteção equivalentes à LGPD, conforme Art. 33, II.

A Lidera não vende dados pessoais a terceiros.`,
  },
  {
    titulo: '4. Por quanto tempo guardamos seus dados',
    conteudo: `• Contratos e documentos — 5 anos após quitação — Obrigação legal (Código Civil)
• Histórico de pagamentos — 5 anos — Obrigação legal
• Logs de auditoria — 5 anos — Conformidade e segurança
• Dados de acesso (IP, timestamps) — 6 meses — Segurança
• Documentos de identidade — 5 anos após quitação — Obrigação legal
• Conta do portal (inativa) — 2 anos de inatividade — Após: anonimização`,
  },
  {
    titulo: '5. Seus direitos como titular (Art. 18 LGPD)',
    conteudo: `Você tem direito a:

✓ Acesso — solicitar confirmação e cópia dos seus dados
✓ Retificação — corrigir dados incorretos ou desatualizados
✓ Exclusão — solicitar a exclusão dos dados (quando possível*)
✓ Portabilidade — receber seus dados em formato estruturado
✓ Oposição — opor-se ao tratamento baseado em legítimo interesse
✓ Revogação — revogar consentimentos dados anteriormente
✓ Informação — saber com quem seus dados foram compartilhados

*A exclusão pode ser limitada quando há obrigação legal de retenção (ex: dados de contratos ativos ou no prazo legal de guarda).

Como exercer seus direitos:
• Portal: https://siafi.app.br/portal/privacidade
• Email: privacidade@lidera.com.br
• Prazo de resposta: até 15 dias úteis`,
  },
  {
    titulo: '6. Segurança dos dados',
    conteudo: `Adotamos as seguintes medidas técnicas e organizacionais:
• Criptografia TLS 1.3 em todas as comunicações
• Criptografia de senhas com bcrypt (fator de custo 12)
• Criptografia de dados sensíveis (CPF) no banco de dados
• Autenticação multifator (MFA/2FA)
• Controle de acesso baseado em perfis (RBAC)
• Registro imutável de todas as ações (AuditLog)
• Armazenamento de documentos em bucket privado
• Revisão periódica de acessos
• Treinamento de equipe`,
  },
  {
    titulo: '7. Cookies',
    conteudo: `Consulte nossa Política de Cookies para informações detalhadas. Resumo: utilizamos apenas cookies essenciais para o funcionamento do sistema. Não utilizamos cookies de rastreamento ou publicidade.`,
  },
  {
    titulo: '8. Menores de idade',
    conteudo: `O SIAFI é destinado exclusivamente a pessoas maiores de 18 anos. Não coletamos intencionalmente dados de menores.`,
  },
  {
    titulo: '9. Alterações nesta Política',
    conteudo: `Alterações serão comunicadas com 10 dias de antecedência via email e notificação no sistema. O uso continuado implica aceite da nova versão.`,
  },
  {
    titulo: '10. Contato e DPO',
    conteudo: `Encarregado pelo tratamento de dados (DPO):
Bruno Anderson · privacidade@lidera.com.br

Autoridade Nacional de Proteção de Dados (ANPD):
https://www.gov.br/anpd`,
  },
]
