// ─── Tipos da Central de Relatórios ───────────────────────────────────────────

export type ColTipo = 'texto' | 'moeda' | 'numero' | 'inteiro' | 'data' | 'percent';

export interface RelCol {
  key: string;
  label: string;
  tipo?: ColTipo; // default: 'texto'
}

// Gráfico de barras opcional (renderizado em PDF/HTML como SVG)
export interface RelGrafico {
  titulo: string;
  categoriaKey: string; // coluna usada como rótulo (eixo X)
  valorKey: string;     // coluna numérica usada como altura da barra
}

export interface RelData {
  key: string;
  titulo: string;
  subtitulo?: string;
  periodo?: string;
  colunas: RelCol[];
  linhas: Record<string, unknown>[];
  totais?: Record<string, unknown>; // valores keyed por coluna (linha de totais)
  resumo?: Array<{ label: string; valor: string }>; // bloco de KPIs no topo
  grafico?: RelGrafico; // gráfico de barras opcional (PDF/HTML)
}

export type Formato = 'pdf' | 'xlsx' | 'csv' | 'xml' | 'txt' | 'html';

export const FORMATOS: Formato[] = ['pdf', 'xlsx', 'csv', 'xml', 'txt', 'html'];

export interface RelMeta {
  key: string;
  nome: string;
  descricao: string;
  grupo: string;
  persona: string;     // perfil que tipicamente usa
  params: string[];    // 'periodo' | 'mes' | 'status'
}

// Catálogo de relatórios pré-definidos (visão de analista financeiro,
// contador e economista sênior sobre os dados do SIAFI).
export const RELATORIOS_CATALOGO: RelMeta[] = [
  // ── Carteira & Crédito ──────────────────────────────────────────────────
  {
    key: 'carteira-contratos',
    nome: 'Carteira de Contratos',
    descricao: 'Todos os contratos com capital, lucro, recebido e saldo a receber.',
    grupo: 'Carteira & Crédito',
    persona: 'Analista financeiro',
    params: ['status'],
  },
  {
    key: 'aging-carteira',
    nome: 'Aging da Carteira',
    descricao: 'Saldo a receber por faixa de vencimento/atraso (a vencer, 1-30, 31-60, 61-90, 90+).',
    grupo: 'Carteira & Crédito',
    persona: 'Contador',
    params: [],
  },
  {
    key: 'inadimplencia',
    nome: 'Inadimplência Detalhada',
    descricao: 'Parcelas em atraso com dias de atraso, multa, mora e total devido por cliente.',
    grupo: 'Carteira & Crédito',
    persona: 'Analista de crédito',
    params: [],
  },
  {
    key: 'provisao-pdd',
    nome: 'Provisão para Perdas (PDD)',
    descricao: 'Provisão estimada por faixa de atraso (modelo simplificado tipo CMN 2682).',
    grupo: 'Carteira & Crédito',
    persona: 'Contador / Economista',
    params: [],
  },
  {
    key: 'clientes-risco',
    nome: 'Clientes & Risco',
    descricao: 'Carteira de clientes ativos com score, nível de risco, contratos e saldo devedor.',
    grupo: 'Carteira & Crédito',
    persona: 'Analista de crédito',
    params: [],
  },

  // ── Resultado & Financeiro ──────────────────────────────────────────────
  {
    key: 'dre-periodo',
    nome: 'Demonstrativo de Resultado (DRE)',
    descricao: 'Lucro realizado, comissões, despesas de caixa e resultado do período.',
    grupo: 'Resultado & Financeiro',
    persona: 'Contador',
    params: ['periodo'],
  },
  {
    key: 'fluxo-caixa',
    nome: 'Fluxo de Caixa por Categoria',
    descricao: 'Entradas e saídas do caixa agrupadas por categoria no período.',
    grupo: 'Resultado & Financeiro',
    persona: 'Economista',
    params: ['periodo'],
  },
  {
    key: 'faturamento-consultor',
    nome: 'Faturamento por Consultor',
    descricao: 'Lucro realizado, comissão e lucro líquido por consultor no período.',
    grupo: 'Resultado & Financeiro',
    persona: 'Analista financeiro',
    params: ['periodo'],
  },
  {
    key: 'recebimentos-metodo',
    nome: 'Recebimentos por Método e Conta',
    descricao: 'Pagamentos do período agrupados por método e conta/banco de destino.',
    grupo: 'Resultado & Financeiro',
    persona: 'Contador',
    params: ['periodo'],
  },
  {
    key: 'projecao-recebiveis',
    nome: 'Projeção de Recebíveis',
    descricao: 'Parcelas em aberto projetadas por mês de vencimento (fluxo futuro).',
    grupo: 'Resultado & Financeiro',
    persona: 'Economista',
    params: [],
  },
  {
    key: 'comissao-acumulada',
    nome: 'Comissão por Contrato (acumulada)',
    descricao: 'Por contrato: comissão prevista, realizada e paga ao consultor até hoje, com saldo.',
    grupo: 'Resultado & Financeiro',
    persona: 'Analista financeiro',
    params: [],
  },
  {
    key: 'descontos-concedidos',
    nome: 'Descontos Concedidos',
    descricao: 'Descontos dados nas baixas (sobre saldo ou encargos) no período, por cliente.',
    grupo: 'Resultado & Financeiro',
    persona: 'Contador',
    params: ['periodo'],
  },

  // ── Operacional & Conformidade ──────────────────────────────────────────
  {
    key: 'renegociacoes-reparcelamentos',
    nome: 'Renegociações & Reparcelamentos',
    descricao: 'Renegociações e reparcelamentos registrados no período, com valores e status.',
    grupo: 'Operacional & Conformidade',
    persona: 'Analista financeiro',
    params: ['periodo'],
  },
  {
    key: 'auditoria-operacoes',
    nome: 'Auditoria de Operações',
    descricao: 'Log de ações (criação/edição/estorno/liberação) por usuário no período.',
    grupo: 'Operacional & Conformidade',
    persona: 'Contador / Auditoria',
    params: ['periodo'],
  },
  {
    key: 'extrato-cliente',
    nome: 'Extrato por Cliente',
    descricao: 'Extrato completo de um cliente: contratos, parcelas e pagamentos. Selecione o cliente.',
    grupo: 'Operacional & Conformidade',
    persona: 'Analista financeiro',
    params: ['cliente'],
  },
];
