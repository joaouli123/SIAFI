'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ComboboxTextoProps {
  value: string
  onChange: (value: string) => void
  opcoes?: string[]
  placeholder?: string
  className?: string
  inputClassName?: string
  id?: string
  disabled?: boolean
  vazioLabel?: string
}

const RE_ACENTO = new RegExp('[\u0300-\u036f]', 'g')
const normalizar = (s: string) => s.normalize('NFD').replace(RE_ACENTO, '').toLowerCase()

/**
 * Campo de texto livre com lista de sugestões: abre a lista completa ao clicar
 * e filtra conforme se digita, mas aceita qualquer valor que não esteja nela.
 * O <datalist> nativo não dá esse comportamento de forma consistente entre navegadores.
 */
export function ComboboxTexto({
  value,
  onChange,
  opcoes,
  placeholder,
  className,
  inputClassName,
  id,
  disabled,
  vazioLabel = 'Nenhuma conta registrada ainda.',
}: ComboboxTextoProps) {
  const boxRef = React.useRef<HTMLDivElement | null>(null)
  const listaRef = React.useRef<HTMLDivElement | null>(null)
  const [aberto, setAberto] = React.useState(false)
  const [destaque, setDestaque] = React.useState(-1)

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = normalizar(value.trim())
  const lista = opcoes ?? []
  // Digitou algo que bate exatamente com a sugestão selecionada: mostra tudo de novo.
  const filtradas = React.useMemo(
    () => (q && !lista.some((o) => normalizar(o) === q) ? lista.filter((o) => normalizar(o).includes(q)) : lista),
    [lista, q]
  )

  React.useEffect(() => setDestaque(-1), [value, aberto])

  function escolher(v: string) {
    onChange(v)
    setAberto(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!aberto) return setAberto(true)
      setDestaque((d) => Math.min(d + 1, filtradas.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setDestaque((d) => Math.max(d - 1, -1))
    } else if (e.key === 'Enter') {
      // Só intercepta quando há sugestão destacada; senão o texto digitado vale.
      if (aberto && destaque >= 0 && filtradas[destaque]) {
        e.preventDefault()
        escolher(filtradas[destaque])
      } else {
        setAberto(false)
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setAberto(false)
    }
  }

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={aberto}
        autoComplete="off"
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setAberto(true)
        }}
        onFocus={() => setAberto(true)}
        onClick={() => setAberto(true)}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 pr-8 text-sm shadow-xs transition-colors',
          'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          inputClassName
        )}
      />
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-[18px] -translate-y-1/2 size-4 text-muted-foreground"
        aria-hidden="true"
      />

      {aberto && !disabled && (
        <div
          ref={listaRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-background shadow-lg"
        >
          {filtradas.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">{vazioLabel}</p>
          ) : (
            filtradas.map((o, i) => (
              <button
                key={o}
                type="button"
                role="option"
                aria-selected={o === value}
                onMouseEnter={() => setDestaque(i)}
                onClick={() => escolher(o)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm',
                  i === destaque && 'bg-muted/60',
                  o === value && 'font-medium'
                )}
              >
                {o}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
