'use client'

import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { Input } from './input'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

export interface ClienteOption {
  id: number
  nome: string
  cpf?: string | null
}

/**
 * Combobox de cliente com busca por nome OU CPF (typeahead) — evita dropdowns enormes.
 *
 * `buscaRemota` manda a busca para o backend a cada tecla, em vez de filtrar uma lista
 * ja baixada. Filtrar no navegador exige ter a base inteira em memoria, e o teto da API
 * e 500 por pagina (`PaginationDto.@Max(500)`): com 518 clientes ativos, os 18 ultimos em
 * ordem alfabetica (Wesllen, Yasmin, Yuri...) nao chegavam na tela de novo emprestimo —
 * apareciam normalmente em /clientes e davam "Nenhum cliente encontrado" no contrato.
 */
export function ClienteCombobox({
  clientes = [],
  value,
  onSelect,
  placeholder = 'Buscar por nome ou CPF...',
  excludeId,
  avulsoLabel,
  vazioLabel = 'Nenhum cliente encontrado.',
  buscaRemota = false,
}: {
  clientes?: ClienteOption[]
  value?: number | null
  onSelect: (c: ClienteOption | null) => void
  placeholder?: string
  excludeId?: number | null
  avulsoLabel?: string
  vazioLabel?: string
  buscaRemota?: boolean
}) {
  const [query, setQuery] = useState('')
  const [termo, setTermo] = useState('')
  const [open, setOpen] = useState(false)
  const [escolhido, setEscolhido] = useState<ClienteOption | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setTermo(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const { data: remotos, isFetching } = useQuery<ClienteOption[]>({
    queryKey: ['cliente-combobox', termo],
    queryFn: () =>
      api
        .get<any>('/clients', { params: { search: termo || undefined, limit: 20, status: 'active' } })
        .then((r) => r.data.data ?? r.data),
    enabled: buscaRemota && open,
    placeholderData: keepPreviousData,
  })

  // Um cliente ja escolhido (ex.: ?clienteId= vindo da ficha) pode nao estar na lista
  // local nem no resultado da busca atual; sem isto o campo voltaria a ficar vazio.
  const precisaResolver =
    buscaRemota && !!value && escolhido?.id !== value && !clientes.some((c) => c.id === value)
  const { data: porId } = useQuery<ClienteOption>({
    queryKey: ['cliente-combobox-id', value],
    queryFn: () => api.get<any>(`/clients/${value}`).then((r) => r.data),
    enabled: precisaResolver,
  })

  const selected = value
    ? escolhido?.id === value
      ? escolhido
      : clientes.find((c) => c.id === value) ?? (porId?.id === value ? porId : null)
    : null

  const q = query.trim().toLowerCase()
  const qd = q.replace(/\D/g, '')
  const base = buscaRemota ? remotos ?? [] : clientes
  const filtered = base
    .filter((c) => c.id !== excludeId)
    .filter((c) => {
      // No modo remoto quem filtrou foi o backend; refiltrar aqui esconderia resultados.
      if (buscaRemota || !q) return true
      if (c.nome.toLowerCase().includes(q)) return true
      const cpf = (c.cpf ?? '')
      return cpf.includes(query.trim()) || (qd.length > 0 && cpf.replace(/\D/g, '').includes(qd))
    })
    .slice(0, 30)

  function escolher(c: ClienteOption | null) {
    setEscolhido(c)
    onSelect(c)
    setQuery('')
    setTermo('')
  }

  return (
    <div className="relative" ref={boxRef}>
      {selected ? (
        <div className="flex items-center justify-between h-9 rounded-md border border-input bg-background px-3 text-sm">
          <span className="truncate">
            {selected.nome}{selected.cpf ? <span className="text-muted-foreground"> · {selected.cpf}</span> : null}
          </span>
          <button
            type="button"
            onClick={() => { escolher(null); setOpen(true) }}
            className="text-muted-foreground hover:text-foreground shrink-0 ml-2"
            title="Trocar"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={placeholder}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
          />
        </div>
      )}

      {open && !selected && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
          {avulsoLabel && (
            <button
              type="button"
              onClick={() => { escolher(null); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm italic text-muted-foreground hover:bg-muted/60"
            >
              {avulsoLabel}
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {buscaRemota && isFetching ? 'Buscando…' : query.trim() ? vazioLabel : 'Digite para buscar…'}
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { escolher(c); setOpen(false) }}
                className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted/60')}
              >
                <span className="font-medium">{c.nome}</span>
                {c.cpf && <span className="text-xs text-muted-foreground"> · {c.cpf}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
