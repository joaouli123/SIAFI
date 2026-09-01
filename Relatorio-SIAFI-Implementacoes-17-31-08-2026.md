# SIAFI 2.0 - Relatorio de Implementacoes e Correcoes

Empresa: Lidera Tecnologia e Gestao
Sistema: SIAFI - Sistema Integrado de Apoio Financeiro
Periodo: 17 a 31 de agosto de 2026
Data: 31/08/2026 (fechamento da quinzena)
Referencia: Sequencia ao relatorio quinzenal de 01 a 17/08/2026

## Resumo

Este documento registra as implementacoes e correcoes realizadas apos o relatorio
quinzenal anterior. Itens ja apresentados e somados no relatorio de 01 a 17/08/2026
(comissoes e apuracao de parcelas, tabelas do sistema e filtro de consultor em
Parcelas) nao foram repetidos aqui.

## Implementacoes

| Item | Descricao | Valor |
| --- | --- | ---: |
| Campos de selecao com digitacao em todo o sistema | Todo campo que escolhe um item de uma lista passou a abrir a lista ao ser clicado e a aceitar digitacao para filtrar. A busca localiza por nome ou por CPF, ignorando maiusculas/minusculas e a pontuacao do CPF. Substituiu o menu suspenso antigo, em que era preciso rolar a lista inteira para achar o cliente. Aplicado nas telas de Cobrancas, Pagamentos, Parcelas, Recebimentos, Emprestimos, Relatorios e Portal do Cliente. | |
| Campo Bco Recebedor com lista e busca | O campo de conta/banco recebedor no lancamento de baixa passou a listar as contas cadastradas e a filtrar conforme a digitacao, no lugar do preenchimento livre. | |
| Filtro de consultor tambem em Recebimentos | O filtro por consultor, ja disponivel em Parcelas, foi estendido a tela de Recebimentos, com o mesmo campo de digitacao. | |
| Relatorio do cliente para consultores | Nova visao que reune, por cliente, cada contrato com as parcelas separadas em pagas, vencidas e a vencer. O consultor enxerga a propria carteira; administrador e financeiro enxergam qualquer cliente. Inclui correcoes nos filtros da tela. | |
| Fluxo "Esqueci minha senha" para operadores | Recuperacao de senha por e-mail para usuarios internos, com link de redefinicao proprio e redefinicao processada no servidor. Antes nao havia caminho de recuperacao: a senha so podia ser trocada por um administrador. | |

| Relatorio do consultor abre com a carteira inteira | A tela passou a abrir ja com todos os clientes da carteira do consultor listados, sem exigir busca previa. Antes era preciso digitar o nome para que qualquer coisa aparecesse. | |
| Registro de tratativas do cliente | Novo campo de tratativas por cliente: o consultor registra cada contato (canal, descricao) e o sistema grava autor e data. O historico e somente-adicao, aparece no Relatorio do Cliente e na ficha do cliente, e o proprio autor (ou administrador/financeiro) pode remover um registro. O campo de Observacoes do cliente tambem foi liberado para edicao pelo consultor. | |
| Fila de cobrancas com link para o cliente | Na lista de Cobrancas urgentes do painel do consultor, que ja vem ordenada da parcela mais antiga para a mais recente, o nome do cliente passou a ser um link que abre o relatorio daquele cliente. Antes o nome era texto morto e o consultor precisava procurar o cliente manualmente. | |
| Data do pagamento nas parcelas vencidas | No Relatorio do Cliente, a coluna de data do pagamento passou a aparecer nas tres tabelas (pagas, vencidas e a vencer). Parcela vencida com baixa parcial mostrava o valor pago sem dizer quando o dinheiro entrou. O valor pago tambem passou a ser destacado em azul. | |
| Relacao de clientes quitados | O indicador Clientes Quitados do painel passou a ser clicavel, como os demais, e abre uma nova tela com a relacao dos clientes: CPF, nome, quantidade de contratos quitados e ativos, WhatsApp, consultor, data da ultima quitacao e total quitado, com busca por nome ou CPF. | |

