export const VERSAO = '1.0'
export const DATA_VIGENCIA = '24/05/2026'

export interface LegalSection {
  titulo: string
  conteudo: string
}

export const SECTIONS: LegalSection[] = [
  {
    titulo: 'O que são cookies',
    conteudo: `Cookies são pequenos arquivos de texto armazenados no seu navegador quando você visita um site. Eles permitem que o sistema lembre suas preferências e mantenha sua sessão ativa.`,
  },
  {
    titulo: 'Cookies que utilizamos',
    conteudo: `Cookies essenciais (sem consentimento — necessários para o serviço)

• sb-[project]-auth-token — Duração: 7 dias — Finalidade: Sessão de autenticação Supabase (httpOnly, Secure, SameSite=Lax)
• sb-[project]-auth-token.0 — Duração: 7 dias — Finalidade: Fragmento do token de autenticação

Esses cookies são estritamente necessários para o funcionamento do sistema de login. Sem eles, você não consegue acessar o portal. Eles não podem ser desativados individualmente.`,
  },
  {
    titulo: 'Cookies que NÃO utilizamos',
    conteudo: `✗ Cookies de rastreamento (Google Analytics, Facebook Pixel, etc.)
✗ Cookies de publicidade
✗ Cookies de redes sociais
✗ Cookies de terceiros para fins de marketing`,
  },
  {
    titulo: 'Como gerenciar os cookies',
    conteudo: `Você pode configurar seu navegador para bloquear ou excluir cookies. Note que bloquear os cookies essenciais impedirá o acesso ao sistema.

Instruções por navegador:
• Chrome: Configurações → Privacidade → Cookies
• Firefox: Configurações → Privacidade e Segurança
• Safari: Preferências → Privacidade
• Edge: Configurações → Cookies e permissões do site`,
  },
  {
    titulo: 'Armazenamento local (localStorage / sessionStorage)',
    conteudo: `O SIAFI não utiliza localStorage ou sessionStorage para armazenar dados pessoais. Tokens de sessão do portal são mantidos apenas em memória (estado React) durante a sessão do navegador.

Exceção: a preferência de aviso de cookies ("siafi_cookie_consent") é salva no localStorage como dado técnico não pessoal.`,
  },
  {
    titulo: 'Alterações nesta Política',
    conteudo: `Alterações serão comunicadas no sistema com antecedência de 10 dias.`,
  },
  {
    titulo: 'Contato',
    conteudo: `Para dúvidas sobre cookies:
• Email: privacidade@lidera.com.br
• Portal: https://siafi.app.br/portal/suporte`,
  },
]
