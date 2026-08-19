'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from './input'
import { cn } from '@/lib/utils'

export interface ClienteOption {
  id: number
  nome: string
  cpf?: string | null
}

/**
 * Combobox de cliente com busca por nome OU CPF (typeahead) — evita dropdowns enormes.
 */
export function ClienteCombobox({
  clientes,
  value,
  onSelect,
  placeholder = 'Buscar por nome ou CPF...',
  excludeId,
  avulsoLabel,
  vazioLabel = 'Nenhum cliente encontrado.',
}: {
  clientes: ClienteOption[]
  value?: number | null
  onSelect: (c: ClienteOption | null) => void
  placeholder?: string
  excludeId?: number | null
  avulsoLabel?: string
  vazioLabel?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const selected = value ? clientes.find((c) => c.id === value) ?? null : null

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim().toLowerCase()
  const qd = q.replace(/\D/g, '')
  const filtered = clientes
    .filter((c) => c.id !== excludeId)
    .filter((c) => {
      if (!q) return true
      if (c.nome.toLowerCase().includes(q)) return true
      const cpf = (c.cpf ?? '')
      return cpf.includes(query.trim()) || (qd.length > 0 && cpf.replace(/\D/g, '').includes(qd))
    })
    .slice(0, 30)

  return (
    <div className="relative" ref={boxRef}>
      {selected ? (
        <div className="flex items-center justify-between h-9 rounded-md border border-input bg-background px-3 text-sm">
          <span className="truncate">
            {selected.nome}{selected.cpf ? <span className="text-muted-foreground"> · {selected.cpf}</span> : null}
          </span>
          <button
            type="button"
            onClick={() => { onSelect(null); setQuery(''); setOpen(true) }}
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
              onClick={() => { onSelect(null); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm italic text-muted-foreground hover:bg-muted/60"
            >
              {avulsoLabel}
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {query.trim() ? vazioLabel : 'Digite para buscar…'}
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onSelect(c); setQuery(''); setOpen(false) }}
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