| Exportacao dos Recebimentos para Excel | Botao de Excel na tela de Recebimentos. A planilha sai com o mesmo filtro aplicado na tela (cliente, consultor, banco recebedor e periodo) e traz data, cliente, consultor, contrato, parcela, valor pago, desconto, metodo, conta recebedora, a divisao entre capital, lucro e comissoes, situacao e observacao, alem de uma linha final com os totais do periodo. | |
| Ordem das colunas no Relatorio do Cliente | A data do pagamento passou a ficar entre o valor da parcela e o valor pago, conforme solicitado. | |
| CPF do cliente nos Recebimentos | Nova coluna de CPF na tela de Recebimentos, posicionada antes do nome do cliente, para permitir a conferencia dos valores baixados com os informados pela equipe. A mesma coluna foi incluida na planilha de Excel dos recebimentos. | |
| Posicao da data do pagamento nos Recebimentos | A coluna com a data do pagamento passou a ficar entre Parcela e Valor, conforme solicitado, em vez de ficar no fim da tabela. | |
| Fila de cobrancas agrupada por cliente | No painel do consultor, a lista de Cobrancas urgentes passou a mostrar cada cliente uma unica vez, reunindo as parcelas em atraso daquele cliente em uma linha so: quantidade de parcelas, data do atraso mais antigo, dias de atraso e total em aberto. Antes o mesmo cliente aparecia repetido em varias linhas, uma por parcela. | |
| Filtros na tela de Inadimplentes | A tela ganhou busca por nome do cliente (tambem por CPF ou WhatsApp) e filtro por periodo da data de atraso. A busca ignora maiusculas/minusculas, e o CPF pode ser digitado com ou sem formatacao. O periodo considera a data do atraso mais antigo do contrato, que e a exibida na coluna. Os totais no topo - contratos inadimplentes, total em atraso e clientes unicos - passam a refletir o filtro aplicado, e a planilha de Excel traz exatamente os mesmos clientes que a tela mostra, em vez de exportar a carteira inteira. | |
| Filtro por data de inicio do contrato | A tela de Emprestimos ganhou um intervalo de periodo pela data de inicio do contrato (de/ate), com botao para limpar. Funciona junto com a busca por nome ou CPF e com o filtro de status. | |
| Exportacao dos Emprestimos para Excel | A tela de Emprestimos ganhou o botao de Excel. A planilha traz contrato, cliente, CPF, WhatsApp, cidade, estado, valor emprestado, quantidade e valor da parcela, total a pagar, data de inicio, situacao, parcelas pagas, parcelas atrasadas e total recebido. Sai com os mesmos filtros aplicados na tela - busca por nome ou CPF, situacao e periodo de inicio do contrato - em vez de exportar a carteira inteira. Os valores vao como numero, prontos para somar e ordenar no proprio Excel, a data de inicio como data, o CPF pontuado e a situacao com o mesmo nome que aparece na tela. O cabecalho fica congelado ao rolar, com filtro automatico, e a planilha termina com uma linha de totais: valor emprestado, total a pagar e total recebido. | |

## Correcoes

| Item | Descricao | Valor |
| --- | --- | ---: |
| Encargos na baixa com data retroativa | Ao lancar um pagamento com data anterior a de hoje, a tela calculava multa e mora ate a data atual, enquanto o servidor congelava o calculo na data informada pelo operador. O sistema entao recusava o proprio valor que havia sugerido, com a mensagem "excede o total devido com encargos". A data do pagamento passou a ser enviada no calculo e os dois lados agora exibem e aceitam o mesmo valor. | |
| Aviso indevido de regeneracao de parcelas | Ao editar um contrato, o aviso de que as parcelas seriam refeitas aparecia em qualquer alteracao, inclusive em mudanca de dados cadastrais. Passou a aparecer somente quando a alteracao realmente muda o cronograma. | |
| Data do 1o vencimento zerada na edicao do contrato | Ao abrir um contrato para edicao, o campo Data do 1o Vencimento vinha em branco e a equipe precisava digitar a data novamente a cada alteracao. O campo passou a vir preenchido com o vencimento da primeira parcela ainda em aberto. Sem essa data, o sistema remontava o cronograma a partir da data de inicio do contrato: em um contrato iniciado em 2015, a parcela que vence em julho de 2025 seria regravada para janeiro de 2016. | |
| Acesso dos consultores bloqueado | Os usuarios com perfil de consultor nao conseguiam entrar no sistema, e trocar a senha nao resolvia. Duas causas: um usuario estava desativado e por isso sequer era localizado no login; e as contas de acesso de dois consultores continuavam presas ao nome de usuario antigo, de modo que a troca de senha atualizava um cadastro e o login procurava outro. Vinculos corrigidos e login ajustado para se autocorrigir quando essa divergencia ocorrer, evitando o problema no futuro. | |
| Sincronizacao da conta ao editar operador | Alterar nome de usuario, senha ou perfil de um operador atualizava apenas o cadastro interno e deixava a conta de acesso desatualizada, tirando o operador do sistema. A edicao passou a atualizar os dois lados na mesma operacao. | |
| Link de recuperacao de senha com destino errado | O link enviado por e-mail caia na pagina inicial em vez da tela de redefinicao. Corrigido para abrir direto na tela correta. | |
| Tela travada apos login com sessao invalida | Quando as credenciais salvas no navegador nao valiam mais, a tela alternava entre login e painel indefinidamente, deixando o usuario com o simbolo de carregamento na tela. O ciclo foi interrompido e o usuario passa a ser levado ao login. | |

