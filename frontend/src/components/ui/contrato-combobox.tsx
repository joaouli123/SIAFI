'use client'

import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { Input } from './input'
import api from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

export interface ContratoOption {
  id: number
  status?: string
  principalAmount?: number | string
  totalReceivable?: number | string
  numeroParcelas?: number
  dataInicio?: string
  client?: { id?: number; nome?: string; cpf?: string | null } | null
  [k: string]: unknown
}

/**
 * Seletor de contrato com busca no servidor (por nome ou CPF do cliente).
 *
 * A lista de contratos vem ordenada por createdAt desc, entao um <select> alimentado
 * por /loans?limit=200 mostrava so os 200 mais recentes: com 571 contratos ativos, os
 * 371 mais antigos ficavam impossiveis de escolher em renegociacao e reparcelamento —
 * justamente os contratos velhos, que sao os que mais precisam desses fluxos.
 */
export function ContratoCombobox({
  value,
  onSelect,
  status = 'ativo',
  placeholder = 'Buscar contrato por cliente ou CPF...',
  vazioLabel = 'Nenhum contrato encontrado.',
}: {
  value?: number | null
  onSelect: (l: ContratoOption | null) => void
  status?: string
  placeholder?: string
  vazioLabel?: string
}) {
  const [query, setQuery] = useState('')
  const [termo, setTermo] = useState('')
  const [open, setOpen] = useState(false)
  const [escolhido, setEscolhido] = useState<ContratoOption | null>(null)
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

  const { data: remotos, isFetching } = useQuery<ContratoOption[]>({
    queryKey: ['contrato-combobox', status, termo],
    queryFn: () =>
      api
        .get<any>('/loans', { params: { search: termo || undefined, status, limit: 20 } })
        .then((r) => r.data.data ?? r.data),
    enabled: open,
    placeholderData: keepPreviousData,
  })

  // Contrato pre-selecionado (ex.: ?loanId= vindo da ficha) pode nao estar no
  // resultado da busca atual; sem isto o campo voltaria a ficar vazio.
  const { data: porId } = useQuery<ContratoOption>({
    queryKey: ['contrato-combobox-id', value],
    queryFn: () => api.get<any>(`/loans/${value}`).then((r) => r.data),
    enabled: !!value && escolhido?.id !== value,
  })

  const selected = value
    ? escolhido?.id === value
      ? escolhido
      : porId?.id === value
        ? porId
        : null
    : null

  function escolher(l: ContratoOption | null) {
    setEscolhido(l)
    onSelect(l)
    setQuery('')
    setTermo('')
  }

  function rotulo(l: ContratoOption) {
    const valor = formatCurrency(Number(l.principalAmount) || 0)
    const parcelas = l.numeroParcelas ? ` · ${l.numeroParcelas}x` : ''
    return `#${l.id} — ${l.client?.nome ?? 'sem cliente'} · ${valor}${parcelas}`
  }

  return (
    <div className="relative" ref={boxRef}>
      {selected ? (
        <div className="flex items-center justify-between h-9 rounded-md border border-input bg-background px-3 text-sm">
          <span className="truncate">{rotulo(selected)}</span>
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
          {(remotos ?? []).length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {isFetching ? 'Buscando…' : query.trim() ? vazioLabel : 'Digite para buscar…'}
            </p>
          ) : (
            (remotos ?? []).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => { escolher(l); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60"
              >
                <span className="font-medium">#{l.id} — {l.client?.nome ?? 'sem cliente'}</span>
                <span className="text-xs text-muted-foreground">
                  {' '}· {formatCurrency(Number(l.principalAmount) || 0)}
                  {l.numeroParcelas ? ` · ${l.numeroParcelas}x` : ''}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
