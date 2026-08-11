export const VERSAO = '1.0'
export const DATA_VIGENCIA = '24/05/2026'

export interface LegalSection {
  titulo: string
  conteudo: string
}

export const SECTIONS: LegalSection[] = [
  {
    titulo: '1. Identificação',
    conteudo: `A Lidera Tecnologia e Gestão Ltda (doravante "Lidera"), pessoa jurídica de direito privado, inscrita no CNPJ sob o nº [PREENCHER: CNPJ DA EMPRESA], com sede em [PREENCHER: ENDEREÇO COMPLETO], Cuiabá, Estado do Mato Grosso, é a responsável pela operação do SIAFI — Sistema de Agilidade Financeira, acessível em https://siafi.app.br.`,
  },
  {
    titulo: '2. Aceite dos Termos',
    conteudo: `Ao acessar e utilizar o SIAFI, você (o "Usuário") declara ter lido, compreendido e concordado com estes Termos de Uso em sua integralidade.

O aceite é formalizado:
• Para clientes: ao clicar em "Aceitar e continuar" no primeiro acesso ao portal, com registro de IP, timestamp e hash SHA-256.
• Para operadores: no momento da criação da conta pelo administrador, com ciência declarada no cadastro.

Caso não concorde com qualquer disposição, não utilize o sistema.`,
  },
  {
    titulo: '3. O que é o SIAFI',
    conteudo: `O SIAFI é uma plataforma privada de gestão financeira destinada exclusivamente ao uso interno da Lidera e seus clientes de empréstimo. O acesso é restrito, controlado e autenticado por credenciais individuais.

O sistema permite:
• Gestão de contratos de empréstimo
• Acompanhamento de parcelas e pagamentos
• Comunicação entre clientes e a equipe Lidera
• Geração de cobranças via PIX e boleto
• Assinatura digital de contratos`,
  },
  {
    titulo: '4. Acesso e Segurança',
    conteudo: `4.1 O Usuário é responsável pela confidencialidade de suas credenciais.

4.2 O compartilhamento de login é expressamente proibido e pode resultar no bloqueio imediato do acesso.

4.3 A Lidera implementa as seguintes medidas de segurança:
• Autenticação em dois fatores (2FA/MFA) obrigatória
• Criptografia TLS em todas as comunicações
• Tokens de sessão com expiração automática
• Registro imutável de todas as ações (AuditLog)
• Armazenamento seguro de documentos (acesso privado)

4.4 Em caso de suspeita de comprometimento da conta, contate imediatamente: lideraabrange@gmail.com`,
  },
  {
    titulo: '5. Aceite Digital de Contratos',
    conteudo: `O aceite digital realizado pelo cliente no portal tem validade jurídica equivalente à assinatura manuscrita, nos termos do Art. 10 da Medida Provisória nº 2.200-2/2001 e do Marco Civil da Internet (Lei 12.965/2014).

Cada aceite é registrado com:
• Timestamp (data e hora exatos)
• Endereço IP do dispositivo utilizado
• Hash SHA-256 do documento aceito
• Versão do documento`,
  },
  {
    titulo: '6. Responsabilidades',
    conteudo: `6.1 A Lidera compromete-se a:
• Manter o sistema disponível (SLA de 99,5% mensal)
• Notificar o usuário em caso de manutenção programada
• Proteger os dados conforme a LGPD
• Responder solicitações de titulares em até 15 dias úteis

6.2 O Usuário compromete-se a:
• Fornecer informações verdadeiras e atualizadas
• Não utilizar o sistema para fins ilícitos
• Não tentar acessar dados de outros usuários
• Comunicar imediatamente qualquer irregularidade detectada`,
  },
  {
    titulo: '7. Propriedade Intelectual',
    conteudo: `O SIAFI, incluindo sua interface, código-fonte, marca e conteúdo, é propriedade exclusiva da Lidera. É proibida a reprodução, distribuição ou uso para fins comerciais sem autorização expressa.`,
  },
  {
    titulo: '8. Limitação de Responsabilidade',
    conteudo: `A Lidera não se responsabiliza por:
• Indisponibilidades causadas por terceiros (provedores de nuvem, operadoras de telecomunicações, falhas de força maior)
• Uso indevido das credenciais pelo próprio Usuário
• Decisões financeiras tomadas com base nos dados do sistema`,
  },
  {
    titulo: '9. Alterações nos Termos',
    conteudo: `A Lidera reserva-se o direito de alterar estes Termos a qualquer momento. Alterações relevantes serão comunicadas por email e/ou notificação no sistema com antecedência mínima de 10 dias.

O uso continuado após a vigência da nova versão implica aceite.`,
  },
  {
    titulo: '10. Foro e Lei Aplicável',
    conteudo: `Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da Comarca de Cuiabá, Estado do Mato Grosso, para dirimir quaisquer controvérsias.`,
  },
  {
    titulo: '11. Contato',
    conteudo: `Para dúvidas sobre estes Termos:
• Email: lideraabrange@gmail.com
• Portal de suporte: https://siafi.app.br/portal/suporte`,
  },
]
