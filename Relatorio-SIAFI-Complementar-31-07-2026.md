# SIAFI 2.0 - Relatorio Complementar de Entregas

Empresa: Lidera Tecnologia e Gestao  
Sistema: SIAFI - Sistema Integrado de Apoio Financeiro  
Data: 31/07/2026  
Referencia: Complemento ao relatorio quinzenal anterior

## Resumo

Este documento registra ajustes adicionais realizados apos o relatorio anterior, com foco em baixas parciais, rateio de capital/lucro/comissao, historico de recebimentos e publicacao em producao.

As alteracoes foram revisadas, testadas, compiladas e publicadas no Railway.

## Entregas Realizadas

| Item | Descricao | Valor |
| --- | --- | ---: |
| Rateio proporcional de capital, lucro e comissao | Ajuste para dividir corretamente capital, lucro e comissao quando o cliente paga a parcela em partes, com regra aplicada para parcelas iniciadas a partir de 24/07/2026. | R$ 70,00 |
| Correcao de baixa parcial com divida atual | Pagamentos parciais passaram a considerar a divida atual com encargos. Ex.: se a divida atual for maior que o valor base da parcela, o sistema nao marca mais como quitado indevidamente. | R$ 60,00 |
| Historico e Recebimentos | Inclusao/ajuste de Bco Recebedor no historico de baixas e Recebimentos, alem de melhorias nas colunas de consultor, capital, comissao e lucro da empresa. | R$ 35,00 |
| Banco, testes e deploy | Criacao/aplicacao de ajuste no banco de dados, testes automatizados, build do backend/frontend e deploy em producao no Railway. | R$ 35,00 |

## Total

**TOTAL DO COMPLEMENTO: R$ 200,00**

## Validacao

- Backend validado com testes automatizados e build de producao.
- Frontend validado com build de producao.
- Migration aplicada no banco de producao.
- Backend e frontend publicados com sucesso no Railway.

Pagamento via PIX - Chave: CNPJ 66.650.579/0001-46 (UX Code Desenvolvimento Web).

UX Code Desenvolvimento Web | CNPJ 66.650.579/0001-46  
contato@uxcode.com.br | (41) 98703-8339
