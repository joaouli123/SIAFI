'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, RefreshCw, Wallet, Undo2, FileDown, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatDateLocal, toNumber, METODO_PAGAMENTO } from '@/lib/utils'
import api from '@/lib/api'
import { useAuth } from '@/contexts/auth.context'

interface Payment {
  id: number
  valorPago: string
  dataPagamento: string
  metodoPagamento: string
  observacao: string | null
  desconto?: number | string | null
  descontoTipo?: string | null
  estornado: boolean
  installment: {
    id: number
    numero: number
    loan: { id: number; client: { nome: string }; consultor?: { id: number; nome: string } | null }
  }
  split?: {
    capital: number; lucro: number; comissao: number
    lucroEmpresa: number; comissaoPercentual: number
  } | null
}

interface PaymentsResponse {
  data: Payment[]
  total: number
  page: number
  lastPage: number
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const today = new Date().toISOString().split('T')[0]
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

export default function PagamentosPage() {
  const [searchInput, setSearchInput] = useState('')
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [page, setPage] = useState(1)
  const qc = useQueryClient()
  const { user } = useAuth()
  const canEstornar = user?.role === 'admin' || user?.role === 'financeiro'
  const showSplit = user?.role !== 'caixa'

  const search = useDebounce(searchInput, 400)
  useEffect(() => { setPage(1) }, [search, startDate, endDate])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', { search, startDate, endDate, page }],
    queryFn: () =>
      api.get<PaymentsResponse>('/payments', {
        params: {
          search: search || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          page,
          limit: 20,
        },
      }).then((r) => {
        // Suporte a resposta paginada ou array simples
        if (Array.isArray(r.data)) return { data: r.data, total: r.data.length, page: 1, lastPage: 1 } as PaymentsResponse
        return r.data
      }),
  })

  const estornoMut = useMutation({
    mutationFn: (id: number) => api.delete(`/payments/${id}/estornar`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      toast.success(`Estorno registrado com sucesso`)
    },
    onError: () => toast.error('Não foi possível realizar o estorno. Tente novamente.'),
  })

  function handleEstorno(id: number, valor: string) {
    if (confirm(`Estornar pagamento de ${formatCurrency(valor)}? A parcela voltará ao status anterior.`)) {
      estornoMut.mutate(id)
    }
  }

  const totalRecebido = data?.data.reduce((s, p) => s + toNumber(p.valorPago), 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pagamentos</h1>
          <p className="text-muted-foreground text-sm mt-1">Histórico de recebimentos</p>
        </div>
        <Link href="/pagamentos/novo">
          <Button className="gap-2"><Plus className="size-4" />Registrar Pagamento</Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">De</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Até</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36 text-sm" />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="size-3.5" />Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>Erro ao carregar pagamentos.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">Tentar novamente</Button>
            </div>
          ) : !data?.data.length ? (
            <div className="p-8 text-center">
              <Wallet className="size-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm font-medium">
                {searchInput || startDate || endDate ? 'Nenhum pagamento no período.' : 'Nenhum pagamento encontrado.'}
              </p>
              {(searchInput || startDate !== firstOfMonth || endDate !== today) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => { setSearchInput(''); setStartDate(firstOfMonth); setEndDate(today) }}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Empréstimo</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Parcela</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Desconto</th>
                    {showSplit && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Capital</th>}
                    {showSplit && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Comissão</th>}
                    {showSplit && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Lucro Empresa</th>}
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Método</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Data</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((p) => (
                    <tr key={p.id} className={`border-b border-border hover:bg-muted/20 ${p.estornado ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-medium">
                        {p.installment?.loan?.client?.nome ?? '—'}
                        {p.estornado && <Badge variant="outline" className="ml-2 text-xs">Estornado</Badge>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        <Link href={`/emprestimos/${p.installment?.loan?.id}`} className="hover:underline">
                          #{p.installment?.loan?.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground hidden lg:table-cell">
                        P{p.installment?.numero}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">
                        {formatCurrency(p.valorPago)}
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell" title={p.descontoTipo === 'encargos' ? 'Desconto sobre encargos' : 'Desconto sobre saldo'}>
                        {toNumber(p.desconto) > 0
                          ? <span className="text-orange-600">{formatCurrency(toNumber(p.desconto))}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      {showSplit && (
                        <td className="px-4 py-3 text-right hidden xl:table-cell" title="Repõe o capital emprestado">
                          {p.split ? formatCurrency(p.split.capital) : '—'}
                        </td>
                      )}
                      {showSplit && (
                        <td className="px-4 py-3 text-right hidden xl:table-cell text-emerald-700 dark:text-emerald-400" title={p.split ? `${p.split.comissaoPercentual}% do lucro · ${p.installment?.loan?.consultor?.nome ?? 'sem consultor'}` : ''}>
                          {p.split && p.split.comissao > 0 ? formatCurrency(p.split.comissao) : '—'}
                        </td>
                      )}
                      {showSplit && (
                        <td className="px-4 py-3 text-right hidden xl:table-cell text-blue-700 dark:text-blue-400">
                          {p.split && p.split.lucroEmpresa > 0 ? formatCurrency(p.split.lucroEmpresa) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant="outline">{METODO_PAGAMENTO[p.metodoPagamento] ?? p.metodoPagamento}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {formatDateLocal(p.dataPagamento)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={async () => {
                              const res = await api.get(`/export/pagamentos/${p.id}/recibo`, { responseType: 'blob' })
                              const a = document.createElement('a')
                              a.href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }))
                              a.download = `recibo-${p.id}.pdf`
                              a.click()
                              URL.revokeObjectURL(a.href)
                            }}
                          >
                            <FileDown className="size-3" />Recibo
                          </Button>
                          {canEstornar && !p.estornado && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                              onClick={() => handleEstorno(p.id, p.valorPago)}
                              disabled={estornoMut.isPending && estornoMut.variables === p.id}
                            >
                              <Undo2 className="size-3" />Estornar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  {data.total} pagamento{data.total !== 1 ? 's' : ''}
                </p>
                {totalRecebido > 0 && (
                  <p className="text-sm font-medium text-green-600">
                    Total: {formatCurrency(totalRecebido)}
                  </p>
                )}
              </div>
              {data.lastPage > 1 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                  <span className="flex items-center text-sm text-muted-foreground px-2">{page} / {data.lastPage}</span>
                  <Button variant="outline" size="sm" disabled={page === data.lastPage} onClick={() => setPage((p) => p + 1)}>Próximo</Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