| Busca por cliente incompleta | A busca por nome so encontrava o cliente se as maiusculas e minusculas fossem digitadas exatamente como no cadastro, e ainda parava no 500o cadastro - clientes cadastrados depois disso simplesmente nao eram localizados. Corrigido: a busca ignora maiusculas/minusculas e alcanca toda a base. | |
| Segunda baixa seguida travava a busca de cliente | Apos lancar um pagamento, ao tentar lancar o proximo o campo de cliente ficava travado e nao localizava ninguem, obrigando a recarregar a tela. Corrigido. | |
| Parcelas quitadas antigas contadas como vencidas | No relatorio do consultor, parcela ja quitada com vencimento no passado aparecia entre as vencidas e inflava o total em atraso do cliente. Passou a ser classificada pelo saldo, e nao pela data. | |
| Data do contrato recuava um dia a cada edicao | Ao abrir um contrato, alterar qualquer campo e salvar, a data de inicio e a data de vencimento caiam um dia; na edicao seguinte caiam mais um, obrigando a equipe a redigitar as datas toda vez. A causa era a hora em que as datas eram gravadas: o servidor de producao trabalha em fuso diferente do da tela, e a data gravada a meia-noite era relida como o dia anterior. As datas passaram a ser gravadas e lidas de forma independente de fuso, e o ciclo abrir-salvar-abrir foi verificado cinco vezes seguidas sem alteracao. A correcao alcanca todos os pontos que geram vencimento: criacao de contrato, edicao, reparcelamento e liberacao de capital. | |
| Cliente nao encontrado ao lancar novo contrato | Ao dar entrada em um contrato, determinados clientes nao eram localizados no campo de cliente, mesmo com o cadastro ativo e aparecendo normalmente nas telas de Clientes e de Parcelas. A causa nao era o cliente ter encerrado um contrato anterior, e sim a posicao dele na ordem alfabetica: a tela carregava a lista de clientes ate um limite de 500 e filtrava dentro dessa lista, e a base ja tem 518 clientes ativos - os 18 ultimos em ordem alfabetica nunca chegavam a tela. A busca passou a ser feita pelo servidor a cada letra digitada, por nome ou CPF, sem lista intermediaria: deixa de existir um ponto a partir do qual a base fica grande demais. A mesma correcao foi aplicada nas demais telas com o mesmo limite (avalistas no cadastro e na edicao de cliente, PIX e Intencoes). Na Central de Relatorios o pedido excedia o limite e retornava erro, de modo que o seletor de cliente do extrato nunca listava ninguem; tambem corrigido. | |
| Cadastro de cliente com avalista era recusado | O cadastro e a edicao de cliente falhavam sempre que um avalista era preenchido: o sistema recusava a gravacao e devolvia erro, campo a campo do avalista. A conversao dos dados do avalista, enviados junto com as fotos e documentos, perdia as regras de validacao no caminho, e a checagem de seguranca do sistema entao rejeitava todo campo que nao reconhecia. Corrigido nos dois fluxos (cadastro novo e edicao), sem afrouxar a validacao: avalista incompleto ou com campo indevido continua sendo recusado. | |
| Contratos antigos nao apareciam em Renegociacao e Reparcelamento | Os campos de contrato dessas duas telas listavam apenas os 200 contratos mais recentes. Com 571 contratos ativos, os 371 mais antigos nao podiam ser selecionados - justamente os contratos de mais tempo, que sao os que mais chegam a renegociacao. O campo passou a buscar no servidor por nome ou CPF do cliente, sem limite de listagem. | |

