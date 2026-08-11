export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
  // Campos "flat" espelhados de `meta`. Vários consumidores do frontend leem a
  // paginação direto da raiz (ex.: /clientes e /emprestimos usam data.total /
  // data.lastPage), enquanto outros leem de `meta` (ex.: /parcelas). Emitir os dois
  // formatos evita paginação/contagem quebrada dependendo da tela.
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  const lastPage = Math.ceil(total / limit) || 1;
  return {
    data,
    meta: { total, page, limit, lastPage },
    total,
    page,
    limit,
    lastPage,
  };
}
