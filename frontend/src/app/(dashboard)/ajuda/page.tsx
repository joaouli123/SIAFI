'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth.context'
import { cn } from '@/lib/utils'
import {
  Search, ChevronDown, ChevronLeft, MessageSquare,
  HelpCircle, Shield, Globe, ClipboardList, Users,
  AlertTriangle, MessageCircle, BarChart2, Banknote,
  RefreshCcw, TrendingUp, Timer, CreditCard, Wallet,
  Settings, Mail, UserCog,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'admin' | 'financeiro' | 'consultor' | 'caixa' | 'cliente'

interface Article {
  id: string
  categoryId: string
  question: string
  answer: string
}

interface Category {
  id: string
  icon: React.ElementType
  title: string
  roles: Role[] // vazio = todos os perfis internos
  count: number
}

// ─── Categories ──────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  // Todos os perfis internos
  { id: 'primeiros-passos',    icon: HelpCircle,     title: 'Primeiros Passos',          roles: [],                                        count: 4 },
  { id: 'seguranca-mfa',       icon: Shield,         title: 'Segurança e 2FA',            roles: [],                                        count: 5 },
  { id: 'portal-clientes',     icon: Globe,          title: 'Portal e Clientes',          roles: [],                                        count: 6 },
  // Consultor + Financeiro + Admin
  { id: 'intencoes',           icon: ClipboardList,  title: 'Intenções de Empréstimo',    roles: ['consultor', 'financeiro', 'admin'],       count: 8 },
  { id: 'gestao-carteira',     icon: Users,          title: 'Gestão da Carteira',         roles: ['consultor', 'financeiro', 'admin'],       count: 6 },
  { id: 'cobrancas',           icon: AlertTriangle,  title: 'Cobranças e Inadimplência',  roles: ['consultor', 'financeiro', 'admin'],       count: 5 },
  { id: 'comunicador',         icon: MessageCircle,  title: 'Comunicador Interno',        roles: ['consultor', 'financeiro', 'admin', 'caixa'], count: 4 },
  // Financeiro + Admin
  { id: 'analise-aprovacao',   icon: BarChart2,      title: 'Análise e Aprovação',        roles: ['financeiro', 'admin'],                   count: 7 },
  { id: 'contratos-liberacao', icon: Banknote,       title: 'Contratos e Liberação',      roles: ['financeiro', 'admin'],                   count: 6 },
  { id: 'reparcelamentos',     icon: RefreshCcw,     title: 'Reparcelamentos',            roles: ['financeiro', 'admin', 'consultor'],       count: 5 },
  { id: 'relatorios',          icon: TrendingUp,     title: 'Relatórios Financeiros',     roles: ['financeiro', 'admin'],                   count: 4 },
  // Caixa + Financeiro + Admin
  { id: 'liberar-capital',     icon: Timer,          title: 'Liberar Capital',            roles: ['caixa', 'financeiro', 'admin'],          count: 4 },
  { id: 'registrar-pagamentos',icon: CreditCard,     title: 'Registrar Pagamentos',       roles: ['caixa', 'financeiro', 'admin'],          count: 6 },
  { id: 'controle-caixa',      icon: Wallet,         title: 'Controle de Caixa',          roles: ['caixa', 'financeiro', 'admin'],          count: 4 },
  // Admin
  { id: 'configuracoes-sistema',icon: Settings,      title: 'Configurações do Sistema',   roles: ['admin'],                                 count: 8 },
  { id: 'templates-email',     icon: Mail,           title: 'Templates de E-mail',        roles: ['admin'],                                 count: 5 },
  { id: 'gestao-usuarios',     icon: UserCog,        title: 'Gestão de Usuários',         roles: ['admin'],                                 count: 4 },
]

// ─── Articles ────────────────────────────────────────────────────────────────