## Ambiente de homologacao

| Item | Descricao | Valor |
| --- | --- | ---: |
| Publicacao do ambiente de homologacao | Backend e frontend de homologacao passaram a ser construidos e publicados a partir do codigo-fonte, permitindo que cada ajuste seja disponibilizado para conferencia do cliente antes de ir para producao. Inclui chave para desligar as rotinas automaticas na homologacao, para que o ambiente de teste nao dispare cobrancas reais. | |

## Total

**TOTAL: R$ ____**

## Validacao

- Alteracoes de backend e frontend submetidas a verificacao de tipos e compilacao.
- Filtro por data de inicio conferido na base, inclusive nos limites do periodo:
  filtrando o dia exato do primeiro e do ultimo contrato do intervalo, ambos continuam
  aparecendo - nenhum contrato se perde na borda da data.
- Selecao de contrato em Renegociacao e Reparcelamento conferida na base com 10 dos
  contratos que estavam fora do limite anterior (os 5 mais antigos e os 5 mais recentes
  do grupo): todos localizados pelo nome e pelo CPF do cliente.
- Busca de cliente conferida na base: os 18 cadastros que estavam fora do limite
  de 500 sao alcancados por nome (em qualquer caixa) e por CPF, com ou sem pontuacao.
- Cadastro com avalista conferido na propria rotina de validacao do sistema, nos dois
  fluxos (novo e edicao) e tambem nos casos que devem falhar (avalista sem nome e
  campo indevido), que continuam sendo recusados.
- Correcao de encargos conferida comparando o valor exibido na tela com o valor
  aceito pelo servidor, na mesma data de pagamento.
- Acesso de consultor testado ponta a ponta apos a correcao, inclusive no cenario
  de divergencia entre o cadastro interno e a conta de acesso.
- Campos de selecao com digitacao conferidos nas telas em que foram aplicados.
- Fila de cobrancas conferida contra os dados reais: ordem por vencimento mais antigo
  e link abrindo o relatorio do cliente correto.
- Relacao de clientes quitados conferida contra o indicador do painel.
- Exportacao para Excel conferida gerando o arquivo real no ambiente de homologacao:
  cabecalho, linhas e linha de totais conferidos contra os valores exibidos na tela.
- Filtros da tela de Inadimplentes conferidos na homologacao em onze cenarios (nome,
  nome sem acento, CPF com e sem pontuacao, telefone, periodos e combinacoes): em todos,
  a relacao de clientes da planilha coincide com a exibida na tela, e o total sem filtro
  fecha com o indicador do topo (R$ 1.484.710,69 em 1.761 parcelas de 509 contratos).
- Correcao das datas do contrato verificada simulando o ciclo abrir-salvar-abrir cinco
  vezes, nos dois fusos (o do servidor e o do escritorio): antes a data caia um dia por
  edicao, depois permanece igual em todas as voltas. O historico de auditoria do sistema
  foi usado para identificar os contratos afetados - apenas dois foram editados no periodo.
- Exportacao dos Emprestimos conferida gerando as planilhas de verdade e abrindo os
  arquivos: sem filtro saem 574 contratos, o mesmo total da base; no periodo de 2016
  saem exatamente os dois contratos daquele ano, com as datas 29/02/2016 e 10/09/2016
  corretas; em julho/2026 saem 78, o mesmo que a tela mostra. Em todos os cenarios a
  quantidade de linhas da planilha coincide com a da tela.
- Planilha de Emprestimos conferida abrindo os arquivos gerados e lendo celula a celula:
  as colunas de dinheiro voltam como numero (somam no Excel), a data de inicio como data
  preservando o dia, o CPF mantem o zero a esquerda. A linha de totais bate com o banco
  em quatro cenarios - sem filtro R$ 711.436,06 em 574 contratos, so ativos R$ 709.986,06
  em 571, julho/2026 R$ 134.616,56 em 78, e 2016 R$ 3.343,20 em 2.
- Todos os itens acima publicados no ambiente de homologacao para conferencia.

Pagamento via PIX - Chave: CNPJ 66.650.579/0001-46 (UX Code Desenvolvimento Web).

UX Code Desenvolvimento Web | CNPJ 66.650.579/0001-46
contato@uxcode.com.br | (41) 98703-8339
