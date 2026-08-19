'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Banknote, Wallet, ArrowLeftRight, RefreshCw, ChevronRight,
  CheckCircle, Clock, AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatCurrency, formatDateTime, formatDate, hojeISODate } from '@/lib/utils'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface PendenteLiberacao {
  id: number
  principalAmount: number
  aceiteClienteEm: string | null
  client: { id: number; nome: string; nomeSocial: string | null }
}

interface InstallmentHoje {
  id: number
  numero: number
  dataVencimento: string
  installmentAmount: number
  totalPago: number
  saldoDevedor: number
  status: string
  loan: {
    id: number
    client: { id: number; nome: string; nomeSocial: string | null; whatsapp: string | null }
  }
}

interface PagamentoHoje {
  id: number
  valorPago: number
  dataPagamento: string
  metodoPagamento: string
  installment: {
    numero: number
    loan: { client: { nome: string; nomeSocial: string | null } }
  }
}

interface Saldo {
  saldo: number
  entradas: number
  saidas: number
}

function horasDesdeAceite(aceiteClienteEm: string | null): number {
  if (!aceiteClienteEm) return 0
  return (Date.now() - new Date(aceiteClienteEm).getTime()) / 3_600_000
}

const metodoLabel: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', transferencia: 'Transferência',
  cheque: 'Cheque', cartao: 'Cartão', mercadopago: 'Mercado Pago',
}

