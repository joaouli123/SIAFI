'use client'

import { useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import Link from 'next/link'
import { AlertCircle, RefreshCw, Calendar, CalendarClock, CalendarRange, CheckCircle2, ListFilter, Search, Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
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
  moraAcumulada: string
  multaAplicada: string
  observacao?: string | null
  loan: { id: number; client: { id: number; nome: string; cpf?: string | null } }
}

type TabKey = 'hoje' | 'prox7' | 'prox30' | 'mes' | 'atrasado' | 'todas'

interface PaginatedInstallments {
  data: Installment[]
  meta: { total: number; page: number; limit: number; lastPage: number }
}

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function ParcelasPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<TabKey>('hoje')
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

  // Filtros da aba "Todas"
  const [fStatus, setFStatus] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [fStart, setFStart] = useState('')
  const [fEnd, setFEnd] = useState('')
  const [fObs, setFObs] = useState('')
  const [fPage, setFPage] = useState(1)
  // Mês selecionado na aba "Este mês"
  const [mesSel, setMesSel] = useState(() => new Date().toISOString().slice(0, 7))

  const hojeIso = useMemo(() => isoLocal(new Date()), [])

  function changeTab(key: TabKey) { setTab(key); setFPage(1) }

  // Abas paginadas (usam /installments com filtros de período)
  const isPaged = tab === 'prox7' || tab === 'prox30' || tab === 'mes' || tab === 'todas'

  const pagedParams = useMemo(() => {
    const base = new Date(`${hojeIso}T00:00:00`)
    const addDias = (n: number) => isoLocal(new Date(base.getFullYear(), base.getMonth(), base.getDate() + n))
    if (tab === 'prox7')  return { startDate: hojeIso, endDate: addDias(7),  aberto: 'true', page: fPage, limit: 50 }
    if (tab === 'prox30') return { startDate: hojeIso, endDate: addDias(30), aberto: 'true', page: fPage, limit: 50 }
    if (tab === 'mes') {
      const [a, m] = mesSel.split('-').map(Number)
      return { startDate: isoLocal(new Date(a, m - 1, 1)), endDate: isoLocal(new Date(a, m, 0)), page: fPage, limit: 50 }
    }
    // todas
    return {
      status: fStatus || undefined, search: fSearch || undefined,
      startDate: fStart || undefined, endDate: fEnd || undefined,
      comObservacao: fObs || undefined, page: fPage, limit: 50,
    }
  }, [tab, fPage, mesSel, fStatus, fSearch, fStart, fEnd, fObs, hojeIso])

  const { data: hoje, isLoading: loadingHoje, refetch: refetchHoje } = useQuery<Installment[]>({
    queryKey: ['installments', 'hoje'],
    queryFn: () => api.get<Installment[]>('/installments/hoje').then(r => r.data),
  })

  const { data: overdue, isLoading: loadingOverdue, refetch: refetchOverdue } = useQuery<Installment[]>({
    queryKey: ['installments', 'overdue'],
    queryFn: () => api.get<Installment[]>('/installments/overdue').then(r => r.data),
  })

  const { data: pagedResp, isLoading: loadingPaged, refetch: refetchPaged } = useQuery<PaginatedInstallments>({
    queryKey: ['installments', 'paged', pagedParams],
    queryFn: () => api.get<PaginatedInstallments>('/installments', { params: pagedParams }).then(r => r.data),
    enabled: isPaged,
    placeholderData: keepPreviousData,
  })

  const activeData = tab === 'hoje' ? hoje : tab === 'atrasado' ? overdue : pagedResp?.data
  const isLoading  = tab === 'hoje' ? loadingHoje : tab === 'atrasado' ? loadingOverdue : loadingPaged
  const meta       = isPaged ? pagedResp?.meta : undefined

  const hojeD = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const diasAtraso = (dataVencimento: string) => {
    const venc = new Date(dataVencimento); venc.setHours(0, 0, 0, 0)
    return Math.max(0, Math.floor((hojeD.getTime() - venc.getTime()) / 86400000))
  }

  const saldoDe = (i: Installment) =>
    i.status === 'cancelado' ? 0 : Math.max(0, toNumber(i.installmentAmount) - toNumber(i.totalPago))

  const totalValor = activeData?.reduce((s, i) => {
    const venc = new Date(i.dataVencimento); venc.setHours(0, 0, 0, 0)
    const isOverdue = i.status === 'atrasado' || (saldoDe(i) > 0 && venc < hojeD)
    const encargos = toNumber(i.moraAcumulada) + toNumber(i.multaAplicada)
    return s + toNumber(i.installmentAmount) + (isOverdue ? encargos : 0)
  }, 0) ?? 0

  const totalPago     = activeData?.reduce((s, i) => s + toNumber(i.totalPago), 0) ?? 0

  const totalSaldo = activeData?.reduce((s, i) => {
    const venc = new Date(i.dataVencimento); venc.setHours(0, 0, 0, 0)
    const isOverdue = i.status === 'atrasado' || (saldoDe(i) > 0 && venc < hojeD)
    const encargos = toNumber(i.moraAcumulada) + toNumber(i.multaAplicada)
    return s + saldoDe(i) + (isOverdue ? encargos : 0)
  }, 0) ?? 0

  const totalEncargos = activeData?.reduce((s, i) => s + toNumber(i.moraAcumulada) + toNumber(i.multaAplicada), 0) ?? 0

  const subtitle: Record<TabKey, string> = {
    hoje: 'Vencimentos de hoje',
    prox7: 'Parcelas que vencem nos próximos 7 dias',
    prox30: 'Parcelas que vencem nos próximos 30 dias',
    mes: 'Vencimentos do mês selecionado',
    atrasado: 'Parcelas vencidas e em atraso',
    todas: 'Todas as parcelas do sistema',
  }

  const TABS = [
    { key: 'hoje'     as const, label: 'Hoje',          icon: Calendar,      data: hoje,    color: 'text-primary border-primary',        pill: 'bg-primary/15 text-primary' },
    { key: 'prox7'    as const, label: 'Próx. 7 dias',  icon: CalendarClock, data: undefined, color: 'text-primary border-primary',      pill: 'bg-primary/15 text-primary' },
    { key: 'prox30'   as const, label: 'Próx. 30 dias', icon: CalendarClock, data: undefined, color: 'text-primary border-primary',      pill: 'bg-primary/15 text-primary' },
    { key: 'mes'      as const, label: 'Este mês',      icon: CalendarRange, data: undefined, color: 'text-primary border-primary',      pill: 'bg-primary/15 text-primary' },
    { key: 'atrasado' as const, label: 'Em Atraso',     icon: AlertCircle,   data: overdue, color: 'text-destructive border-destructive', pill: 'bg-destructive/15 text-destructive' },
    { key: 'todas'    as const, label: 'Todas',         icon: ListFilter,    data: undefined, color: 'text-primary border-primary',      pill: 'bg-primary/15 text-primary' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parcelas</h1>
          <p className="text-muted-foreground text-sm mt-1">{subtitle[tab]}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetchHoje(); refetchOverdue(); refetchPaged() }} className="gap-2">
          <RefreshCw className="size-3.5" />Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon, data: d, color, pill }) => {
          const count = d?.length ?? (tab === key ? meta?.total : undefined)
          return (
            <button
              key={key}
              onClick={() => changeTab(key)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 whitespace-nowrap',
                tab === key ? color : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />{label}
              {count != null && count > 0 && (
                <span className={cn('text-xs rounded-full px-1.5 py-0.5 font-semibold min-w-[1.2rem] text-center', tab === key ? pill : 'bg-muted text-muted-foreground')}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Seletor de mês (aba Este mês) */}
      {tab === 'mes' && (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Mês de vencimento</Label>
            <Input type="month" value={mesSel} onChange={(e) => { setMesSel(e.target.value); setFPage(1) }} className="w-44" />
          </div>
        </div>
      )}

      {/* Filtros da aba Todas */}
      {tab === 'todas' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por cliente ou CPF..." value={fSearch} onChange={(e) => { setFSearch(e.target.value); setFPage(1) }} />
            </div>
            <Select className="w-auto" value={fStatus} onChange={(e) => { setFStatus(e.target.value); setFPage(1) }}>
              <option value="">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="parcialmente_pago">Parcialmente pago</option>
              <option value="pago">Pago</option>
              <option value="atrasado">Atrasado</option>
              <option value="cancelado">Cancelado</option>
            </Select>
            <Select className="w-auto" value={fObs} onChange={(e) => { setFObs(e.target.value); setFPage(1) }}>
              <option value="">Com/sem observação</option>
              <option value="true">Com observação</option>
              <option value="false">Sem observação</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Venc. de</Label>
              <Input type="date" value={fStart} onChange={(e) => { setFStart(e.target.value); setFPage(1) }} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">até</Label>
              <Input type="date" value={fEnd} onChange={(e) => { setFEnd(e.target.value); setFPage(1) }} className="w-40" />
            </div>
            {(fStart || fEnd) && (
              <Button variant="ghost" size="sm" onClick={() => { setFStart(''); setFEnd(''); setFPage(1) }} className="text-muted-foreground">Limpar período</Button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card>
      ) : !activeData?.length ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="font-semibold text-green-700 dark:text-green-400">
              {tab === 'atrasado' ? 'Nenhuma parcela em atraso!' : 'Nenhuma parcela neste filtro'}
            </h3>
            <p className="text-muted-foreground text-sm mt-1">
              {tab === 'hoje' ? 'Sem vencimentos para o dia de hoje.'
                : tab === 'atrasado' ? 'Todos os clientes estão em dia.'
                : 'Nenhuma parcela com vencimento no período selecionado.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Parcela</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vencimento</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                    {showSplit && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Pago</th>}
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo</th>
                    {tab === 'atrasado' && (
                      <>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Atraso</th>
                      </>
                    )}
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Observação</th>
                    {isPaged && <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>}
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {activeData.map(inst => {
                    const originalSaldo = saldoDe(inst)
                    const dias  = tab === 'atrasado' ? diasAtraso(inst.dataVencimento) : 0
                    const encargos = toNumber(inst.moraAcumulada) + toNumber(inst.multaAplicada)
                    const ist = STATUS_INSTALLMENT[inst.status] ?? { label: inst.status, variant: 'outline' as const }
                    const vencD = new Date(inst.dataVencimento); vencD.setHours(0, 0, 0, 0)
                    const vencida   = originalSaldo > 0 && vencD < hojeD
                    const venceHoje = originalSaldo > 0 && vencD.getTime() === hojeD.getTime()
                    
                    const isOverdue = inst.status === 'atrasado' || vencida
                    const displayValor = isOverdue ? toNumber(inst.installmentAmount) + encargos : toNumber(inst.installmentAmount)
                    const displaySaldo = isOverdue ? originalSaldo + encargos : originalSaldo

                    return (
                      <tr key={inst.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/clientes/${inst.loan.client.id}`} className="hover:underline block">
                            {inst.loan.client.cpf && (
                              <span className="block text-xs text-muted-foreground font-mono">{formatCPF(inst.loan.client.cpf)}</span>
                            )}
                            <span className="font-medium">{inst.loan.client.nome}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                          <Link href={`/emprestimos/${inst.loan.id}`} className="hover:underline">P{inst.numero}</Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('font-medium', vencida ? 'text-destructive' : venceHoje ? 'text-amber-600' : 'text-muted-foreground')}>
                            {formatDateLocal(inst.dataVencimento)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          <div>{formatCurrency(displayValor)}</div>
                          {isOverdue && encargos > 0 && (
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
                        {tab === 'atrasado' && (
                          <>
                            <td className="px-4 py-3 text-center hidden md:table-cell"><Badge variant="destructive">{dias}d</Badge></td>
                          </>
                        )}
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
                        {isPaged && <td className="px-4 py-3 text-center"><Badge variant={ist.variant}>{ist.label}</Badge></td>}
                        <td className="px-4 py-3 text-right">
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
                    <td colSpan={3} className="px-4 py-2.5 text-xs text-muted-foreground">
                      {meta ? `${meta.total} no total` : `${activeData.length} parcela${activeData.length !== 1 ? 's' : ''}`}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs">{formatCurrency(totalValor)}</td>
                    {showSplit && (
                      <td className="px-4 py-2.5 text-right text-xs text-green-600 hidden lg:table-cell">{formatCurrency(totalPago)}</td>
                    )}
                    <td className="px-4 py-2.5 text-right text-xs text-destructive">{formatCurrency(totalSaldo)}</td>
                    {tab === 'atrasado' && (
                      <td className="hidden md:table-cell" />
                    )}
                    <td className="hidden xl:table-cell" />
                    {isPaged && <td />}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {isPaged && meta && meta.lastPage > 1 && (
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
