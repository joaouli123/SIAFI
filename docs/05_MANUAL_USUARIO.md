# SIAFI 2.0 — Manual do Usuário
**Versão 3.0 · Maio 2026 · Lidera Tecnologia e Gestão Ltda.**

> Encontre sua seção pelo perfil de acesso. Cada seção é independente — leia apenas a sua.

---

## SUMÁRIO

- [Seção Geral — Acesso e Primeiros Passos](#seção-geral--acesso-e-primeiros-passos)
- [Seção 1 — Manual do Consultor](#seção-1--manual-do-consultor)
- [Seção 2 — Manual do Financeiro](#seção-2--manual-do-financeiro)
- [Seção 3 — Manual do Caixa](#seção-3--manual-do-caixa)
- [Seção 4 — Manual do Administrador](#seção-4--manual-do-administrador)
- [Seção 5 — Manual do Cliente (Portal)](#seção-5--manual-do-cliente-portal)

---

## SEÇÃO GERAL — Acesso e Primeiros Passos

*Leia esta seção antes de qualquer outra. Vale para todos os perfis de acesso.*

### 1. Acesso ao Sistema

**Endereço de acesso (operadores internos):** `https://siafi.app.br`
**Endereço de acesso (clientes):** `https://siafi.app.br/portal`

**Fazer login com e-mail e senha:**

1. Acesse o endereço do sistema no navegador.
2. Digite seu **e-mail** no campo indicado.
3. Digite sua **senha**.
4. Clique em **Entrar**.
5. Se for seu primeiro acesso, o sistema solicitará a troca de senha obrigatória (veja a seção 2).
6. Se a autenticação em dois fatores estiver ativa, o sistema pedirá o código de 6 dígitos do aplicativo.

**Fazer login com Google:**

1. Na tela de login, clique em **Entrar com Google**.
2. Selecione ou confirme a conta Google vinculada ao seu cadastro no SIAFI.
3. Se o e-mail da conta Google não estiver cadastrado no sistema, o acesso será negado.

ℹ️ O login com Google só está disponível se o administrador tiver vinculado seu cadastro a uma conta Google.

---

### 2. Primeiro Acesso e Troca de Senha

1. Digite o e-mail e a senha provisória recebida.
2. O sistema exibirá automaticamente a tela de **Troca de Senha**.
3. Digite a nova senha — mínimo de 8 caracteres, com letras maiúsculas, minúsculas, números e símbolos.
4. Repita a nova senha no campo **Confirmar nova senha**.
5. Clique em **Salvar nova senha**.
6. O sistema redirecionará para a tela inicial.

⚠️ Nunca compartilhe sua senha. Cada operador deve ter seu próprio acesso individual.

---

### 3. Configuração da Autenticação em Dois Fatores

A autenticação em dois fatores (2FA) exige um código gerado pelo aplicativo **Google Authenticator** além da senha.

**Prazo obrigatório por perfil:**

| Perfil | Quando configurar |
|--------|------------------|
| Administrador | No primeiro acesso |
| Financeiro | No primeiro acesso |
| Consultor | No primeiro acesso |
| Caixa | Até o 5º login |
| Cliente (portal) | Até o 5º login |

**Passo a passo:**

1. Instale o **Google Authenticator** no celular (App Store ou Google Play — gratuito).
2. Faça login no SIAFI. O sistema exibirá um **QR Code**.
3. Abra o Google Authenticator → toque em **+** → **Escanear QR Code**.
4. Aponte a câmera para o QR Code na tela.
5. O aplicativo criará uma entrada **SIAFI** com um código de 6 dígitos.
6. Digite esse código no campo **Código de verificação** no SIAFI.
7. Clique em **Confirmar**.
8. Guarde o **código de recuperação** exibido em seguida em local seguro.
9. Clique em **Concluir configuração**.

✅ O código muda a cada 30 segundos. Digite-o assim que visualizá-lo.

⚠️ Se perder o acesso ao celular, entre em contato com o administrador do sistema para resetar a autenticação.

---

### 4. Navegação Geral

**Menu lateral:** exibe as opções disponíveis para o seu perfil. Em telas menores, pode ser recolhido clicando no ícone ☰.

**Barra superior (topbar):** exibe seu nome, o ícone de notificações com o contador de alertas não lidos, e o botão para sair.

**Notificações:** clique no ícone de sino para ver alertas recentes do sistema.

---

### 5. Como Sair do Sistema

1. Clique no seu nome ou ícone de usuário no canto superior direito.
2. Selecione **Sair**.
3. O sistema encerrará a sessão e redirecionará para a tela de login.

⚠️ Sempre saia do sistema ao terminar o uso, especialmente em computadores compartilhados.

---

### 6. Suporte Técnico

O contato de suporte técnico é definido pelo administrador do sistema. Acesse **Ajuda** no menu lateral para ver o contato atualizado, ou consulte seu gestor.

---

## SEÇÃO 1 — MANUAL DO CONSULTOR

*Esta seção é destinada exclusivamente ao perfil **Consultor**.*

---

### 1.1 Dashboard da Carteira

Ao fazer login, o consultor acessa o **Dashboard**, que exibe um resumo das atividades do dia.

| Card | O que representa |
|------|----------------|
| Clientes ativos | Total de clientes com contratos em andamento na sua carteira |
| Cobranças urgentes | Parcelas atrasadas que precisam de contato imediato |
| Intenções pendentes | Solicitações de empréstimo aguardando resposta do financeiro |
| Ações do dia | Tarefas prioritárias |

Clique em qualquer card para ir direto à lista correspondente.

---

### 1.2 Cadastrar Novo Cliente

1. No menu lateral, clique em **Clientes** → **Novo Cliente**.
2. Preencha os dados pessoais: nome completo, CPF, data de nascimento, telefone, e-mail.
3. Preencha o endereço completo: CEP, rua, número, bairro, cidade, estado.
4. Anexe os documentos obrigatórios:
   - Foto do cliente (JPG ou PNG)
   - Documento de identidade — RG ou CNH (frente e verso)
   - Comprovante de residência recente (conta de luz, água ou telefone)
5. Clique em **Salvar Cliente**.

ℹ️ Os dados do cliente são protegidos pela LGPD. Não compartilhe informações de clientes por canais não autorizados.

✅ Após cadastrar, ative o portal do cliente para que ele possa acompanhar os contratos pelo celular.

---

### 1.3 Minha Carteira

Acesse **Clientes** no menu para ver todos os clientes vinculados ao seu perfil.

| Filtro | O que mostra |
|--------|-------------|
| Todos | Todos os clientes da carteira |
| Ativos | Clientes com contratos em andamento |
| Atrasados | Clientes com parcelas vencidas |
| Quitados | Clientes sem contratos em aberto |

Digite o nome ou CPF no campo de busca para localizar rapidamente.

---

### 1.4 Detalhe do Cliente

Clique em um cliente para acessar o perfil completo:

- **Dados pessoais** — nome, CPF, contato, endereço
- **Documentos** — arquivos enviados no cadastro
- **Contratos** — lista com status e progresso de cada contrato
- **Score de crédito** — pontuação interna de risco (0 a 100)
- **Histórico de cobranças** — contatos registrados anteriormente

**Ativar o portal do cliente:**
1. Na tela de detalhe do cliente, clique em **Ativar Portal**.
2. O sistema enviará um e-mail de boas-vindas ao cliente com o link e as instruções de primeiro acesso.

ℹ️ O portal só pode ser ativado após o cadastro completo com documentos.

---

### 1.5 Criar Intenção de Empréstimo

A intenção é a solicitação formal para que o financeiro analise e aprove um novo contrato.

1. Acesse o perfil do cliente ou clique em **Intenções** → **Nova Intenção**.
2. Selecione o cliente.
3. Preencha:
   - Valor do capital solicitado
   - Número de parcelas desejadas
   - Dia de vencimento preferido
   - Finalidade do empréstimo
   - Observações relevantes
4. Clique em **Enviar para Análise**.

⚠️ O financeiro tem até **24 horas** para analisar. Após esse prazo, a intenção expira automaticamente e é necessário criar uma nova.

---

### 1.6 Acompanhar Intenção de Empréstimo

Acesse **Intenções** no menu para ver todas as suas solicitações.

| Status | Significado |
|--------|------------|
| Aguardando análise | Na fila do financeiro |
| Em análise | O financeiro está revisando |
| Aprovada | Contrato gerado, aguardando assinatura do cliente |
| Rejeitada | Não aprovada — o motivo está registrado na tela |
| Expirada | Prazo de 24h passou sem resposta — crie uma nova |

**Se a intenção for rejeitada:** clique nela para ver o motivo, ajuste as condições e crie uma nova intenção.

**Se a intenção expirar:** crie uma nova. O histórico da expirada é mantido para referência.

---

### 1.7 Solicitações ao Financeiro

Use este módulo para pedidos que não se encaixam no fluxo de intenção de empréstimo.

**Tipos disponíveis:** análise de crédito especial, reparcelamento urgente, consulta sobre contrato, outros assuntos operacionais.

1. Clique em **Solicitações** → **Nova Solicitação**.
2. Selecione o tipo e a urgência: Normal, Alta ou Urgente.
3. Descreva o pedido com detalhes.
4. Clique em **Enviar**.

Acompanhe as respostas do financeiro na mesma tela.

---

### 1.8 Cobranças da Carteira

A tela **Cobranças** lista as parcelas atrasadas dos seus clientes com prioridade de contato.

**Registrar um contato de cobrança:**
1. Clique na parcela atrasada → **Registrar Contato**.
2. Selecione o canal: telefone, WhatsApp ou visita presencial.
3. Registre o resultado:
   - Cliente contactado — pagamento prometido para [data]
   - Sem contato — tentar novamente
   - Cliente solicitou reparcelamento
4. Clique em **Salvar**.

✅ Mantenha o histórico de cobranças atualizado. O financeiro monitora as tentativas ao analisar pedidos de reparcelamento.

---

### 1.9 Gerar PIX para o Cliente

1. Acesse o perfil do cliente ou a tela **PIX** no menu.
2. Selecione o cliente e a parcela desejada.
3. Clique em **Gerar QR Code PIX**.
4. Compartilhe o QR Code ou o código copia-e-cola com o cliente.

ℹ️ O QR Code PIX é válido por 24 horas. Após esse prazo, gere um novo.

---

### 1.10 Comunicador Interno

O comunicador permite trocar mensagens com outros operadores (financeiro, admin, caixa).

1. Clique em **Mensagens** no menu lateral.
2. Clique em **Nova Conversa** e selecione o destinatário.
3. Digite a mensagem e pressione **Enter** ou clique em **Enviar**.
4. Para anexar um documento, clique no ícone de clipe e selecione o arquivo.

ℹ️ O comunicador é exclusivamente para uso interno — não é visível para clientes.

---

### 1.11 Dúvidas Frequentes do Consultor

**O cliente não recebeu o e-mail de ativação do portal. O que fazer?**
Acesse o perfil do cliente e clique em **Reenviar e-mail de ativação**. Se persistir, verifique se o e-mail cadastrado está correto.

**Posso editar uma intenção de empréstimo após enviar?**
Não. Após o envio, a intenção entra na fila do financeiro e não pode ser editada. Se precisar de alterações, use o Comunicador Interno ou aguarde a resposta para criar uma nova intenção.

**Como sei se o cliente assinou o contrato?**
No perfil do cliente, o status do contrato muda para **Ativo** após a assinatura e a liberação do capital. Enquanto aguarda a assinatura, aparece como **Aguardando aceite**.

**O score do cliente está baixo. Posso criar uma intenção mesmo assim?**
Sim. O score é um indicador de risco, mas a decisão é do financeiro. Inclua nas observações informações que justifiquem a aprovação.

**Como solicitar reparcelamento para um cliente?**
Acesse **Reparcelamentos** → **Nova Solicitação**, selecione o cliente e o contrato, descreva as condições desejadas. O financeiro analisará e enviará uma proposta.

**A cobrança automática foi enviada mas o cliente diz que não recebeu. O que fazer?**
Verifique no perfil do cliente se o e-mail e o WhatsApp estão corretos. Se desatualizados, corrija o cadastro e solicite ao financeiro o reenvio manual.

---

## SEÇÃO 2 — MANUAL DO FINANCEIRO

*Esta seção é destinada ao perfil **Financeiro**.*

---

### 2.1 Dashboard Financeiro

| Card | O que mostra |
|------|-------------|
| Intenções pendentes | Solicitações de novos contratos aguardando análise, com SLA visível |
| Liberações pendentes | Contratos assinados aguardando confirmação de entrega do capital |
| Contratos em atraso | Total de contratos com parcelas vencidas |
| Faturamento do mês | Total recebido no mês corrente |

**Fila SLA:** exibe intenções ordenadas pelo tempo restante para análise. Itens próximos do prazo aparecem em amarelo ou vermelho.

**Liberações pendentes:** lista contratos já assinados pelo cliente que aguardam confirmação da entrega do capital pelo caixa.

---

### 2.2 Analisar Intenção de Empréstimo

1. Acesse **Intenções** → clique em uma intenção com status **Aguardando análise**.
2. Revise: dados do cliente, score de crédito (com histórico de pontualidade), valor solicitado, parcelas, dia de vencimento, observações do consultor.

**Para aprovar:**
1. Clique em **Aprovar**.
2. Defina os termos finais: valor do capital, valor da parcela, número de parcelas, dia de vencimento, dias de antecedência para cobrança automática.
3. Clique em **Confirmar aprovação**.
4. O sistema gera o contrato e o envia ao cliente para assinatura digital.

**Para rejeitar:**
1. Clique em **Rejeitar**.
2. Selecione o motivo:
   - Score de risco insuficiente
   - Capacidade de pagamento comprometida
   - Documentação incompleta
   - Contrato anterior em aberto
   - Outros (campo livre)
3. Clique em **Confirmar rejeição**. O consultor recebe notificação com o motivo.

**Critérios de aprovação sugeridos:**
- Score acima de 60 pontos
- Sem parcelas em atraso em contratos ativos
- Documentação completa e atualizada
- Capacidade de pagamento compatível com o valor da parcela

---

### 2.3 Liberações Pendentes

Após a assinatura digital do cliente, o contrato entra em **Aguardando liberação**. O caixa confirma a entrega; o financeiro acompanha e orienta o processo.

Para ver: acesse **Dashboard** → card **Liberações pendentes**, ou filtre em **Contratos** por **Aguardando liberação**.

⚠️ A saída de capital no caixa é registrada **automaticamente** quando o caixa confirma a entrega. Não é necessário lançamento manual separado.

---

### 2.4 Solicitações dos Consultores

1. Acesse **Solicitações** no menu → clique na solicitação.
2. Leia o pedido e clique em **Responder**.
3. Digite o retorno e, se necessário, mude o status para **Em análise** ou **Resolvida**.
4. O consultor recebe notificação com a resposta.

---

### 2.5 Criar Contrato Direto

Para criar um contrato sem passar pelo fluxo de intenção:

1. Acesse **Empréstimos** → **Novo Contrato**.
2. Selecione o cliente.
3. Preencha:
   - **Capital a ser entregue** — valor que o cliente receberá
   - **Valor da parcela** — define o acréscimo total automaticamente
   - **Número de parcelas**
   - **Data de início** (primeira parcela)
   - **Dia de vencimento fixo**
   - **Dias de antecedência para cobrança** (editável, padrão do sistema)
   - **Observações**
4. Confira o resumo no simulador inline (parcelas, total a receber, acréscimo).
5. Clique em **Criar Contrato**.

ℹ️ Os valores internos de divisão do contrato são gerenciados pelo sistema. O caixa visualiza apenas o valor total de cada parcela.

---

### 2.6 Simulador de Reparcelamento

1. Acesse **Reparcelamentos** → **Nova Proposta** (ou abra um reparcelamento existente).
2. O sistema exibe o saldo devedor atual e os encargos acumulados.
3. Informe o novo número de parcelas e o novo valor de parcela.
4. O simulador exibe o novo total a receber e a variação em relação ao contrato original.
5. Clique em **Enviar proposta** para encaminhar ao cliente.

---

### 2.7 Reparcelamento — Segunda Instância

Reparcelamentos que excedem limites configuráveis precisam de uma segunda aprovação.

1. Acesse **Reparcelamentos** → filtre por **Aguardando 2ª aprovação**.
2. Revise a proposta.
3. Aprove ou rejeite com justificativa.
4. Após aprovação final, o sistema aguarda o aceite digital do cliente para executar.

---

### 2.8 Configurações por Contrato

Cada contrato pode ter parâmetros individuais diferentes do padrão global.

| Parâmetro | O que define |
|-----------|-------------|
| Multa por atraso | % aplicada no 1º dia de atraso |
| Mora diária | % aplicada por dia adicional de atraso |
| Dia de vencimento | Dia fixo das parcelas |
| Dias de antecedência | Quando enviar a cobrança automática antes do vencimento |

Para alterar: acesse o contrato → **Configurações do contrato** → altere e salve.

---

### 2.9 Gerenciar Clientes e Portal

- **Ativar portal:** perfil do cliente → **Ativar Portal** → confirme.
- **Desativar portal:** mesma tela → **Desativar Portal** → confirme.

⚠️ Ao desativar, o cliente perde o acesso imediatamente.

---

### 2.10 Carteira Global e Inadimplentes

Acesse **Inadimplentes** para ver todos os clientes com parcelas vencidas, independentemente do consultor responsável.

Filtros disponíveis: por consultor, faixa de dias em atraso, valor em aberto.

---

### 2.11 Relatórios

| Relatório | O que mostra |
|-----------|-------------|
| Carteira | Capital total em carteira, valor a receber, capital em risco |
| Faturamento | Recebimentos por mês, com detalhamento por consultor |
| Aging de inadimplência | Distribuição dos atrasos por faixa (0–30, 31–60, 61–90, 90+ dias) |
| Movimentação | Entradas e saídas do caixa no período |
| Contratos | Lista de contratos com filtro por status |

Cada relatório tem um botão **Exportar** (PDF ou Excel).

---

### 2.12 Caixa

1. Acesse **Caixa** no menu.
2. O painel exibe saldo atual, entradas e saídas do dia e total do mês.
3. **Novo lançamento manual:** clique em **Novo Lançamento** → selecione tipo (entrada/saída) → descreva o motivo → confirme.
4. **Conciliação:** acesse a aba **Conciliação** e marque as transações conferidas.

---

### 2.13 Comunicador e Notificações

- **Comunicador:** acesse **Mensagens** para trocar mensagens com consultores e demais operadores.
- **Notificações:** ícone de sino na topbar — alertas automáticos de pagamentos recebidos, intenções enviadas e reparcelamentos pendentes.

---

### 2.14 Dúvidas Frequentes do Financeiro

**Como identificar intenções próximas do prazo?**
A seção **Fila SLA** no Dashboard exibe intenções ordenadas por tempo restante. Menos de 2 horas aparece em vermelho.

**O que acontece se uma intenção expirar sem análise?**
O sistema cancela automaticamente e notifica o consultor. Nenhum contrato é gerado. O consultor deve criar uma nova intenção.

**Posso alterar o valor da parcela de um contrato após a assinatura?**
Não. Após a assinatura digital, os valores são imutáveis. Para alterar condições, é necessário um reparcelamento.

**Como registrar um pagamento recebido fora do sistema (dinheiro/TED)?**
Acesse **Pagamentos** → **Novo Pagamento** → selecione o cliente, o contrato e a parcela → informe o valor e o método de pagamento → confirme.

**Como calcular os encargos por atraso de uma parcela?**
O sistema calcula automaticamente. Ao abrir a parcela atrasada, o valor exibido já inclui multa e mora acumulada até o dia atual.

**Como conceder desconto nos encargos por atraso?**
Registre o pagamento pelo valor acordado. Se inferior ao calculado, o sistema registrará o saldo devedor restante. Isenções globais são configuradas pelo administrador.

---

## SEÇÃO 3 — MANUAL DO CAIXA

*Esta seção é destinada ao perfil **Caixa**.*

---

### 3.1 Dashboard do Caixa

| Item | Descrição |
|------|-----------|
| Liberações pendentes | Contratos aguardando confirmação de entrega do capital |
| Parcelas do dia | Vencimentos de hoje e parcelas em atraso |
| Saldo atual | Saldo disponível em tempo real |
| Últimas movimentações | Entradas e saídas recentes |

---

### 3.2 Liberar Capital ⚠️

A liberação confirma que o dinheiro foi entregue ao cliente. Esta ação é **irreversível** — a saída é registrada automaticamente no caixa no momento da confirmação.

**Quando liberar:** somente após o cliente ter assinado digitalmente o contrato. O sistema só exibe contratos com status **Aguardando liberação**.

**Passo a passo:**

1. No Dashboard ou em **Contratos**, filtre por **Aguardando liberação**.
2. Clique no contrato desejado e verifique o valor do capital a ser entregue.
3. Clique em **Confirmar entrega do capital**.
4. Selecione o método de entrega: dinheiro em espécie, TED/PIX ou outros.
5. Informe a **data efetiva da entrega** (pode diferir da data atual se a entrega já ocorreu).
6. Opcionalmente, anexe o comprovante de transferência.
7. Clique em **Confirmar liberação**.

⚠️ A saída de capital é registrada automaticamente. Confirme apenas após a entrega ter ocorrido de fato. Esta ação não pode ser desfeita sem o administrador.

✅ O sistema envia notificação automática ao cliente confirmando o início do contrato e a data da primeira parcela.

---

### 3.3 Registrar Pagamento

1. Acesse **Pagamentos** → **Novo Pagamento**.
2. Busque o cliente pelo CPF ou nome.
3. Selecione o contrato (se houver mais de um em aberto).
4. Selecione a parcela a ser paga (exibidas em ordem de vencimento).
5. Verifique o valor:
   - Parcela em dia: valor normal da parcela.
   - Parcela atrasada: valor com **encargos por atraso** já calculados.
6. Informe o valor recebido.
7. Selecione o método: dinheiro, PIX, TED ou boleto.
8. Clique em **Registrar pagamento**.
9. O sistema confirma e exibe o recibo.

---

### 3.4 Entender Encargos em Parcelas Atrasadas

O sistema calcula automaticamente — você não precisa calcular manualmente.

O valor exibido já inclui:
- **Valor original da parcela** — valor fixo do contrato
- **Multa por atraso** — percentual aplicado uma única vez no 1º dia de atraso
- **Mora diária** — percentual aplicado por cada dia adicional de atraso

---

### 3.5 Pagamento Parcial

Se o cliente pagar menos que o valor integral:

1. No campo **Valor recebido**, informe o valor parcial.
2. O sistema registra o pagamento e atribui o status **Parcialmente pago** à parcela.
3. O **saldo devedor** restante é exibido na parcela.
4. A mora continua acumulando sobre o saldo devedor até a quitação total.

ℹ️ O cliente pode ver o saldo devedor pelo portal. O sistema atualiza automaticamente.

---

### 3.6 Recibo Pós-Pagamento

- **Imediato:** após confirmar o pagamento, clique em **Imprimir recibo** ou **Baixar PDF**.
- **Pagamentos anteriores:** acesse **Pagamentos** no menu → localize o pagamento → **Ver recibo**.

---

### 3.7 Parcelas do Dia

Acesse **Parcelas** no menu para ver os vencimentos de hoje e as parcelas em atraso.

| Coluna | Descrição |
|--------|-----------|
| Cliente | Nome do cliente |
| Parcela | Número da parcela no contrato |
| Vencimento | Data de vencimento |
| Valor | Valor a cobrar (com encargos, se atrasada) |
| Status | Pendente / Atrasada / Parcialmente pago |

Clique em qualquer parcela para registrar o pagamento diretamente.

---

### 3.8 Consultar Cliente (Somente Leitura)

O caixa pode consultar o perfil do cliente, mas não pode editar dados cadastrais.

**O que o caixa vê:** dados pessoais, contratos, parcelas, histórico de pagamentos.

**O que o caixa não vê:** valores internos de divisão do contrato, score de crédito, intenções e solicitações de empréstimo.

---

### 3.9 Saldo e Movimentações do Caixa

Acesse **Caixa** no menu:

- **Saldo atual** — valor disponível em tempo real
- **Entradas do dia** — pagamentos recebidos e lançamentos de entrada
- **Saídas do dia** — liberações de capital e lançamentos de saída
- **Extrato** — histórico completo com filtro por data

---

### 3.10 Lançamentos Manuais

Para entradas e saídas que não são pagamentos de parcelas nem liberações de capital:

1. Acesse **Caixa** → **Novo Lançamento**.
2. Selecione o tipo: **Entrada** ou **Saída**.
3. Informe o valor e descreva o motivo (obrigatório).
4. Clique em **Confirmar**.

---

### 3.11 Dúvidas Frequentes do Caixa

**Como sei quais contratos aguardam liberação de capital?**
O card **Liberações pendentes** no Dashboard exibe a lista. Também é possível filtrar em **Contratos** por **Aguardando liberação**.

**Confirmei uma liberação com a data errada. O que fazer?**
Informe o financeiro ou administrador imediatamente. A data afeta os vencimentos das parcelas e não pode ser alterada pelo caixa.

**O cliente pagou o valor errado e o pagamento já foi registrado. Como corrigir?**
O caixa não pode estornar pagamentos. Solicite o estorno ao financeiro ou administrador via **Mensagens**, informando urgência.

**A parcela tem encargos, mas o cliente quer pagar só o valor original. O que fazer?**
Somente o financeiro ou administrador pode autorizar desconto em encargos. Registre o valor recebido normalmente — o sistema calculará o saldo devedor.

**Como emitir o recibo de um pagamento feito ontem?**
Acesse **Pagamentos** no menu, localize pelo nome do cliente ou data, clique no pagamento → **Ver recibo**.

**O PIX foi pago mas não apareceu confirmado. O que fazer?**
A confirmação automática pode levar alguns minutos. Se após 15 minutos não aparecer, informe o financeiro via **Mensagens** para verificar a integração.

---

## SEÇÃO 4 — MANUAL DO ADMINISTRADOR

*O administrador tem acesso a todas as funcionalidades do financeiro (Seção 2) mais as funções exclusivas documentadas aqui.*

---

### 4.1 Gerenciar Operadores

Acesse **Usuários** no menu para ver todos os operadores cadastrados.

**Criar novo operador:**
1. Clique em **Novo Usuário**.
2. Preencha: nome completo, e-mail, perfil de acesso (financeiro, caixa, consultor ou administrador).
3. Uma senha provisória é gerada e enviada por e-mail ao operador.
4. Clique em **Criar usuário**.

**Editar operador:** clique no nome → altere os dados → **Salvar alterações**.

**Ativar/desativar:**
- Desativar: clique no operador → **Desativar conta** → confirme.
- Reativar: mesma tela → **Reativar conta**.

**Resetar senha:** clique no operador → **Resetar senha** → nova senha provisória enviada por e-mail.

⚠️ Desativar um operador bloqueia o acesso imediatamente. Dados e histórico são mantidos.

**Monitorar autenticação em dois fatores:** a coluna **2FA** na lista indica quem já configurou. Operadores sem 2FA dentro do prazo são bloqueados automaticamente.

---

### 4.2 Criar Consultor e Vincular à Carteira

1. Acesse **Usuários** → **Novo Usuário** → selecione o perfil **Consultor**.
2. Preencha os dados e crie o usuário.
3. Acesse o perfil do consultor criado → aba **Carteira**.
4. Vincule os clientes manualmente ou transfira de outro consultor.

ℹ️ Clientes sem consultor vinculado ficam na carteira geral, visível apenas para financeiro e admin.

---

### 4.3 Configurações do Sistema

Acesse **Configurações** no menu para gerenciar os parâmetros globais.

| Parâmetro | Descrição |
|-----------|-----------|
| Multa por atraso | % aplicada no 1º dia de atraso |
| Mora diária | % por dia de atraso após o 1º |
| SLA de intenção | Horas para o financeiro analisar uma intenção |
| SLA de aceite | Dias para o cliente assinar o contrato |
| SLA de escalonamento | Horas para alertar a 2ª instância |
| Limite de reparcelamentos | Máximo por contrato |
| Contratos por cliente | Máximo de contratos ativos simultâneos |
| Dias de antecedência de cobrança | Padrão de envio antes do vencimento |
| Contato de suporte | E-mail/telefone exibido na tela de ajuda |

Para alterar: clique no campo → altere → **Salvar configurações**.

⚠️ Alterações globais afetam novos contratos. Contratos existentes mantêm os parâmetros vigentes na criação, exceto quando alterados individualmente no contrato.

---

### 4.4 Templates de E-mail

O sistema envia e-mails automáticos em 13 situações. O administrador pode personalizar cada template.

1. Acesse **Configurações** → **Templates de E-mail**.
2. Selecione o template (ex: Boas-vindas, Cobrança, Aprovação de contrato).
3. Edite o assunto e o corpo no editor.
4. Use as **variáveis disponíveis** listadas na lateral:
   - `{{nome_cliente}}` — nome do cliente
   - `{{valor_parcela}}` — valor da próxima parcela
   - `{{data_vencimento}}` — data de vencimento
   - `{{link_portal}}` — link do portal do cliente
5. Clique em **Visualizar** para conferir como ficará o e-mail.
6. Clique em **Enviar teste** para receber o e-mail no seu endereço.
7. Clique em **Salvar template**.

---

### 4.5 Auditoria

Acesse **Auditoria** para ver o registro completo de todas as ações realizadas no sistema.

| Filtro | Opções |
|--------|--------|
| Usuário | Selecionar operador específico |
| Ação | Criar, editar, excluir, aprovar, rejeitar, etc. |
| Entidade | Cliente, contrato, parcela, pagamento, etc. |
| Data | Período inicial e final |

ℹ️ O log de auditoria é imutável. Nenhuma ação registrada pode ser alterada ou excluída.

---

### 4.6 Configurações de Integração

Acesse **Configurações** → **Integrações**.

**WhatsApp (Evolution API):** URL da API, chave de API, nome da instância.

**Mercado Pago (PIX):** Access Token de produção e URL do webhook (configurar também no painel do Mercado Pago).

**E-mail (SMTP):** servidor, porta, e-mail remetente e senha.

✅ Use o botão **Testar conexão** após salvar para verificar se cada integração está funcionando.

---

### 4.7 Dúvidas Frequentes do Administrador

**Como desativar o acesso de um operador que saiu da empresa?**
Acesse **Usuários** → clique no operador → **Desativar conta**. O acesso é bloqueado imediatamente. Dados e histórico são mantidos.

**Um operador não está recebendo e-mails do sistema. O que verificar?**
Confirme as configurações SMTP em **Configurações** → **Integrações** → **E-mail** e verifique se o e-mail do operador está correto no cadastro.

**Como alterar o contato de suporte exibido para os usuários?**
Acesse **Configurações** → campo **Contato de suporte** → atualize e salve.

**Posso ter mais de um administrador no sistema?**
Sim. Basta criar o usuário com o perfil **Administrador**. Todos os administradores têm acesso completo.

**Como exportar o log de auditoria?**
Na tela de **Auditoria**, aplique os filtros desejados e clique em **Exportar** (CSV ou PDF).

---

## SEÇÃO 5 — MANUAL DO CLIENTE (PORTAL)

*Esta seção é destinada ao **Cliente** que acessa o portal de autoatendimento.*

---

### 5.1 Acesso ao Portal

**Endereço do portal:** `https://siafi.app.br/portal`

Você recebe o acesso por e-mail quando a empresa ativa sua conta. O e-mail contém o link e as instruções de primeiro acesso.

**Primeiro acesso:**
1. Acesse o link recebido por e-mail ou o endereço do portal diretamente.
2. Digite o e-mail e a senha temporária informada no e-mail.
3. O sistema solicitará a troca de senha: mínimo de 8 caracteres, com letras maiúsculas, minúsculas e números.
4. Confirme a nova senha e clique em **Salvar**.
5. O sistema redirecionará para a tela inicial do portal.

**Logins seguintes:** acesse o portal, digite e-mail e senha. Se a autenticação em dois fatores estiver ativa, insira o código do aplicativo.

⚠️ Se não recebeu o e-mail de acesso, verifique a pasta de spam. Se não encontrar, entre em contato com a empresa.

---

### 5.2 Autenticação em Dois Fatores para Clientes

A autenticação em dois fatores (2FA) protege sua conta contra acessos não autorizados. **Você tem até 5 logins para configurar.** Após esse prazo, o acesso é bloqueado até a configuração ser concluída.

**Como configurar:**
1. Instale o **Google Authenticator** no celular (App Store ou Google Play — gratuito).
2. Faça login no portal. O sistema exibirá um **QR Code**.
3. Abra o Google Authenticator → toque em **+** → **Escanear QR Code**.
4. Aponte a câmera para o QR Code na tela.
5. O aplicativo exibirá um código de 6 dígitos com o nome **SIAFI**.
6. Digite o código no campo indicado e clique em **Confirmar**.
7. Guarde o **código de recuperação** em local seguro.

**Se perder o acesso ao celular:** entre em contato com a empresa para que o administrador possa resetar sua autenticação.

---

### 5.3 Meus Contratos

A tela inicial do portal exibe todos os seus contratos.

| Campo | Descrição |
|-------|-----------|
| Situação | Ativo, Aguardando aceite, Quitado, Cancelado |
| Progresso | Barra com % das parcelas já pagas |
| Próximo vencimento | Data e valor da próxima parcela |

| Status | O que significa |
|--------|----------------|
| Aguardando aceite | Aprovado, mas precisa da sua assinatura digital |
| Ativo | Em andamento, com parcelas a pagar |
| Quitado | Todas as parcelas foram pagas |
| Cancelado | O contrato foi cancelado |

Clique em qualquer contrato para ver os detalhes e a lista completa de parcelas.

---

### 5.4 Ver Parcelas

Na tela de detalhe do contrato, a aba **Parcelas** exibe todas as parcelas.

| Status | O que significa |
|--------|----------------|
| Pendente | Ainda não venceu |
| Pago | Pago integralmente |
| Parcialmente pago | Pagamento parcial registrado — há saldo devedor |
| Atrasado | Passou do vencimento sem pagamento integral |

Parcelas atrasadas exibem o **valor atualizado com encargos**, calculado automaticamente.

---

### 5.5 Pagar com PIX

1. Acesse o contrato → clique na parcela que deseja pagar.
2. Clique em **Gerar QR Code PIX**.
3. O sistema exibirá o QR Code, o **código copia-e-cola**, o valor total e o prazo de validade (24 horas).
4. Abra o aplicativo do seu banco.
5. Escolha pagar com PIX: escaneie o QR Code **ou** cole o código copia-e-cola.
6. Confirme o pagamento no aplicativo do banco.
7. O sistema confirmará automaticamente em alguns minutos.

ℹ️ Após o pagamento, a parcela muda para **Pago** no portal. Se demorar mais de 15 minutos, entre em contato com a empresa.

⚠️ O QR Code expira em 24 horas. Se expirar, gere um novo na mesma tela.

---

### 5.6 Solicitar Reparcelamento

Se estiver com dificuldades para pagar as parcelas no valor atual:

1. Acesse o contrato → clique em **Solicitar Reparcelamento**.
2. Descreva sua situação e o que propõe (novo valor de parcela, novo número de parcelas).
3. Clique em **Enviar solicitação**.
4. Quando receber a proposta, acesse **Reparcelamentos** → visualize os novos termos → clique em **Aceitar** ou **Recusar**.

ℹ️ A aceitação é feita digitalmente e tem validade legal. Leia os novos termos com atenção antes de aceitar.

---

### 5.7 Solicitar Boleto Atualizado

1. Acesse o contrato → clique na parcela desejada.
2. Clique em **Solicitar boleto**.
3. O boleto é gerado e disponibilizado para download em PDF.

ℹ️ O boleto já inclui todos os encargos calculados até a data de vencimento do boleto. Pague até a data indicada para que o valor seja válido.

---

### 5.8 Histórico de Pagamentos

Acesse **Meus Pagamentos** no menu do portal para ver todos os pagamentos registrados.

| Campo | Descrição |
|-------|-----------|
| Data | Data em que o pagamento foi registrado |
| Parcela | Qual parcela foi paga |
| Valor pago | Valor registrado |
| Método | PIX, dinheiro, TED, boleto |

Clique em qualquer pagamento para ver o comprovante.

---

### 5.9 Abrir Chamado de Suporte

1. Acesse **Suporte** → **Novo Chamado**.
2. Selecione o tipo:
   - Dúvida sobre meu contrato
   - Problema com pagamento PIX
   - Erro no portal
   - Solicitação de boleto
   - Outros
3. Descreva o problema com detalhes.
4. Clique em **Enviar chamado**.
5. Acompanhe o status e as respostas em **Suporte** → **Meus chamados**.

---

### 5.10 Meu Perfil

Acesse **Perfil** no menu do portal.

- **Alterar senha:** clique em **Alterar senha** → informe a senha atual → defina e confirme a nova → salve.
- **Autenticação em dois fatores:** desativar ou reconfigurar o Google Authenticator.
- **Preferências de notificação:** escolha como receber alertas (e-mail, WhatsApp ou ambos).

---

### 5.11 Dúvidas Frequentes do Cliente

**Não recebi o e-mail de ativação do portal. O que fazer?**
Verifique a pasta de spam. Se não encontrar, entre em contato com a empresa para que reenviem o e-mail de acesso.

**Esqueci minha senha. Como recuperar?**
Na tela de login do portal, clique em **Esqueci minha senha**, informe seu e-mail cadastrado e siga as instruções enviadas.

**O QR Code PIX expirou. O que fazer?**
Acesse a parcela novamente e clique em **Gerar QR Code PIX** para criar um novo.

**Paguei mas a parcela ainda aparece como "Atrasada". O que fazer?**
A confirmação do PIX pode levar alguns minutos. Se após 15 minutos a parcela não mudar de status, abra um chamado de suporte com o comprovante do pagamento.

**Como assinar digitalmente meu contrato?**
Quando o contrato estiver com status **Aguardando aceite**, acesse o contrato → clique em **Revisar e Assinar** → leia os termos → clique em **Assinar contrato**. Você receberá confirmação por e-mail.

**Posso ter mais de um contrato ativo ao mesmo tempo?**
Isso depende da política da empresa. Em caso de dúvida, abra um chamado de suporte.

**Como saber quanto ainda devo no meu contrato?**
Acesse o contrato → aba **Parcelas** → o sistema exibe todas as parcelas pendentes e o valor total em aberto. Parcelas **Parcialmente pagas** exibem o saldo devedor individual.

**Meus dados de contato mudaram. Como atualizar?**
Abra um chamado de suporte com os novos dados. A atualização do cadastro é feita pela empresa.

---

*Manual do Usuário SIAFI 2.0 · Versão 3.0 · Maio 2026*
*Lidera Tecnologia e Gestão Ltda. · Mantido pela equipe SIAFI*