const ARTICLES: Article[] = [
  // ── Primeiros Passos ──────────────────────────────────────────────────────
  {
    id: 'pp-1', categoryId: 'primeiros-passos',
    question: 'Como faço para acessar o sistema pela primeira vez?',
    answer: `Acesse o endereço do sistema no navegador: https://siafi.app.br\n\nDigite o e-mail e a senha provisória enviada pelo administrador. Na sequência, o sistema pedirá que você defina uma nova senha permanente. Após trocar a senha, você será redirecionado para o painel inicial.\n\nSe for seu primeiro acesso com o perfil administrador, financeiro ou consultor, a configuração da autenticação em dois fatores (Google Authenticator) será solicitada imediatamente.`,
  },
  {
    id: 'pp-2', categoryId: 'primeiros-passos',
    question: 'Como trocar minha senha após o primeiro acesso?',
    answer: `No primeiro acesso com uma senha provisória, o sistema exibe automaticamente a tela de troca de senha. Basta digitar a nova senha (mínimo 8 caracteres, com letras maiúsculas, minúsculas e números), confirmar e salvar.\n\nPara trocar a senha posteriormente, acesse o ícone do seu usuário no canto superior direito e selecione "Alterar senha".`,
  },
  {
    id: 'pp-3', categoryId: 'primeiros-passos',
    question: 'Como configurar a autenticação em dois fatores (2FA)?',
    answer: `1. Instale o aplicativo Google Authenticator no seu celular (disponível na App Store e Google Play, gratuitamente).\n2. Faça login no sistema. Ele exibirá um QR Code na tela.\n3. No Google Authenticator, toque em "+" → "Escanear QR Code" e aponte para a tela.\n4. O aplicativo criará uma entrada "SIAFI" com um código de 6 dígitos.\n5. Digite esse código no sistema e clique em Confirmar.\n6. Guarde o código de recuperação exibido em local seguro.\n\nO código muda a cada 30 segundos — digite-o rapidamente.`,
  },
  {
    id: 'pp-4', categoryId: 'primeiros-passos',
    question: 'O que fazer se esquecer minha senha?',
    answer: `Na tela de login, clique em "Esqueci minha senha". Informe o e-mail cadastrado e siga as instruções que serão enviadas para o seu e-mail.\n\nSe não tiver acesso ao e-mail cadastrado, entre em contato com o administrador do sistema para que ele resete sua senha manualmente.`,
  },

  // ── Segurança e MFA ───────────────────────────────────────────────────────
  {
    id: 'mfa-1', categoryId: 'seguranca-mfa',
    question: 'Como configurar o Google Authenticator?',
    answer: `Instale o aplicativo Google Authenticator no celular. No sistema, acesse o ícone do seu usuário → "Configurar autenticação em dois fatores". Escaneie o QR Code com o aplicativo e confirme o código gerado. Guarde o código de recuperação que aparecerá na tela.`,
  },
  {
    id: 'mfa-2', categoryId: 'seguranca-mfa',
    question: 'Perdi meu celular — como recuperar o acesso?',
    answer: `Se você guardou o código de recuperação gerado na configuração do 2FA, use-o na tela de login no campo "Usar código de recuperação".\n\nSe não tiver o código de recuperação, entre em contato com o administrador do sistema. Ele pode resetar a autenticação em dois fatores da sua conta para que você possa reconfigurar com um novo celular.`,
  },
  {
    id: 'mfa-3', categoryId: 'seguranca-mfa',
    question: 'O que acontece se não configurar o 2FA no prazo?',
    answer: `Para administradores, financeiros e consultores: o 2FA é obrigatório no primeiro acesso. Sem configurar, não é possível avançar para o sistema.\n\nPara caixas e clientes: há um prazo de 5 logins. Após o 5º login sem configurar, a conta é bloqueada até que o 2FA seja configurado. Nesse caso, entre em contato com o administrador.`,
  },
  {
    id: 'mfa-4', categoryId: 'seguranca-mfa',
    question: 'Como saber se minha conta está protegida pelo 2FA?',
    answer: `Acesse o ícone do seu usuário no canto superior direito → "Meu perfil". Se o 2FA estiver ativo, aparecerá o status "Autenticação em dois fatores: ativa" com a data de configuração.\n\nAdministradores podem verificar o status do 2FA de todos os operadores na tela Usuários, coluna "2FA".`,
  },
  {
    id: 'mfa-5', categoryId: 'seguranca-mfa',
    question: 'O que é o login com Google e como ativar?',
    answer: `O login com Google permite acessar o sistema usando sua conta Google, sem precisar digitar senha. Para usar, clique em "Entrar com Google" na tela de login.\n\nPara que funcione, o administrador precisa vincular seu e-mail Google ao seu cadastro no sistema. Entre em contato com o admin para solicitar a vinculação.`,
  },

  // ── Portal e Clientes ─────────────────────────────────────────────────────
  {
    id: 'portal-1', categoryId: 'portal-clientes',
    question: 'Como ativar o portal do cliente?',
    answer: `Acesse o perfil do cliente → clique em "Ativar Portal". O sistema enviará automaticamente um e-mail ao cliente com o link de acesso e as instruções para o primeiro login.\n\nO portal só pode ser ativado após o cadastro completo do cliente, incluindo documentos. Clientes sem e-mail cadastrado não podem ter o portal ativado.`,
  },
  {
    id: 'portal-2', categoryId: 'portal-clientes',
    question: 'O cliente não recebeu o e-mail de ativação. O que fazer?',
    answer: `Primeiro, peça ao cliente que verifique a pasta de spam ou lixo eletrônico.\n\nSe não encontrar, acesse o perfil do cliente no sistema e clique em "Reenviar e-mail de ativação". Verifique também se o e-mail cadastrado está correto — se estiver errado, edite o cadastro e reenvie.`,
  },
  {
    id: 'portal-3', categoryId: 'portal-clientes',
    question: 'Como gerar um QR Code PIX para o cliente?',
    answer: `Acesse o perfil do cliente ou a tela PIX no menu lateral. Selecione o cliente e a parcela desejada. Clique em "Gerar QR Code PIX".\n\nO sistema exibirá o QR Code e o código copia-e-cola. Compartilhe com o cliente pelo canal de sua preferência. O QR Code é válido por 24 horas — após esse prazo, gere um novo.`,
  },
  {
    id: 'portal-4', categoryId: 'portal-clientes',
    question: 'O cliente esqueceu a senha do portal. Como resetar?',
    answer: `O próprio cliente pode recuperar a senha pela tela de login do portal, clicando em "Esqueci minha senha" e seguindo as instruções enviadas por e-mail.\n\nSe o cliente não tiver acesso ao e-mail cadastrado, o administrador pode resetar a senha manualmente pela tela de Usuários (caso o cliente tenha conta criada) ou pelo perfil do cliente.`,
  },
  {
    id: 'portal-5', categoryId: 'portal-clientes',
    question: 'Como desativar o acesso do cliente ao portal?',
    answer: `Acesse o perfil do cliente → clique em "Desativar Portal" → confirme a ação. O acesso do cliente é bloqueado imediatamente. Os dados e histórico são mantidos.\n\nPara reativar, acesse o mesmo perfil e clique em "Ativar Portal" novamente.`,
  },
  {
    id: 'portal-6', categoryId: 'portal-clientes',
    question: 'O cliente quer receber notificações. Como configurar?',
    answer: `As preferências de notificação são configuradas pelo próprio cliente no portal, em "Meu Perfil" → "Preferências de notificação". Ele pode escolher receber por e-mail, WhatsApp ou ambos.\n\nOperadores com perfil financeiro ou admin também podem visualizar e alterar as preferências de notificação pelo painel de gestão do cliente.`,
  },

  // ── Intenções de Empréstimo ───────────────────────────────────────────────
  {
    id: 'int-1', categoryId: 'intencoes',
    question: 'Como criar uma intenção de empréstimo?',
    answer: `Acesse o perfil do cliente ou clique em Intenções → Nova Intenção no menu lateral. Selecione o cliente, informe o valor solicitado, o número de parcelas desejadas, o dia de vencimento preferido, a finalidade e as observações relevantes. Clique em "Enviar para Análise".\n\nApós o envio, a intenção entra na fila de análise do financeiro e não pode ser editada.`,
  },
  {
    id: 'int-2', categoryId: 'intencoes',
    question: 'O que acontece após enviar a intenção?',
    answer: `A intenção entra na fila do financeiro com status "Aguardando análise". O financeiro tem até 24 horas para analisar (SLA configurável).\n\nVocê receberá uma notificação quando houver uma resposta. Se aprovada, o sistema gera o contrato automaticamente e envia ao cliente para assinatura digital. Se rejeitada, o motivo estará registrado na tela da intenção.`,
  },
  {
    id: 'int-3', categoryId: 'intencoes',
    question: 'Por que minha intenção foi rejeitada?',
    answer: `Clique na intenção para ver o motivo da rejeição registrado pelo financeiro. Os motivos mais comuns são: score de risco insuficiente, capacidade de pagamento comprometida, documentação incompleta ou contrato anterior em aberto.\n\nCom base no motivo, ajuste as condições (valor menor, mais parcelas) ou resolva a pendência indicada e crie uma nova intenção.`,
  },
  {
    id: 'int-4', categoryId: 'intencoes',
    question: 'Como informar o cliente sobre o resultado da intenção?',
    answer: `Quando a intenção é aprovada, o sistema envia automaticamente uma notificação ao cliente com o link para assinar o contrato no portal.\n\nSe rejeitada, o sistema não notifica o cliente automaticamente — cabe ao consultor comunicar o resultado e, se cabível, orientar sobre próximos passos.`,
  },
  {
    id: 'int-5', categoryId: 'intencoes',
    question: 'O que é o SLA de análise e como funciona?',
    answer: `O SLA é o prazo máximo que o financeiro tem para analisar uma intenção. O valor padrão é 24 horas, configurável pelo administrador.\n\nQuando o prazo está próximo do vencimento, a intenção fica destacada em amarelo ou vermelho no dashboard do financeiro. Se o prazo vencer sem análise, a intenção é cancelada automaticamente e você deve criar uma nova.`,
  },
  {
    id: 'int-6', categoryId: 'intencoes',
    question: 'A intenção expirou — o que fazer?',
    answer: `Intenções expiradas não podem ser reativadas. Crie uma nova intenção com os mesmos dados. O histórico da intenção expirada é mantido para referência.\n\nSe a expiração ocorreu por demora na análise, entre em contato com o financeiro via Comunicador Interno antes de criar uma nova.`,
  },
  {
    id: 'int-7', categoryId: 'intencoes',
    question: 'Como acompanhar o status da intenção?',
    answer: `Acesse Intenções no menu lateral. A lista exibe todas as suas intenções com o status atual: Aguardando análise, Em análise, Aprovada, Rejeitada ou Expirada.\n\nNo Dashboard, o card "Intenções pendentes" mostra um atalho para intenções que ainda não receberam resposta.`,
  },
  {
    id: 'int-8', categoryId: 'intencoes',
    question: 'Posso editar uma intenção após enviar?',
    answer: `Não. Após o envio, a intenção fica bloqueada para edição enquanto está em análise. Se precisar alterar as condições, entre em contato com o financeiro pelo Comunicador Interno.\n\nCaso a intenção seja rejeitada, você pode criar uma nova com as condições corrigidas.`,
  },

  // ── Gestão da Carteira ────────────────────────────────────────────────────
  {
    id: 'cart-1', categoryId: 'gestao-carteira',
    question: 'Como ver todos os clientes da minha carteira?',
    answer: `Acesse "Clientes" ou "Minha Carteira" no menu lateral. A lista exibe todos os clientes vinculados ao seu perfil. Use os filtros por status (Ativos, Atrasados, Quitados) e o campo de busca para localizar rapidamente.`,
  },
  {
    id: 'cart-2', categoryId: 'gestao-carteira',
    question: 'Como cadastrar um novo cliente?',
    answer: `Clique em Clientes → Novo Cliente. Preencha os dados pessoais (nome, CPF, data de nascimento, telefone, e-mail), o endereço completo e anexe os documentos obrigatórios. Clique em Salvar.\n\nApós o cadastro, ative o portal do cliente para que ele possa acompanhar os contratos.`,
  },
  {
    id: 'cart-3', categoryId: 'gestao-carteira',
    question: 'Quais documentos são obrigatórios no cadastro?',
    answer: `São necessários: foto do cliente (JPG ou PNG), documento de identidade — RG ou CNH frente e verso — e comprovante de residência recente (conta de luz, água ou telefone dos últimos 3 meses).\n\nSem os três documentos, o portal do cliente não pode ser ativado.`,
  },
  {
    id: 'cart-4', categoryId: 'gestao-carteira',
    question: 'Como transferir um cliente para outro consultor?',
    answer: `A transferência de clientes entre consultores é feita pelo administrador ou financeiro. Entre em contato via Comunicador Interno ou Solicitações informando o cliente a ser transferido e o consultor de destino.`,
  },
  {
    id: 'cart-5', categoryId: 'gestao-carteira',
    question: 'O que significa o score de crédito do cliente?',
    answer: `O score é uma pontuação de 0 a 100 calculada internamente pelo sistema com base em três fatores: pontualidade de pagamentos (50% do peso), histórico de reparcelamentos (30%) e contratos quitados com sucesso (20%).\n\nUm score alto indica bom histórico de pagamentos. Clientes novos começam com score neutro e a pontuação é atualizada automaticamente após cada pagamento, atraso ou reparcelamento.`,
  },
  {
    id: 'cart-6', categoryId: 'gestao-carteira',
    question: 'Como ver o histórico de contratos de um cliente?',
    answer: `Acesse o perfil do cliente clicando no nome na lista. A tela exibe todos os contratos — ativos, quitados e cancelados — com status, progresso e datas. Clique em qualquer contrato para ver o detalhamento completo das parcelas e pagamentos.`,
  },

  // ── Cobranças e Inadimplência ─────────────────────────────────────────────
  {
    id: 'cob-1', categoryId: 'cobrancas',
    question: 'Como ver as parcelas atrasadas da minha carteira?',
    answer: `Acesse "Cobranças" no menu lateral. A lista exibe todas as parcelas atrasadas dos seus clientes, ordenadas por prioridade (mais tempo em atraso primeiro). Clique em qualquer parcela para ver os detalhes e registrar um contato.`,
  },
  {
    id: 'cob-2', categoryId: 'cobrancas',
    question: 'Como registrar uma tentativa de cobrança?',
    answer: `Na tela de Cobranças, clique na parcela atrasada → "Registrar Contato". Selecione o canal usado (telefone, WhatsApp, visita presencial) e o resultado (cliente contactado, sem contato, cliente solicitou reparcelamento). Adicione observações relevantes e salve.\n\nO histórico de cobranças é exibido no perfil do cliente e considerado pelo financeiro ao analisar pedidos de reparcelamento.`,
  },
  {
    id: 'cob-3', categoryId: 'cobrancas',
    question: 'O cliente prometeu pagar. Como registrar?',
    answer: `No registro do contato de cobrança, selecione o resultado "Cliente contactado — pagamento prometido para [data]" e informe a data prometida nas observações. Isso sinaliza para a equipe que há um compromisso de pagamento registrado.`,
  },
  {
    id: 'cob-4', categoryId: 'cobrancas',
    question: 'Quantas tentativas de cobrança devo fazer?',
    answer: `Não há um número fixo obrigatório definido pelo sistema, mas recomenda-se pelo menos 3 tentativas por canais diferentes (telefone, WhatsApp, visita) antes de escalar para o financeiro.\n\nTodas as tentativas devem ser registradas no sistema para documentar o processo.`,
  },
  {
    id: 'cob-5', categoryId: 'cobrancas',
    question: 'O cliente solicitou reparcelamento durante a cobrança. O que fazer?',
    answer: `Registre o contato com o resultado "Cliente solicitou reparcelamento". Em seguida, acesse Reparcelamentos → Nova Solicitação, selecione o cliente e o contrato e descreva as condições propostas pelo cliente.\n\nO financeiro analisará a solicitação e enviará uma proposta de novos termos.`,
  },

  // ── Comunicador Interno ───────────────────────────────────────────────────
  {
    id: 'com-1', categoryId: 'comunicador',
    question: 'Como enviar uma mensagem para outro operador?',
    answer: `Acesse "Mensagens" no menu lateral → "Nova Conversa". Selecione o destinatário na lista de operadores. Digite sua mensagem e pressione Enter ou clique em Enviar.\n\nAs mensagens aparecem em tempo real para o destinatário. O ícone de sino na barra superior exibe o contador de mensagens não lidas.`,
  },
  {
    id: 'com-2', categoryId: 'comunicador',
    question: 'Como anexar um documento em uma mensagem?',
    answer: `Dentro de uma conversa, clique no ícone de clipe de papel ao lado do campo de texto. Selecione o arquivo no seu computador. O documento será enviado junto com a mensagem. O destinatário poderá visualizar ou baixar o arquivo diretamente no chat.`,
  },
  {
    id: 'com-3', categoryId: 'comunicador',
    question: 'Como saber se minha mensagem foi lida?',
    answer: `O sistema indica a leitura pelo timestamp de "última leitura" do participante. Quando o destinatário abre a conversa, as mensagens são marcadas como lidas automaticamente.\n\nAtualmente não há indicador visual de "lido" por mensagem individual — apenas o contador de não lidas diminui.`,
  },
  {
    id: 'com-4', categoryId: 'comunicador',
    question: 'O badge de mensagens não está atualizando. O que fazer?',
    answer: `O badge é atualizado a cada 30 segundos automaticamente e também via Realtime quando uma nova mensagem é recebida. Se não estiver atualizando, recarregue a página.\n\nSe o problema persistir, verifique sua conexão com a internet ou entre em contato com o administrador.`,
  },

  // ── Análise e Aprovação ───────────────────────────────────────────────────
  {
    id: 'ana-1', categoryId: 'analise-aprovacao',
    question: 'Como analisar uma intenção de empréstimo?',
    answer: `Acesse Intenções no menu lateral. Clique em uma intenção com status "Aguardando análise". Revise os dados do cliente, o score de risco, o valor solicitado e as observações do consultor. Em seguida, clique em Aprovar (definindo os termos finais) ou Rejeitar (selecionando o motivo).`,
  },
  {
    id: 'ana-2', categoryId: 'analise-aprovacao',
    question: 'Quais critérios usar para aprovar ou rejeitar?',
    answer: `Critérios recomendados para aprovação: score acima de 60 pontos, sem parcelas em atraso em contratos ativos, documentação completa e capacidade de pagamento compatível com o valor da parcela.\n\nA decisão final é sempre do financeiro — o score é um indicador, não uma regra absoluta.`,
  },
  {
    id: 'ana-3', categoryId: 'analise-aprovacao',
    question: 'O que é o score de risco e como interpretar?',
    answer: `O score é uma pontuação de 0 a 100 calculada com base em: pontualidade de pagamentos (50% do peso), histórico de reparcelamentos (30%) e contratos quitados (20%).\n\nScore acima de 70: risco baixo. Entre 40 e 70: risco moderado. Abaixo de 40: risco alto. Clientes novos sem histórico começam com score neutro.`,
  },
  {
    id: 'ana-4', categoryId: 'analise-aprovacao',
    question: 'Como enviar o motivo de rejeição ao consultor?',
    answer: `Ao clicar em Rejeitar, selecione o motivo predefinido (score insuficiente, capacidade comprometida, documentação incompleta, contrato em aberto) ou use o campo livre "Outros" para detalhar. O consultor recebe uma notificação automática com o motivo registrado.`,
  },
  {
    id: 'ana-5', categoryId: 'analise-aprovacao',
    question: 'A intenção está próxima do prazo. O que acontece se vencer?',
    answer: `O sistema cancela a intenção automaticamente e o consultor é notificado. Nenhum contrato é gerado. O consultor precisa criar uma nova intenção.\n\nPara evitar cancelamentos por prazo, o dashboard exibe a Fila SLA com as intenções ordenadas por tempo restante — as mais urgentes ficam destacadas em vermelho.`,
  },
  {
    id: 'ana-6', categoryId: 'analise-aprovacao',
    question: 'Posso aprovar uma intenção com score baixo?',
    answer: `Sim. O score é um indicador de risco, não um bloqueio automático. Você pode aprovar uma intenção com score baixo se tiver outros critérios que justifiquem (primeiro contrato do cliente, garantias adicionais, etc.). Registre a justificativa nas observações da aprovação.`,
  },
  {
    id: 'ana-7', categoryId: 'analise-aprovacao',
    question: 'Como definir os termos finais do contrato ao aprovar?',
    answer: `Ao aprovar uma intenção, você define: o valor do capital a ser entregue, o valor de cada parcela, o número de parcelas, o dia de vencimento e os dias de antecedência para cobrança automática.\n\nO sistema calcula automaticamente o acréscimo total do contrato. Um simulador inline exibe o resumo antes de confirmar.`,
  },

  // ── Contratos e Liberação ─────────────────────────────────────────────────
  {
    id: 'lib-1', categoryId: 'contratos-liberacao',
    question: 'Como criar um contrato direto (sem intenção)?',
    answer: `Acesse Empréstimos → Novo Contrato. Selecione o cliente, informe o capital a ser entregue, o valor de cada parcela, o número de parcelas, a data de início, o dia de vencimento fixo e os dias de antecedência para cobrança. Confirme no simulador e clique em Criar Contrato.`,
  },
  {
    id: 'lib-2', categoryId: 'contratos-liberacao',
    question: 'O que é a liberação de capital e quando ocorre?',
    answer: `A liberação é a confirmação de que o dinheiro foi fisicamente entregue ao cliente. Ela ocorre após a assinatura digital do cliente no portal.\n\nApenas quando o caixa confirma a liberação o contrato se torna ativo e as datas das parcelas são definidas a partir da data real de entrega.`,
  },
  {
    id: 'lib-3', categoryId: 'contratos-liberacao',
    question: 'Como saber se o cliente já assinou o contrato?',
    answer: `No perfil do cliente ou na lista de contratos, o status do contrato muda de "Aguardando aceite" para "Aguardando liberação" assim que o cliente assinar. Você também recebe uma notificação automática quando a assinatura ocorre.`,
  },
  {
    id: 'lib-4', categoryId: 'contratos-liberacao',
    question: 'O SLA de aceite vai vencer. O que acontece?',
    answer: `Se o cliente não assinar dentro do prazo configurado (padrão: 7 dias), o sistema cancela automaticamente o contrato e as parcelas. A intenção que originou o contrato volta ao status "aprovada", permitindo gerar um novo contrato se o cliente ainda tiver interesse.`,
  },
  {
    id: 'lib-5', categoryId: 'contratos-liberacao',
    question: 'Posso alterar o valor da parcela após criar o contrato?',
    answer: `Não. Após a criação do contrato, os valores são imutáveis. Para alterar as condições financeiras, é necessário executar um reparcelamento — que cancela o contrato original e cria um novo com os novos termos.`,
  },
  {
    id: 'lib-6', categoryId: 'contratos-liberacao',
    question: 'Como configurar encargos individualmente por contrato?',
    answer: `Acesse o contrato → clique em "Configurações do contrato". É possível definir individualmente: percentual de multa por atraso, mora diária, dia de vencimento e dias de antecedência para cobrança. Os valores preenchidos sobrescrevem o padrão global apenas para aquele contrato.`,
  },

  // ── Reparcelamentos ───────────────────────────────────────────────────────
  {
    id: 'rep-1', categoryId: 'reparcelamentos',
    question: 'Como solicitar um reparcelamento para um cliente?',
    answer: `Acesse Reparcelamentos → Nova Solicitação. Selecione o cliente e o contrato. Informe o motivo da solicitação e as condições desejadas (novo valor de parcela, número de parcelas). O financeiro analisará e enviará uma proposta de novos termos.`,
  },
  {
    id: 'rep-2', categoryId: 'reparcelamentos',
    question: 'O que é a 2ª instância de aprovação?',
    answer: `Reparcelamentos que excedem limites configurados (como número máximo de reparcelamentos por contrato) requerem uma segunda aprovação além da do financeiro que elaborou a proposta. Isso garante um controle adicional para casos fora do padrão.\n\nO status do reparcelamento muda para "Aguardando 2ª aprovação" quando esse passo é necessário.`,
  },
  {
    id: 'rep-3', categoryId: 'reparcelamentos',
    question: 'Como usar o simulador de reparcelamento?',
    answer: `Ao criar ou editar uma proposta de reparcelamento, o simulador exibe automaticamente o saldo devedor atual, os encargos acumulados e o resultado dos novos termos informados (novo total a receber, variação em relação ao contrato original).\n\nUse o simulador para testar diferentes cenários antes de enviar a proposta ao cliente.`,
  },
  {
    id: 'rep-4', categoryId: 'reparcelamentos',
    question: 'O cliente aceitou a proposta. O que acontece?',
    answer: `Quando o cliente aceita digitalmente no portal, o financeiro executa o reparcelamento (botão "Executar"). O sistema, em uma operação única:\n\n1. Cancela o contrato original e as parcelas não pagas\n2. Cria um novo contrato com os novos termos\n3. Registra o aceite digital do cliente\n4. Recalcula o score de risco\n\nO cliente recebe uma notificação confirmando o novo contrato.`,
  },
  {
    id: 'rep-5', categoryId: 'reparcelamentos',
    question: 'Posso cancelar um reparcelamento em andamento?',
    answer: `Sim, enquanto o reparcelamento ainda não foi executado. Acesse a solicitação de reparcelamento e clique em "Rejeitar". Isso cancela o processo e o contrato original permanece ativo com as condições anteriores.\n\nApós a execução, o reparcelamento não pode ser desfeito — o contrato original já foi cancelado.`,
  },

  // ── Relatórios Financeiros ────────────────────────────────────────────────
  {
    id: 'rel-1', categoryId: 'relatorios',
    question: 'O que mostra o relatório de carteira?',
    answer: `O relatório de carteira exibe: capital total em carteira (soma dos capitais emprestados em contratos ativos), valor total a receber (parcelas futuras), valor já recebido no mês, capital em risco (contratos inadimplentes) e totais de contratos ativos e atrasados.`,
  },
  {
    id: 'rel-2', categoryId: 'relatorios',
    question: 'Como ver o faturamento por consultor?',
    answer: `Acesse Relatórios → aba "Faturamento". Selecione o mês no filtro. O relatório exibe o total recebido no período com detalhamento por consultor, mostrando quantas parcelas foram pagas e o valor total por carteira.`,
  },
  {
    id: 'rel-3', categoryId: 'relatorios',
    question: 'O que é o aging de inadimplência?',
    answer: `O aging mostra a distribuição dos contratos inadimplentes por faixa de dias em atraso: 0–30 dias, 31–60 dias, 61–90 dias e acima de 90 dias. É uma visão essencial para priorizar ações de cobrança e identificar contratos de difícil recuperação.`,
  },
  {
    id: 'rel-4', categoryId: 'relatorios',
    question: 'Como exportar um relatório?',
    answer: `Em qualquer tela de relatório, após aplicar os filtros desejados, clique no botão "Exportar" disponível no canto superior direito da tabela. O arquivo pode ser baixado em formato PDF ou Excel (XLSX).`,
  },

  // ── Liberar Capital ───────────────────────────────────────────────────────
  {
    id: 'lcap-1', categoryId: 'liberar-capital',
    question: 'Quando devo confirmar a liberação de capital?',
    answer: `Somente após a entrega efetiva do dinheiro ao cliente. O sistema exibe contratos com status "Aguardando liberação" — são contratos que o cliente já assinou digitalmente.\n\nNunca confirme a liberação antes de entregar o dinheiro. A confirmação registra automaticamente uma saída no caixa, e essa ação não pode ser desfeita sem o administrador.`,
  },
  {
    id: 'lcap-2', categoryId: 'liberar-capital',
    question: 'Quais métodos de entrega posso registrar?',
    answer: `Ao confirmar a liberação, selecione o método utilizado: dinheiro em espécie, transferência bancária (TED/PIX) ou outros. Você também pode anexar o comprovante de transferência e informar a data exata da entrega (que pode ser diferente da data atual se a entrega já ocorreu).`,
  },
  {
    id: 'lcap-3', categoryId: 'liberar-capital',
    question: 'O que acontece se confirmar a data errada?',
    answer: `A data de liberação afeta diretamente os vencimentos das parcelas — elas são calculadas a partir dessa data. Se confirmar com a data errada, entre em contato imediatamente com o financeiro ou administrador, pois a correção requer acesso de nível superior.`,
  },
  {
    id: 'lcap-4', categoryId: 'liberar-capital',
    question: 'Preciso de comprovante obrigatoriamente?',
    answer: `O anexo do comprovante não é obrigatório pelo sistema, mas é altamente recomendado para fins de auditoria e controle. Para entregas em dinheiro, registre a data e o método. Para transferências, anexe o comprovante bancário.`,
  },

  // ── Registrar Pagamentos ──────────────────────────────────────────────────
  {
    id: 'pag-1', categoryId: 'registrar-pagamentos',
    question: 'Como registrar um pagamento recebido em dinheiro?',
    answer: `Acesse Pagamentos → Novo Pagamento. Busque o cliente pelo CPF ou nome. Selecione o contrato e a parcela. Verifique o valor (com encargos, se atrasada). Selecione o método "Dinheiro". Confirme o valor recebido e clique em Registrar pagamento.`,
  },
  {
    id: 'pag-2', categoryId: 'registrar-pagamentos',
    question: 'O cliente pagou menos que o valor da parcela. O que fazer?',
    answer: `Registre o valor recebido normalmente no campo "Valor recebido". O sistema identificará o pagamento como parcial e atribuirá o status "Parcialmente pago" à parcela. O saldo devedor restante ficará registrado e a mora continuará acumulando sobre ele.\n\nO cliente pode ver o saldo devedor pelo portal.`,
  },
  {
    id: 'pag-3', categoryId: 'registrar-pagamentos',
    question: 'A parcela está com encargos por atraso. Como calcular o total?',
    answer: `O sistema calcula automaticamente. Ao selecionar a parcela atrasada, o valor exibido já inclui o valor original da parcela, a multa por atraso (aplicada uma vez no 1º dia) e a mora diária acumulada até hoje. Não é necessário calcular manualmente.`,
  },
  {
    id: 'pag-4', categoryId: 'registrar-pagamentos',
    question: 'Registrei um pagamento errado. Como estornar?',
    answer: `O caixa não pode estornar pagamentos diretamente. Entre em contato com o financeiro ou administrador via Comunicador Interno, informando urgência e os dados do pagamento (cliente, parcela, valor, data).\n\nO financeiro acessa Pagamentos → localiza o pagamento → clica em Estornar e confirma.`,
  },
  {
    id: 'pag-5', categoryId: 'registrar-pagamentos',
    question: 'O PIX foi pago mas não apareceu como confirmado. Por quê?',
    answer: `A confirmação do PIX é automática via integração com o Mercado Pago e geralmente ocorre em segundos. Se após 15 minutos não aparecer, pode ter ocorrido uma falha na comunicação com o Mercado Pago.\n\nInforme o financeiro via Comunicador Interno. O sistema tentará reprocessar automaticamente até 3 vezes. Em último caso, o financeiro pode registrar o pagamento manualmente.`,
  },
  {
    id: 'pag-6', categoryId: 'registrar-pagamentos',
    question: 'Como emitir um recibo de pagamento?',
    answer: `Imediatamente após registrar um pagamento, o sistema exibe a tela de confirmação com a opção "Imprimir recibo" ou "Baixar PDF".\n\nPara recibos de pagamentos anteriores: acesse Pagamentos no menu, localize o pagamento pelo nome do cliente ou data, clique nele e depois em "Ver recibo".`,
  },

  // ── Controle de Caixa ─────────────────────────────────────────────────────
  {
    id: 'cx-1', categoryId: 'controle-caixa',
    question: 'Como ver o saldo atual do caixa?',
    answer: `Acesse Caixa no menu lateral. O painel exibe o saldo atual em tempo real, as entradas e saídas do dia, e o resumo do mês. O saldo é atualizado automaticamente a cada transação registrada.`,
  },
  {
    id: 'cx-2', categoryId: 'controle-caixa',
    question: 'Como registrar uma entrada ou saída manual?',
    answer: `Acesse Caixa → Novo Lançamento. Selecione o tipo (Entrada ou Saída), informe o valor e descreva o motivo (obrigatório). Clique em Confirmar.\n\nUse lançamentos manuais para registrar operações que não são pagamentos de parcelas ou liberações de capital — como aportes de capital ou despesas operacionais.`,
  },
  {
    id: 'cx-3', categoryId: 'controle-caixa',
    question: 'O que é a conciliação bancária?',
    answer: `A conciliação é o processo de conferir se as transações registradas no sistema batem com o extrato bancário real. Acesse Conciliação no menu lateral, selecione o período e marque as transações já verificadas.\n\nEssa tela é acessível apenas para financeiro e admin.`,
  },
  {
    id: 'cx-4', categoryId: 'controle-caixa',
    question: 'A saída de capital foi registrada automaticamente?',
    answer: `Sim. Quando o caixa confirma a liberação de capital para um cliente, o sistema registra automaticamente uma saída no caixa com o valor, a data e a referência ao contrato. Não é necessário — nem correto — lançar manualmente uma saída separada para a mesma liberação.`,
  },

  // ── Configurações do Sistema ──────────────────────────────────────────────
  {
    id: 'cfg-1', categoryId: 'configuracoes-sistema',
    question: 'Como alterar a multa e mora padrão do sistema?',
    answer: `Acesse Configurações no menu lateral. Localize os campos "Multa por atraso" e "Mora diária". Altere os valores e clique em Salvar configurações.\n\nAtenção: as alterações afetam apenas novos contratos. Contratos existentes mantêm os percentuais vigentes na criação, exceto se alterados individualmente.`,
  },
  {
    id: 'cfg-2', categoryId: 'configuracoes-sistema',
    question: 'O que são os SLAs e como configurá-los?',
    answer: `SLAs são os prazos máximos para determinadas ações no sistema. Em Configurações, você pode ajustar: SLA de intenção (horas que o financeiro tem para analisar), SLA de aceite (dias que o cliente tem para assinar o contrato) e SLA de escalonamento (horas para alertar a 2ª instância em reparcelamentos).`,
  },
  {
    id: 'cfg-3', categoryId: 'configuracoes-sistema',
    question: 'Como definir o limite de reparcelamentos por contrato?',
    answer: `Acesse Configurações → campo "Limite de reparcelamentos". Informe o número máximo de reparcelamentos permitidos por contrato. Ao atingir esse limite, novos reparcelamentos só serão possíveis com aprovação da 2ª instância.`,
  },
  {
    id: 'cfg-4', categoryId: 'configuracoes-sistema',
    question: 'Como alterar o contato de suporte exibido aos usuários?',
    answer: `Acesse Configurações → campo "Contato de suporte". Informe o e-mail, telefone ou WhatsApp da equipe de suporte. Esse contato será exibido na tela de Ajuda para todos os operadores.`,
  },
  {
    id: 'cfg-5', categoryId: 'configuracoes-sistema',
    question: 'Como configurar a integração com o WhatsApp?',
    answer: `Acesse Configurações → Integrações → WhatsApp. Informe a URL da instância Evolution API, a chave de API e o nome da instância configurada no painel Evolution. Clique em Testar conexão para verificar se está funcionando antes de salvar.`,
  },
  {
    id: 'cfg-6', categoryId: 'configuracoes-sistema',
    question: 'Como configurar o servidor de e-mail (SMTP)?',
    answer: `Acesse Configurações → Integrações → E-mail. Informe o servidor SMTP, a porta, o e-mail remetente e a senha. O servidor padrão Hostinger usa smtp.hostinger.com na porta 465 com SSL. Clique em Testar conexão após salvar.`,
  },
  {
    id: 'cfg-7', categoryId: 'configuracoes-sistema',
    question: 'Como configurar o Mercado Pago?',
    answer: `Acesse Configurações → Integrações → Mercado Pago. Informe o Access Token de produção (obtido no painel do Mercado Pago). Configure também o webhook no painel do Mercado Pago apontando para: https://siafi.app.br/api/webhook/mp`,
  },
  {
    id: 'cfg-8', categoryId: 'configuracoes-sistema',
    question: 'Como definir os dias de antecedência de cobrança?',
    answer: `Acesse Configurações → campo "Dias de antecedência de cobrança". Informe quantos dias antes do vencimento o sistema deve enviar a cobrança automática (padrão: 3 dias). Esse valor pode ser sobrescrito contrato a contrato nas configurações individuais do contrato.`,
  },

  // ── Templates de E-mail ───────────────────────────────────────────────────
  {
    id: 'tpl-1', categoryId: 'templates-email',
    question: 'Como editar um template de e-mail?',
    answer: `Acesse Configurações → Templates de E-mail. Selecione o template na lista (ex: Boas-vindas, Cobrança, Aprovação). Edite o assunto e o corpo no editor. Use as variáveis disponíveis para personalizar. Clique em Salvar template.`,
  },
  {
    id: 'tpl-2', categoryId: 'templates-email',
    question: 'Quais variáveis posso usar nos templates?',
    answer: `As variáveis disponíveis são exibidas na lateral do editor ao abrir cada template. As principais são: {{nome_cliente}}, {{valor_parcela}}, {{data_vencimento}}, {{link_portal}}, {{link_aceite}} e {{nome_consultor}}. Cada template tem um conjunto específico de variáveis compatíveis.`,
  },
  {
    id: 'tpl-3', categoryId: 'templates-email',
    question: 'Como visualizar o e-mail antes de salvar?',
    answer: `Após editar o template, clique no botão "Visualizar". O sistema exibirá uma prévia do e-mail com as variáveis substituídas por valores de exemplo. Isso permite conferir a formatação e o layout antes de salvar.`,
  },
  {
    id: 'tpl-4', categoryId: 'templates-email',
    question: 'Como enviar um e-mail de teste?',
    answer: `Na tela de edição do template, clique em "Enviar teste". O sistema enviará o e-mail para o endereço do administrador logado, permitindo verificar como ele aparece em um cliente de e-mail real antes de ativar o template.`,
  },
  {
    id: 'tpl-5', categoryId: 'templates-email',
    question: 'Alterei o template mas os e-mails continuam iguais. Por quê?',
    answer: `Verifique se salvou corretamente após as alterações (botão "Salvar template"). Os e-mails são gerados no momento do envio, portanto e-mails já na fila de processamento podem usar a versão anterior do template. Novos envios usarão o template atualizado.`,
  },

  // ── Gestão de Usuários ────────────────────────────────────────────────────
  {
    id: 'usr-1', categoryId: 'gestao-usuarios',
    question: 'Como criar um novo operador?',
    answer: `Acesse Usuários → Novo Usuário. Informe o nome completo, o e-mail e o perfil de acesso (financeiro, caixa, consultor ou administrador). Uma senha provisória será gerada e enviada por e-mail ao operador. No primeiro acesso, ele deverá trocar a senha.`,
  },
  {
    id: 'usr-2', categoryId: 'gestao-usuarios',
    question: 'Como desativar o acesso de um operador?',
    answer: `Acesse Usuários → clique no operador → "Desativar conta" → confirme. O acesso é bloqueado imediatamente. Os dados, histórico e auditoria do operador são mantidos.\n\nPara reativar, acesse o mesmo perfil e clique em "Reativar conta".`,
  },
  {
    id: 'usr-3', categoryId: 'gestao-usuarios',
    question: 'Como resetar a senha de um operador?',
    answer: `Acesse Usuários → clique no operador → "Resetar senha". O sistema gera uma nova senha provisória e a envia por e-mail ao operador. No próximo acesso, ele precisará trocar a senha novamente.`,
  },
  {
    id: 'usr-4', categoryId: 'gestao-usuarios',
    question: 'Como verificar se um operador configurou o 2FA?',
    answer: `Na lista de Usuários, a coluna "2FA" indica o status de autenticação de cada operador: ativo (configurado) ou pendente (ainda não configurou). Operadores que ultrapassam o prazo sem configurar são bloqueados automaticamente pelo sistema.`,
  },
]

