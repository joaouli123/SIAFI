'use client'

import { useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import Link from 'next/link'
import { RefreshCw, CheckCircle2, Search, Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ClienteCombobox } from '@/components/ui/cliente-combobox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn, formatCurrency, formatDateLocal, formatCPF, toNumber, STATUS_INSTALLMENT } from '@/lib/utils'
import { useAuth } from '@/contexts/auth.context'
import api from '@/lib/api'

interface Installment {
  id: number
  numero: number
  installmentAmount: string
  dataVencimento: string
  status: string
  totalPago: string
  saldoDevedor: string
  capitalRestante?: string
  moraAcumulada: string
  multaAplicada: string
  observacao?: string | null
  loan: { id: number; client: { id: number; nome: string; cpf?: string | null; consultor?: { id: number; nome: string } | null }; consultor?: { id: number; nome: string } | null }
}

interface TotaisParcelas {
  quantidade: number
  capital: number
  valor: number
  pago: number
  saldo: number
  encargos: number
}

interface PaginatedInstallments {
  data: Installment[]
  meta: { total: number; page: number; limit: number; lastPage: number }
  totais?: TotaisParcelas
}

export default function ParcelasPage() {
  const { user } = useAuth()
  const showSplit = user?.role !== 'caixa'
  const qc = useQueryClient()

  const [obsModal, setObsModal] = useState<{ id: number; obs: string } | null>(null)

  const obsMut = useMutation({
    mutationFn: (data: { id: number; observacao: string }) => api.patch(`/installments/${data.id}`, { observacao: data.observacao }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['installments'] })
      setObsModal(null)
      toast.success('Observação salva com sucesso')
    },
    onError: () => toast.error('Erro ao salvar observação')
  })

  const [fStatus, setFStatus] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [fStart, setFStart] = useState('')
  const [fEnd, setFEnd] = useState('')
  const [fObs, setFObs] = useState('')
  const [fLoanId, setFLoanId] = useState('')
  const [fConsultor, setFConsultor] = useState('')
  const [fPage, setFPage] = useState(1)
  const showConsultorFilter = user?.role === 'admin' || user?.role === 'financeiro'

  const pagedParams = useMemo(() => ({
    status: fStatus || undefined,
    search: fSearch || undefined,
    startDate: fStart || undefined,
    endDate: fEnd || undefined,
    comObservacao: fObs || undefined,
    loanId: fLoanId ? Number(fLoanId) : undefined,
    consultorId: fConsultor ? Number(fConsultor) : undefined,
    page: fPage,
    limit: 50,
  }), [fStatus, fSearch, fStart, fEnd, fObs, fLoanId, fConsultor, fPage])

  const { data: pagedResp, isLoading, refetch } = useQuery<PaginatedInstallments>({
    queryKey: ['installments', 'paged', pagedParams],
    queryFn: () => api.get<PaginatedInstallments>('/installments', { params: pagedParams }).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  const { data: consultores } = useQuery<{ id: number; nome: string }[]>({
    queryKey: ['clients-consultores'],
    queryFn: () => api.get<{ id: number; nome: string }[]>('/clients/consultores').then(r => r.data),
    enabled: showConsultorFilter,
  })

  const activeData = pagedResp?.data
  const meta = pagedResp?.meta
  // Os totais vem do backend somando o FILTRO INTEIRO. Somar so as 50 linhas da pagina
  // dava um total do capital e das parcelas que mudava a cada pagina e nao fechava com
  // a carteira; a soma local so entra como fallback se o backend nao mandar totais.
  const totais = pagedResp?.totais

  const hojeD = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const diasAtraso = (dataVencimento: string) => {
    const venc = new Date(dataVencimento); venc.setHours(0, 0, 0, 0)
    return Math.max(0, Math.floor((hojeD.getTime() - venc.getTime()) / 86400000))
  }

  const saldoDe = (i: Installment) => {
    if (i.status === 'pago' || i.status === 'cancelado') return 0
    const saldoRegistrado = toNumber(i.saldoDevedor)
    return saldoRegistrado > 0.005
      ? saldoRegistrado
      : Math.max(0, toNumber(i.installmentAmount) - toNumber(i.totalPago))
  }

  const totalValor = activeData?.reduce((s, i) => {
    const venc = new Date(i.dataVencimento); venc.setHours(0, 0, 0, 0)
    const isOverdue = i.status === 'atrasado' || (saldoDe(i) > 0 && venc < hojeD)
    const encargos = toNumber(i.moraAcumulada) + toNumber(i.multaAplicada)
    const saldoAtual = saldoDe(i) + (isOverdue ? encargos : 0)
    const valorAtualizado = i.status === 'cancelado'
      ? toNumber(i.installmentAmount)
      : Math.max(toNumber(i.installmentAmount), toNumber(i.totalPago) + saldoAtual)
    return s + valorAtualizado
  }, 0) ?? 0

  const totalPago     = activeData?.reduce((s, i) => s + toNumber(i.totalPago), 0) ?? 0
  const totalCapital  = activeData?.reduce((s, i) => s + toNumber(i.capitalRestante), 0) ?? 0

  const totalSaldo = activeData?.reduce((s, i) => {
    const venc = new Date(i.dataVencimento); venc.setHours(0, 0, 0, 0)
    const isOverdue = i.status === 'atrasado' || (saldoDe(i) > 0 && venc < hojeD)
    const encargos = toNumber(i.moraAcumulada) + toNumber(i.multaAplicada)
    return s + saldoDe(i) + (isOverdue ? encargos : 0)
  }, 0) ?? 0

  const totalEncargos = activeData?.reduce((s, i) => s + toNumber(i.moraAcumulada) + toNumber(i.multaAplicada), 0) ?? 0

  const fCapital  = totais?.capital  ?? totalCapital
  const fValor    = totais?.valor    ?? totalValor
  const fPago     = totais?.pago     ?? totalPago
  const fSaldo    = totais?.saldo    ?? totalSaldo
  const fEncargos = totais?.encargos ?? totalEncargos

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parcelas</h1>
          <p className="text-muted-foreground text-sm mt-1">Todas as parcelas do sistema</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="size-3.5" />Atualizar
        </Button>
      </div>

      <div className="bg-card border border-border/40 rounded-xl p-3 shadow-sm flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 w-full min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Buscar por cliente ou CPF..." value={fSearch} onChange={(e) => { setFSearch(e.target.value); setFPage(1) }} />
        </div>

        {showConsultorFilter && (
          <div className="w-full lg:w-[220px] shrink-0">
            <ClienteCombobox
              clientes={consultores ?? []}
              value={fConsultor ? Number(fConsultor) : null}
              onSelect={(c) => { setFConsultor(c ? String(c.id) : ''); setFPage(1) }}
              placeholder="Consultor..."
              avulsoLabel="Todos os consultores"
              vazioLabel="Nenhum consultor encontrado."
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <Input type="number" placeholder="Nº Empréstimo" className="w-32 h-9" value={fLoanId} onChange={(e) => { setFLoanId(e.target.value); setFPage(1) }} />

          <Select className="w-auto min-w-[140px] h-9" value={fStatus} onChange={(e) => { setFStatus(e.target.value); setFPage(1) }}>
            <option value="">Status: Todos</option>
            <option value="pendente">Pendente</option>
            <option value="parcialmente_pago">Parcialmente pago</option>
            <option value="pago">Pago</option>
            <option value="atrasado">Atrasado</option>
            <option value="cancelado">Cancelado</option>
          </Select>

          <Select className="w-auto min-w-[160px] h-9 hidden md:block" value={fObs} onChange={(e) => { setFObs(e.target.value); setFPage(1) }}>
            <option value="">Todas observações</option>
            <option value="true">Com observação</option>
            <option value="false">Sem observação</option>
          </Select>

          <div className="flex items-center gap-1.5 bg-background rounded-lg border px-2 h-9">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Venc:</span>
            <Input type="date" value={fStart} onChange={(e) => { setFStart(e.target.value); setFPage(1) }} className="w-[125px] h-7 border-0 p-1 bg-transparent text-sm shadow-none focus-visible:ring-0" />
            <span className="text-muted-foreground text-xs">até</span>
            <Input type="date" value={fEnd} onChange={(e) => { setFEnd(e.target.value); setFPage(1) }} className="w-[125px] h-7 border-0 p-1 bg-transparent text-sm shadow-none focus-visible:ring-0" />
          </div>

          {(fStart || fEnd) && (
            <Button variant="ghost" size="icon" onClick={() => { setFStart(''); setFEnd(''); setFPage(1) }} className="size-8 text-muted-foreground hover:text-destructive" title="Limpar datas">
              <RefreshCw className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card>
      ) : !activeData?.length ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="font-semibold text-green-700 dark:text-green-400">Nenhuma parcela neste filtro</h3>
            <p className="text-muted-foreground text-sm mt-1">Nenhuma parcela encontrada para os filtros selecionados.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="tabela-rolavel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell whitespace-nowrap">CPF</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground min-w-[240px]">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Consultor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Empréstimo</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vencimento</th>
                    {showSplit && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Capital</th>}
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                    {showSplit && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Pago</th>}
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Juros</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Atraso</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Observação</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="sticky right-0 z-20 min-w-[84px] bg-muted/95 text-right px-2 py-3 font-medium text-muted-foreground shadow-[-4px_0_8px_-6px_rgba(0,0,0,0.35)]">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {activeData.map(inst => {
                    const originalSaldo = saldoDe(inst)
                    const encargos = toNumber(inst.moraAcumulada) + toNumber(inst.multaAplicada)
                    const ist = STATUS_INSTALLMENT[inst.status] ?? { label: inst.status, variant: 'outline' as const }
                    const vencD = new Date(inst.dataVencimento); vencD.setHours(0, 0, 0, 0)
                    const vencida   = originalSaldo > 0 && vencD < hojeD
                    const venceHoje = originalSaldo > 0 && vencD.getTime() === hojeD.getTime()

                    const isOverdue = inst.status === 'atrasado' || vencida
                    const dias = isOverdue ? diasAtraso(inst.dataVencimento) : 0
                    const displaySaldo = isOverdue ? originalSaldo + encargos : originalSaldo
                    const displayValor = inst.status === 'cancelado'
                      ? toNumber(inst.installmentAmount)
                      : Math.max(toNumber(inst.installmentAmount), toNumber(inst.totalPago) + displaySaldo)

                    return (
                      <tr key={inst.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs hidden md:table-cell">
                          {inst.loan.client.cpf ? formatCPF(inst.loan.client.cpf) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/clientes/${inst.loan.client.id}`} className="hover:underline block">
                            <span className="font-medium">{inst.loan.client.nome}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                          {inst.loan.client?.consultor?.nome ? (
                            <span className="text-xs truncate max-w-[100px] block" title={inst.loan.client.consultor.nome}>
                              {inst.loan.client.consultor.nome}
                            </span>
                          ) : (
                            <span className="text-xs italic opacity-50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                          <Link href={`/emprestimos/${inst.loan.id}`} className="hover:underline">Empréstimo #{inst.loan.id} (P{inst.numero})</Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('font-medium', vencida ? 'text-destructive' : venceHoje ? 'text-amber-600' : 'text-muted-foreground')}>
                            {formatDateLocal(inst.dataVencimento)}
                          </span>
                        </td>
                        {showSplit && (
                          <td className="px-4 py-3 text-right font-medium hidden lg:table-cell" title="Capital da parcela ainda não recuperado">
                            {toNumber(inst.capitalRestante) > 0 ? formatCurrency(inst.capitalRestante) : '—'}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-medium">
                          <div>{formatCurrency(displayValor)}</div>
                          {displayValor > toNumber(inst.installmentAmount) + 0.005 && (
                            <div className="text-[10px] text-muted-foreground">Original: {formatCurrency(toNumber(inst.installmentAmount))}</div>
                          )}
                        </td>
                        {showSplit && (
                          <td className="px-4 py-3 text-right text-green-600 hidden lg:table-cell">{formatCurrency(inst.totalPago)}</td>
                        )}
                        <td className={cn('px-4 py-3 text-right font-bold', displaySaldo > 0 ? 'text-destructive' : 'text-green-600')}>
                          <div>{displaySaldo > 0 ? formatCurrency(displaySaldo) : '—'}</div>
                          {isOverdue && encargos > 0 && originalSaldo > 0 && (
                            <div className="text-[10px] text-muted-foreground font-normal">Original: {formatCurrency(originalSaldo)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-orange-600 hidden md:table-cell">
                          {isOverdue && encargos > 0 ? formatCurrency(encargos) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center hidden md:table-cell">
                          {dias > 0 ? <Badge variant="destructive">{dias}d</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <div className="flex items-center justify-center gap-1">
                            <span className="truncate max-w-[120px] text-xs text-muted-foreground" title={inst.observacao || ''}>
                              {inst.observacao || <span className="italic opacity-50">vazio</span>}
                            </span>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => setObsModal({ id: inst.id, obs: inst.observacao || '' })}>
                              <Pencil className="size-3" />
                            </Button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center"><Badge variant={ist.variant}>{ist.label}</Badge></td>
                        <td className="sticky right-0 z-10 min-w-[84px] bg-card px-2 py-3 text-right whitespace-nowrap shadow-[-4px_0_8px_-6px_rgba(0,0,0,0.35)]">
                          {inst.status !== 'pago' && inst.status !== 'cancelado' ? (
                            <Link href={`/pagamentos/novo?parcelaId=${inst.id}`}>
                              <Button size="sm" variant="outline" className="h-7 text-xs">Pagar</Button>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 border-t font-medium text-sm">
                    <td colSpan={5} className="px-4 py-2.5 text-xs text-muted-foreground">
                      {`TOTAL — ${(totais?.quantidade ?? meta?.total ?? activeData.length).toLocaleString('pt-BR')} parcela${(totais?.quantidade ?? meta?.total ?? activeData.length) !== 1 ? 's' : ''}`}
                      <span className="ml-1 opacity-70">{totais ? '(filtro completo)' : '(esta página)'}</span>
                    </td>
                    {showSplit && (
                      <td className="px-4 py-2.5 text-right text-xs hidden lg:table-cell">{formatCurrency(fCapital)}</td>
                    )}
                    <td className="px-4 py-2.5 text-right text-xs">{formatCurrency(fValor)}</td>
                    {showSplit && (
                      <td className="px-4 py-2.5 text-right text-xs text-green-600 hidden lg:table-cell">{formatCurrency(fPago)}</td>
                    )}
                    <td className="px-4 py-2.5 text-right text-xs text-destructive">{formatCurrency(fSaldo)}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-orange-600 hidden md:table-cell">
                      {fEncargos > 0 ? formatCurrency(fEncargos) : '—'}
                    </td>
                    <td className="hidden md:table-cell" />
                    <td className="hidden xl:table-cell" />
                    <td />
                    <td className="sticky right-0 z-10 bg-muted/40" />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Resumo do filtro: as colunas Capital e Pago somem abaixo de lg, e era
                justamente o total do capital que o operador precisava enxergar. */}
            <div className="border-t border-border bg-muted/30 px-4 py-3 flex flex-wrap gap-x-8 gap-y-3">
              {showSplit && (
                <div>
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Total do capital</span>
                  <span className="font-semibold">{formatCurrency(fCapital)}</span>
                </div>
              )}
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Total das parcelas</span>
                <span className="font-semibold">{formatCurrency(fValor)}</span>
              </div>
              {showSplit && (
                <div>
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Total pago</span>
                  <span className="font-semibold text-green-600">{formatCurrency(fPago)}</span>
                </div>
              )}
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Saldo em aberto</span>
                <span className="font-semibold text-destructive">{formatCurrency(fSaldo)}</span>
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Juros e multa</span>
                <span className="font-semibold text-orange-600">{fEncargos > 0 ? formatCurrency(fEncargos) : '—'}</span>
              </div>
              <div className="ml-auto self-end text-xs text-muted-foreground">
                {totais
                  ? `${totais.quantidade.toLocaleString('pt-BR')} parcela${totais.quantidade !== 1 ? 's' : ''} no filtro`
                  : `${activeData.length} parcela${activeData.length !== 1 ? 's' : ''} nesta página`}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {meta && meta.lastPage > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Página {meta.page} de {meta.lastPage} · {meta.total} parcela{meta.total !== 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={fPage <= 1} onClick={() => setFPage((p) => Math.max(1, p - 1))}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={fPage >= meta.lastPage} onClick={() => setFPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      {/* Modal Observação */}
      <Dialog open={!!obsModal} onOpenChange={o => { if (!o) setObsModal(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Observação da Parcela</DialogTitle></DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Digite a observação..."
              rows={4}
              value={obsModal?.obs || ''}
              onChange={(e) => setObsModal(prev => prev ? { ...prev, obs: e.target.value } : null)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setObsModal(null)}>Cancelar</Button>
            <Button onClick={() => obsModal && obsMut.mutate({ id: obsModal.id, observacao: obsModal.obs })} disabled={obsMut.isPending}>
              {obsMut.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