export default function DashboardCaixa() {
  const qc = useQueryClient()

  const [liberarModal, setLiberarModal] = useState<PendenteLiberacao | null>(null)
  const [metodoLiberacao, setMetodoLiberacao] = useState('dinheiro')
  const [dataLiberacao, setDataLiberacao] = useState(hojeISODate())
  const [obsLiberacao, setObsLiberacao] = useState('')

  const pendentesQuery = useQuery({
    queryKey: ['loans', 'pendentes-liberacao'],
    queryFn: () => api.get<PendenteLiberacao[]>('/loans/pendentes-liberacao').then(r => r.data),
    refetchInterval: 30_000,
  })

  const hojeQuery = useQuery({
    queryKey: ['installments', 'hoje'],
    queryFn: () => api.get<InstallmentHoje[]>('/installments/hoje').then(r => r.data),
    refetchInterval: 60_000,
  })

  const pagamentosQuery = useQuery({
    queryKey: ['payments', 'hoje'],
    queryFn: () => api.get<PagamentoHoje[]>('/payments/hoje').then(r => r.data),
    refetchInterval: 30_000,
  })

  const saldoQuery = useQuery({
    queryKey: ['transactions', 'saldo'],
    queryFn: () => api.get<Saldo>('/transactions/saldo').then(r => r.data),
    refetchInterval: 60_000,
  })

  const liberarMut = useMutation({
    mutationFn: (id: number) => api.patch(`/loans/${id}/liberar-capital`, {
      metodoLiberacao, dataLiberacao, observacao: obsLiberacao || undefined,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['loans', 'pendentes-liberacao'] })
      void qc.invalidateQueries({ queryKey: ['transactions', 'saldo'] })
      setLiberarModal(null)
    },
  })

  function abrirLiberacao(loan: PendenteLiberacao) {
    setLiberarModal(loan)
    setMetodoLiberacao('dinheiro')
    setDataLiberacao(hojeISODate())
    setObsLiberacao('')
  }

  const isLoading = pendentesQuery.isLoading || hojeQuery.isLoading || pagamentosQuery.isLoading || saldoQuery.isLoading

  function refetchAll() {
    pendentesQuery.refetch()
    hojeQuery.refetch()
    pagamentosQuery.refetch()
    saldoQuery.refetch()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Operações do Dia</h2>
          <p className="text-muted-foreground text-sm mt-1">{formatDate(new Date())} · atualização automática</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll} disabled={isLoading} className="gap-2">
          <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-amber-50 dark:bg-amber-950/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Liberações Pendentes</CardTitle>
            <div className="rounded-lg p-2 bg-amber-100 dark:bg-amber-900/40 text-amber-600"><Banknote className="size-4" /></div>
          </CardHeader>
          <CardContent>
            {pendentesQuery.isLoading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{pendentesQuery.data?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-green-50 dark:bg-green-950/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pagamentos Hoje</CardTitle>
            <div className="rounded-lg p-2 bg-green-100 dark:bg-green-900/40 text-green-600"><Wallet className="size-4" /></div>
          </CardHeader>
          <CardContent>
            {pagamentosQuery.isLoading ? <Skeleton className="h-8 w-20" /> : (
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{pagamentosQuery.data?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>

        <Link href="/caixa">
          <Card className="border-0 shadow-sm bg-blue-50 dark:bg-blue-950/30 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo do Dia</CardTitle>
              <div className="rounded-lg p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600"><ArrowLeftRight className="size-4" /></div>
            </CardHeader>
            <CardContent className="flex items-end justify-between">
              {saldoQuery.isLoading ? <Skeleton className="h-8 w-28" /> : (
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{formatCurrency(saldoQuery.data?.saldo ?? 0)}</p>
              )}
              <ChevronRight className="size-4 text-muted-foreground mb-1" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Liberações pendentes */}
      {((pendentesQuery.data?.length ?? 0) > 0 || pendentesQuery.isLoading) && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <Banknote className="size-4" />
              Liberações pendentes
              {(pendentesQuery.data?.length ?? 0) > 0 && (
                <Badge className="bg-amber-500 text-white text-xs">{pendentesQuery.data?.length}</Badge>
              )}
            </CardTitle>
            <Link href="/liberacoes-pendentes">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-amber-700">
                Ver todas <ChevronRight className="size-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {pendentesQuery.isLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : (
              <div className="space-y-2">
                {pendentesQuery.data?.map(loan => {
                  const horas = horasDesdeAceite(loan.aceiteClienteEm)
                  const urgente = horas > 4
                  return (
                    <div key={loan.id} className={cn(
                      'flex items-center justify-between rounded-lg px-4 py-3 border',
                      urgente
                        ? 'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-800'
                        : 'bg-white dark:bg-slate-900 border-amber-100 dark:border-amber-900',
                    )}>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{loan.client.nomeSocial ?? loan.client.nome}</p>
                          {urgente && (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <AlertCircle className="size-3" />
                              {Math.floor(horas)}h esperando
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Contrato #{loan.id} · {formatCurrency(loan.principalAmount)}
                          {loan.aceiteClienteEm && <span className="ml-1">· Aceito em {formatDateTime(loan.aceiteClienteEm)}</span>}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className={cn('ml-4 shrink-0', urgente && 'bg-red-600 hover:bg-red-700')}
                        onClick={() => abrirLiberacao(loan)}
                      >
                        Confirmar entrega →
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Parcelas do dia */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="size-4 text-blue-500" />
              Parcelas de hoje
              {(hojeQuery.data?.length ?? 0) > 0 && (
                <Badge variant="secondary" className="text-xs">{hojeQuery.data?.length}</Badge>
              )}
            </CardTitle>
            <Link href="/parcelas">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
                Ver todas <ChevronRight className="size-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {hojeQuery.isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : !hojeQuery.data?.length ? (
              <div className="text-center py-8">
                <CheckCircle className="size-8 mx-auto text-green-500 mb-2" />
                <p className="text-sm text-green-600 font-medium">Nenhuma parcela para hoje!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {hojeQuery.data.slice(0, 8).map(inst => {
                  const saldo = Number(inst.saldoDevedor) || (Number(inst.installmentAmount) - Number(inst.totalPago))
                  return (
                    <div key={inst.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5 border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{inst.loan.client.nomeSocial ?? inst.loan.client.nome}</p>
                        <p className="text-xs text-muted-foreground">Parcela {inst.numero}</p>
                      </div>
                      <div className="flex items-center gap-3 ml-3 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatCurrency(saldo)}</p>
                          {inst.status === 'atrasado' && <p className="text-xs text-red-500">em atraso</p>}
                        </div>
                        <Link href="/pagamentos/novo">
                          <Button size="sm" variant="outline" className="text-xs h-7">Pagar</Button>
                        </Link>
                      </div>
                    </div>
                  )
                })}
                {hojeQuery.data.length > 8 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">+{hojeQuery.data.length - 8} parcelas</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Últimos pagamentos do dia */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="size-4 text-green-500" />
              Pagamentos registrados hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pagamentosQuery.isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !pagamentosQuery.data?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum pagamento registrado hoje.</p>
            ) : (
              <div className="space-y-2">
                {pagamentosQuery.data.slice(0, 8).map(pag => (
                  <div key={pag.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900">
                    <div className="w-1.5 h-8 rounded-full bg-green-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {pag.installment.loan.client.nomeSocial ?? pag.installment.loan.client.nome}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(pag.dataPagamento)} · {metodoLabel[pag.metodoPagamento] ?? pag.metodoPagamento}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400 shrink-0">
                      {formatCurrency(pag.valorPago)}
                    </p>
                  </div>
                ))}
                {pagamentosQuery.data.length > 8 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">+{pagamentosQuery.data.length - 8} pagamentos</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal liberação */}
      <Dialog open={!!liberarModal} onOpenChange={o => { if (!o) setLiberarModal(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirmar entrega de capital</DialogTitle></DialogHeader>
          {liberarModal && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/50 px-4 py-3 space-y-1">
                <p className="text-sm"><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{liberarModal.client.nomeSocial ?? liberarModal.client.nome}</span></p>
                <p className="text-sm"><span className="text-muted-foreground">Valor:</span> <span className="font-semibold text-green-700 dark:text-green-400">{formatCurrency(liberarModal.principalAmount)}</span></p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Método de entrega *</label>
                <Select value={metodoLiberacao} onChange={e => setMetodoLiberacao(e.target.value)}>
                  <option value="dinheiro">Dinheiro em espécie</option>
                  <option value="pix">PIX</option>
                  <option value="ted">TED / Transferência bancária</option>
                  <option value="transferencia">Transferência interna</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Data de liberação *</label>
                <Input type="date" value={dataLiberacao} onChange={e => setDataLiberacao(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Observação (opcional)</label>
                <Input placeholder="ex: entregue pessoalmente no escritório" value={obsLiberacao} onChange={e => setObsLiberacao(e.target.value)} className="h-9" />
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-3 py-2">
                ⚠ Esta ação ativará o contrato e iniciará a contagem das parcelas.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiberarModal(null)}>Cancelar</Button>
            <Button
              onClick={() => liberarModal && liberarMut.mutate(liberarModal.id)}
              disabled={liberarMut.isPending || !metodoLiberacao || !dataLiberacao}
            >
              {liberarMut.isPending ? 'Confirmando...' : 'Confirmar entrega'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
