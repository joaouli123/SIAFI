'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  // O portal do cliente estiliza por style inline (--portal-*), sem Tailwind.
  unstyled?: boolean
}

interface Opcao {
  value: string
  label: string
  disabled?: boolean
}

// O <option> aceita children compostos ({a} · {b}); precisamos do texto puro para filtrar.
function textoDe(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textoDe).join('')
  if (React.isValidElement(node)) return textoDe((node.props as { children?: React.ReactNode }).children)
  return ''
}

function coletarOpcoes(children: React.ReactNode): Opcao[] {
  const out: Opcao[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement> & {
      children?: React.ReactNode
    }
    if (child.type === 'option') {
      const label = textoDe(props.children)
      out.push({
        value: props.value !== undefined ? String(props.value) : label,
        label,
        disabled: props.disabled,
      })
    } else if (props.children) {
      out.push(...coletarOpcoes(props.children))
    }
  })
  return out
}

const RE_ACENTO = new RegExp('[\u0300-\u036f]', 'g')

const normalizar = (s: string) =>
  s.normalize('NFD').replace(RE_ACENTO, '').toLowerCase()

const MAX_VISIVEL = 100

/**
 * Combobox com a API de um <select> nativo: aceita <option> como children e
 * dispara onChange com um evento cujo target é o <select> oculto, de modo que
 * react-hook-form (register) e os call sites com onChange={e => e.target.value}
 * continuam funcionando sem alteração.
 *
 * Diferença de comportamento: a lista abre ao focar E o campo aceita digitação
 * para filtrar as opções.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      children,
      value,
      defaultValue,
      onChange,
      onBlur,
      name,
      disabled,
      id,
      style,
      unstyled,
      ...props
    },
    ref
  ) => {
    const opcoes = React.useMemo(() => coletarOpcoes(children), [children])

    const nativoRef = React.useRef<HTMLSelectElement | null>(null)
    const boxRef = React.useRef<HTMLDivElement | null>(null)
    const inputRef = React.useRef<HTMLInputElement | null>(null)
    const listaRef = React.useRef<HTMLDivElement | null>(null)

    const controlado = value !== undefined
    const [interno, setInterno] = React.useState(String(value ?? defaultValue ?? ''))
    const atual = controlado ? String(value ?? '') : interno

    const [aberto, setAberto] = React.useState(false)
    const [busca, setBusca] = React.useState('')
    const [destaque, setDestaque] = React.useState(0)

    // react-hook-form (reset/setValue) escreve direto no nó; espelhamos o valor
    // do <select> oculto a cada render para o rótulo não ficar defasado.
    React.useEffect(() => {
      if (controlado) return
      const el = nativoRef.current
      if (el && el.value !== interno) setInterno(el.value)
    })

    React.useEffect(() => {
      function onDoc(e: MouseEvent) {
        if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
          setAberto(false)
          setBusca('')
        }
      }
      document.addEventListener('mousedown', onDoc)
      return () => document.removeEventListener('mousedown', onDoc)
    }, [])

    const setRefs = React.useCallback(
      (el: HTMLSelectElement | null) => {
        nativoRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) (ref as React.MutableRefObject<HTMLSelectElement | null>).current = el
      },
      [ref]
    )

    const q = normalizar(busca.trim())
    const filtradas = React.useMemo(
      () =>
        q
          ? opcoes.filter((o) => normalizar(o.label).includes(q) || normalizar(o.value).includes(q))
          : opcoes,
      [opcoes, q]
    )
    const visiveis = filtradas.slice(0, MAX_VISIVEL)

    const rotuloAtual = opcoes.find((o) => o.value === atual)?.label ?? ''

    React.useEffect(() => {
      setDestaque(0)
    }, [busca, aberto])

    React.useEffect(() => {
      if (!aberto) return
      const el = listaRef.current?.children[destaque] as HTMLElement | undefined
      el?.scrollIntoView({ block: 'nearest' })
    }, [destaque, aberto])

    function escolher(opt: Opcao | undefined) {
      if (!opt || opt.disabled) return
      const el = nativoRef.current
      if (el) el.value = opt.value
      if (!controlado) setInterno(opt.value)
      setBusca('')
      setAberto(false)
      const alvo = el ?? ({ name, value: opt.value } as unknown as HTMLSelectElement)
      onChange?.({
        target: alvo,
        currentTarget: alvo,
        type: 'change',
      } as unknown as React.ChangeEvent<HTMLSelectElement>)
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!aberto) return setAberto(true)
        setDestaque((d) => Math.min(d + 1, visiveis.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setDestaque((d) => Math.max(d - 1, 0))
      } else if (e.key === 'Enter') {
        if (aberto) {
          // sem o preventDefault o Enter submeteria o formulário
          e.preventDefault()
          escolher(visiveis[destaque])
        }
      } else if (e.key === 'Escape') {
        setAberto(false)
        setBusca('')
      } else if (e.key === 'Tab') {
        setAberto(false)
        setBusca('')
      }
    }

    return (
      <div ref={boxRef} className={cn('relative w-full', className)}>
        <select
          ref={setRefs}
          name={name}
          id={id}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          {...(controlado
            ? { value: String(value ?? ''), onChange: () => {} }
            : { defaultValue })}
          {...props}
        >
          {children}
        </select>

        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={aberto}
            autoComplete="off"
            disabled={disabled}
            value={aberto ? busca : rotuloAtual}
            placeholder={aberto ? rotuloAtual || 'Digite para filtrar…' : undefined}
            onChange={(e) => {
              setBusca(e.target.value)
              setAberto(true)
            }}
            onFocus={() => setAberto(true)}
            onClick={() => setAberto(true)}
            onBlur={(e) => {
              onBlur?.(e as unknown as React.FocusEvent<HTMLSelectElement>)
            }}
            onKeyDown={onKeyDown}
            style={style}
            className={
              unstyled
                ? 'w-full'
                : cn(
                    'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 pr-8 text-sm shadow-xs transition-colors',
                    'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                    'disabled:cursor-not-allowed disabled:opacity-50'
                  )
            }
          />
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </div>

        {aberto && !disabled && (
          <div
            ref={listaRef}
            role="listbox"
            className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-background shadow-lg"
          >
            {visiveis.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Nenhuma opção encontrada.</p>
            ) : (
              visiveis.map((o, i) => (
                <button
                  key={`${o.value}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={o.value === atual}
                  disabled={o.disabled}
                  onMouseEnter={() => setDestaque(i)}
                  onClick={() => escolher(o)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed',
                    i === destaque && 'bg-muted/60',
                    o.value === atual && 'font-medium'
                  )}
                >
                  {o.label}
                </button>
              ))
            )}
            {filtradas.length > visiveis.length && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
                Mostrando {visiveis.length} de {filtradas.length}. Digite para refinar.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }
)
Select.displayName = 'Select'

export { Select }