// ─── Top articles per role ────────────────────────────────────────────────────

const TOP_BY_ROLE: Record<string, string[]> = {
  admin:      ['lcap-1', 'pag-1', 'mfa-2', 'cfg-1', 'usr-2'],
  financeiro: ['ana-1', 'lib-2', 'pag-4', 'rep-1', 'lcap-1'],
  consultor:  ['int-1', 'int-3', 'cob-2', 'cart-2', 'rep-1'],
  caixa:      ['lcap-1', 'pag-1', 'pag-2', 'pag-4', 'lcap-3'],
  default:    ['pp-3', 'mfa-2', 'portal-1', 'int-1', 'pag-1'],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isVisible(item: { roles: Role[] }, role: string): boolean {
  if (item.roles.length === 0) return true
  return item.roles.includes(role as Role)
}

// ─── Accordion item ───────────────────────────────────────────────────────────

function ArticleItem({ article }: { article: Article }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-foreground hover:text-foreground/80"
      >
        <span>{article.question}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="pb-4">
          {article.answer.split('\n\n').map((paragraph, i) => (
            <p key={i} className="mb-2 text-sm leading-relaxed text-muted-foreground last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AjudaPage() {
  const { user } = useAuth()
  const router = useRouter()
  const role = user?.role ?? 'default'

  const [inputValue, setInputValue] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => setSearch(inputValue), 300)
    return () => clearTimeout(timer)
  }, [inputValue])

  // Reset category when searching
  useEffect(() => {
    if (search) setSelectedCategoryId(null)
  }, [search])

  const visibleCategories = useMemo(
    () => CATEGORIES.filter((c) => isVisible(c, role)),
    [role]
  )

  const topArticleIds = TOP_BY_ROLE[role] ?? TOP_BY_ROLE.default
  const topArticles = topArticleIds
    .map((id) => ARTICLES.find((a) => a.id === id))
    .filter(Boolean) as Article[]

  const selectedCategory = selectedCategoryId
    ? CATEGORIES.find((c) => c.id === selectedCategoryId)
    : null

  const categoryArticles = selectedCategoryId
    ? ARTICLES.filter((a) => a.categoryId === selectedCategoryId)
    : []

  const searchResults = search
    ? ARTICLES.filter(
        (a) =>
          isVisible(CATEGORIES.find((c) => c.id === a.categoryId)!, role) &&
          (a.question.toLowerCase().includes(search.toLowerCase()) ||
            a.answer.toLowerCase().includes(search.toLowerCase()))
      )
    : []

  return (
    <div className="mx-auto w-full space-y-10 px-4 py-8">

      {/* ── Header ── */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-foreground">Central de Ajuda</h1>
        <p className="text-muted-foreground">Encontre respostas para as dúvidas mais comuns do sistema.</p>
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="O que você precisa saber? Ex: como registrar pagamento"
          className="w-full rounded-xl border border-input bg-background py-3.5 pl-12 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* ── Search results ── */}
      {search && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            {searchResults.length > 0
              ? `${searchResults.length} resultado${searchResults.length !== 1 ? 's' : ''} para "${search}"`
              : `Nenhum resultado para "${search}"`}
          </h2>
          {searchResults.length > 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 divide-y divide-border">
              {searchResults.map((a) => (
                <ArticleItem key={a.id} article={a} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tente termos diferentes ou navegue pelas categorias abaixo.
            </p>
          )}
        </section>
      )}

      {/* ── Category detail ── */}
      {!search && selectedCategory && (
        <section className="space-y-4">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-4" />
            Voltar para categorias
          </button>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <selectedCategory.icon className="size-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">{selectedCategory.title}</h2>
              <p className="text-xs text-muted-foreground">{categoryArticles.length} artigos</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card px-6 divide-y divide-border">
            {categoryArticles.map((a) => (
              <ArticleItem key={a.id} article={a} />
            ))}
          </div>
          <button
            onClick={() => router.push('/suporte/novo')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <MessageSquare className="size-4" />
            Isso não respondeu minha dúvida — Abrir chamado de suporte
          </button>
        </section>
      )}

      {/* ── Home (no search, no category) ── */}
      {!search && !selectedCategory && (
        <>
          {/* Top articles */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Artigos mais consultados</h2>
            <div className="rounded-xl border border-border bg-card px-6 divide-y divide-border">
              {topArticles.map((a) => (
                <ArticleItem key={a.id} article={a} />
              ))}
            </div>
          </section>

          {/* Categories grid */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Categorias</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent group"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted group-hover:bg-muted/70">
                    <cat.icon className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{cat.title}</p>
                    <p className="text-xs text-muted-foreground">{cat.count} artigos</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Open ticket CTA */}
          <button
            onClick={() => router.push('/suporte/novo')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-4 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <MessageSquare className="size-4" />
            Não encontrou o que precisava? Abrir chamado de suporte
          </button>
        </>
      )}
    </div>
  )
}
