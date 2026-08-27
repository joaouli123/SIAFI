'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, RefreshCw, Wallet, Undo2, FileDown, FileSpreadsheet, Calendar, Landmark, Percent, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClienteCombobox } from '@/components/ui/cliente-combobox'
import { ComboboxTexto } from '@/components/ui/combobox-texto'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatDateLocal, formatCPF, toNumber, hojeISODate, primeiroDiaMesISO } from '@/lib/utils'
import api from '@/lib/api'
import { useAuth } from '@/contexts/auth.context'

interface Payment {
  id: number
  valorPago: string
  dataPagamento: string
  metodoPagamento: string
  contaDestino?: string | null
  observacao: string | null
  desconto?: number | string | null
  descontoTipo?: string | null
  estornado: boolean
  installment: {
    id: number
    numero: number
    loan: { id: number; client: { nome: string; cpf?: string | null; consultor?: { id: number; nome: string } | null } }
  }
  split?: {
    capital: number; lucro: number; comissao: number; comissaoAdministrador?: number
    lucroEmpresa: number; comissaoPercentual: number; comissaoAdministradorPercentual?: number
  } | null
}

interface PaymentsResponse {
  data: Payment[]
  total: number
  page: number
  lastPage: number
  totais?: {
    recebido: number; desconto: number
    capital?: number; lucro?: number; comissao?: number; comissaoAdministrador?: number; lucroEmpresa?: number
  }
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const today = hojeISODate()
const firstOfMonth = primeiroDiaMesISO()

export default function PagamentosPage() {
  const [searchInput, setSearchInput] = useState('')
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [consultorId, setConsultorId] = useState('')
  const [contaInput, setContaInput] = useState('')
  // Percentual digitado na tela: simula sem gravar nada. Vazio = usa o do contrato/baixa.
  const [simConsultor, setSimConsultor] = useState('')
  const [simAdmin, setSimAdmin] = useState('')
  const [page, setPage] = useState(1)
  const qc = useQueryClient()
  const { user } = useAuth()
  const canEstornar = user?.role === 'admin' || user?.role === 'financeiro'
  const showSplit = user?.role !== 'caixa'

  const search = useDebounce(searchInput, 400)
  const contaDestino = useDebounce(contaInput, 400)
  const simComissao = useDebounce(simConsultor, 400)
  const simComissaoAdmin = useDebounce(simAdmin, 400)
  useEffect(() => { setPage(1) }, [search, startDate, endDate, consultorId, contaDestino])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', { search, startDate, endDate, consultorId, contaDestino, simComissao, simComissaoAdmin, page }],
    queryFn: () =>
      api.get<PaymentsResponse>('/payments', {
        params: {
          search: search || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          consultorId: consultorId ? Number(consultorId) : undefined,
          contaDestino: contaDestino || undefined,
          simComissaoPercentual: simComissao !== '' ? Number(simComissao) : undefined,
          simComissaoAdministradorPercentual: simComissaoAdmin !== '' ? Number(simComissaoAdmin) : undefined,
          page,
          limit: 20,
        },
      }).then((r) => {
        // Suporte a resposta paginada ou array simples
        if (Array.isArray(r.data)) return { data: r.data, total: r.data.length, page: 1, lastPage: 1 } as PaymentsResponse
        return r.data
      }),
  })

  const { data: consultores } = useQuery<{id: number; nome: string}[]>({
    queryKey: ['consultores'],
    queryFn: () => api.get<{id: number; nome: string}[]>('/clients/consultores').then((r) => r.data),
    enabled: user?.role === 'admin' || user?.role === 'financeiro',
  })

  const { data: contas } = useQuery<string[]>({
    queryKey: ['payments-contas'],
    queryFn: () => api.get<string[]>('/payments/contas').then((r) => r.data),
  })

  // Percentuais padrao da casa (Configuracoes). So admin le /settings.
  const podeSalvarPadrao = user?.role === 'admin'
  const { data: settings } = useQuery<{ chave: string; valor: string }[]>({
    queryKey: ['settings'],
    queryFn: () => api.get<{ chave: string; valor: string }[]>('/settings').then((r) => r.data),
    enabled: podeSalvarPadrao,
  })
  const padraoConsultor = settings?.find((x) => x.chave === 'financeiro.comissao_consultor_percentual')?.valor ?? ''
  const padraoAdmin = settings?.find((x) => x.chave === 'financeiro.comissao_administrador_percentual')?.valor ?? ''

  const padraoMut = useMutation({
    mutationFn: () =>
      api.patch('/settings', {
        entries: [
          { chave: 'financeiro.comissao_consultor_percentual', valor: simConsultor },
          { chave: 'financeiro.comissao_administrador_percentual', valor: simAdmin },
        ].filter((e) => e.valor !== ''),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Percentuais salvos como padrão. Valem para as próximas baixas.')
    },
    onError: () => toast.error('Não foi possível salvar os percentuais padrão.'),
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

  // Todos os totais são do período inteiro (agregados no backend, todo o filtro),
  // considerando apenas baixas não estornadas.
  const [exportando, setExportando] = useState(false)

  // A planilha sai com o mesmo filtro da tela (menos a paginacao), pra que o
  // arquivo bata com o que o operador esta vendo.
  async function exportarExcel() {
    setExportando(true)
    try {
      const res = await api.get('/export/pagamentos/excel', {
        responseType: 'blob',
        params: {
          search: search || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          consultorId: consultorId ? Number(consultorId) : undefined,
          contaDestino: contaDestino || undefined,
          simComissaoPercentual: simComissao !== '' ? Number(simComissao) : undefined,
          simComissaoAdministradorPercentual: simComissaoAdmin !== '' ? Number(simComissaoAdmin) : undefined,
        },
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(
        new Blob([res.data as BlobPart], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      )
      a.download = `recebimentos-${startDate || 'inicio'}-a-${endDate || hojeISODate()}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      toast.error('Não foi possível gerar a planilha.')
    } finally {
      setExportando(false)
    }
  }

  const totalRecebido = data?.totais?.recebido ?? 0
  const totalDesconto = data?.totais?.desconto ?? 0
  const totalCapital = data?.totais?.capital ?? 0
  const totalLucroGeral = data?.totais?.lucro ?? 0
  const totalLucro = data?.totais?.lucroEmpresa ?? 0
  const totalComissao = data?.totais?.comissao ?? 0
  const totalComissaoAdministrador = data?.totais?.comissaoAdministrador ?? 0

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recebimentos</h1>
          <p className="text-muted-foreground text-sm mt-1">Histórico de recebimentos</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2 text-green-700 border-green-300 hover:bg-green-50"
            onClick={exportarExcel}
            disabled={exportando}
            title="Exportar os recebimentos filtrados para Excel"
          >
            <FileSpreadsheet className="size-4" />
            {exportando ? 'Gerando...' : 'Excel'}
          </Button>
          <Link href="/pagamentos/novo">
            <Button className="gap-2"><Plus className="size-4" />Registrar Recebimento</Button>
          </Link>
        </div>
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
            {consultores && (
              <div className="w-full sm:w-[200px] shrink-0">
                <ClienteCombobox
                  clientes={consultores}
                  value={consultorId ? Number(consultorId) : null}
                  onSelect={(c) => setConsultorId(c ? String(c.id) : '')}
                  placeholder="Consultor..."
                  avulsoLabel="Todos os consultores"
                  vazioLabel="Nenhum consultor encontrado."
                />
              </div>
            )}
            <div className="relative w-44">
              <Landmark className="absolute left-3 top-[18px] -translate-y-1/2 size-4 text-muted-foreground z-10" />
              <ComboboxTexto
                value={contaInput}
                onChange={setContaInput}
                opcoes={contas}
                placeholder="Bco Recebedor"
                inputClassName="pl-9 text-sm"
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
          {showSplit && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Percent className="size-4 text-muted-foreground" />
                <span className="text-xs font-medium">Comissão sobre o Lucro Geral</span>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="sim-consultor" className="text-xs text-muted-foreground whitespace-nowrap">Consultor %</Label>
                <Input
                  id="sim-consultor"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={simConsultor}
                  onChange={(e) => setSimConsultor(e.target.value)}
                  placeholder={padraoConsultor || 'contrato'}
                  className="w-24 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="sim-admin" className="text-xs text-muted-foreground whitespace-nowrap">Administrador %</Label>
                <Input
                  id="sim-admin"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={simAdmin}
                  onChange={(e) => setSimAdmin(e.target.value)}
                  placeholder={padraoAdmin || 'contrato'}
                  className="w-24 text-sm"
                />
              </div>
              {(simConsultor !== '' || simAdmin !== '') && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setSimConsultor(''); setSimAdmin('') }}>
                  Limpar
                </Button>
              )}
              {podeSalvarPadrao && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs"
                  onClick={() => padraoMut.mutate()}
                  disabled={padraoMut.isPending || (simConsultor === '' && simAdmin === '')}
                >
                  <Save className="size-3.5" />Salvar como padrão
                </Button>
              )}
              <p className="basis-full text-[11px] text-muted-foreground">
                Em branco, cada recebimento usa o percentual do próprio contrato. Preenchido, os valores desta tela são recalculados na hora — nada é gravado e o histórico não muda.
                {podeSalvarPadrao && ' “Salvar como padrão” faz o percentual valer para as próximas baixas dos contratos que não têm o seu.'}
              </p>
            </div>
          )}
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
              {(searchInput || contaInput || startDate !== firstOfMonth || endDate !== today) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => { setSearchInput(''); setContaInput(''); setStartDate(firstOfMonth); setEndDate(today) }}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="tabela-rolavel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">CPF</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground min-w-[240px]">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Consultor</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Parcela</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell whitespace-nowrap">Pagamento</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Desconto</th>
                    {showSplit && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Capital</th>}
                    {showSplit && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Lucro Geral</th>}
                    {showSplit && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Com. Consultor</th>}
                    {showSplit && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Com. Admin.</th>}
                    {showSplit && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Lucro Empresa</th>}
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Bco Recebedor</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((p) => (
                    <tr key={p.id} className={`border-b border-border hover:bg-muted/20 ${p.estornado ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">
                        {p.installment?.loan?.client?.cpf ? formatCPF(p.installment.loan.client.cpf) : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {p.installment?.loan?.client?.nome ?? '—'}
                        {p.estornado && <Badge variant="outline" className="ml-2 text-xs">Estornado</Badge>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {p.installment?.loan?.client?.consultor?.nome ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground hidden lg:table-cell">
                        P{p.installment?.numero}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                        {formatDateLocal(p.dataPagamento)}
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
                        <td className="px-4 py-3 text-right hidden xl:table-cell text-violet-700 dark:text-violet-400" title="Valor recebido menos o capital">
                          {p.split ? formatCurrency(toNumber(p.valorPago) - p.split.capital) : '—'}
                        </td>
                      )}
                      {showSplit && (
                        <td className="px-4 py-3 text-right hidden xl:table-cell text-emerald-700 dark:text-emerald-400" title={p.split ? `${p.split.comissaoPercentual}% do lucro · ${p.installment?.loan?.client?.consultor?.nome ?? 'sem consultor'}` : ''}>
                          {p.split && p.split.comissao > 0 ? formatCurrency(p.split.comissao) : '—'}
                        </td>
                      )}
                      {showSplit && (
                        <td className="px-4 py-3 text-right hidden xl:table-cell text-violet-700 dark:text-violet-400" title={p.split ? `${p.split.comissaoAdministradorPercentual ?? 0}% do Lucro Geral` : ''}>
                          {p.split && (p.split.comissaoAdministrador ?? 0) > 0 ? formatCurrency(p.split.comissaoAdministrador ?? 0) : '—'}
                        </td>
                      )}
                      {showSplit && (
                        <td className="px-4 py-3 text-right hidden xl:table-cell text-blue-700 dark:text-blue-400" title="Lucro Geral − Comissão do Consultor − Comissão do Administrador">
                          {p.split && p.split.lucroEmpresa > 0 ? formatCurrency(p.split.lucroEmpresa) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell">
                        {p.contaDestino?.trim() ? p.contaDestino : '—'}
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
              <div className="flex items-center gap-6 flex-wrap">
                <p className="text-sm text-muted-foreground font-medium">
                  {data.total} recebimento{data.total !== 1 ? 's' : ''}
                </p>
                {totalRecebido > 0 && (
                  <p className="text-sm font-bold text-green-600">
                    Valores Recebidos: {formatCurrency(totalRecebido)}
                  </p>
                )}
                {totalCapital > 0 && showSplit && (
                  <p className="text-sm font-medium text-muted-foreground">
                    Capital: {formatCurrency(totalCapital)}
                  </p>
                )}
                {showSplit && (
                  <p className="text-sm font-bold text-violet-700 dark:text-violet-400" title="Soma de Valor recebido menos Capital no período filtrado">
                    Lucro Geral: {formatCurrency(totalLucroGeral)}
                  </p>
                )}
                {showSplit && (
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400" title="Soma da comissão dos consultores, calculada sobre o Lucro Geral do período filtrado">
                    Comissão do Consultor: {formatCurrency(totalComissao)}{simComissao !== '' && <span className="ml-1 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">simulado</span>}
                  </p>
                )}
                {showSplit && (
                  <p className="text-sm font-bold text-violet-700 dark:text-violet-400" title="Soma da comissão dos administradores, calculada sobre o Lucro Geral do período filtrado">
                    Comissão do Administrador: {formatCurrency(totalComissaoAdministrador)}{simComissaoAdmin !== '' && <span className="ml-1 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">simulado</span>}
                  </p>
                )}
                {totalLucro > 0 && showSplit && (
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400" title="Lucro Geral − Comissão do Consultor − Comissão do Administrador">
                    Lucro Empresa: {formatCurrency(totalLucro)}{(simComissao !== '' || simComissaoAdmin !== '') && <span className="ml-1 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">simulado</span>}
                  </p>
                )}
                {totalDesconto > 0 && (
                  <p className="text-sm font-medium text-orange-600">
                    Desconto: {formatCurrency(totalDesconto)}
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
