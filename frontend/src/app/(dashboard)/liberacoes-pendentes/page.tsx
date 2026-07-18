'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Banknote, AlertCircle, CheckCircle, RefreshCw, Clock, Search,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatDateTime, hojeISODate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface PendenteLiberacao {
  id: number
  principalAmount: number
  numeroParcelas: number
  aceiteClienteEm: string | null
  aceiteClienteIp: string | null
  createdAt: string
  client: { id: number; nome: string; nomeSocial: string | null; whatsapp: string | null }
  consultor?: { nome: string } | null
}

function horasDesdeAceite(aceiteClienteEm: string | null): number {
  if (!aceiteClienteEm) return 0
  return (Date.now() - new Date(aceiteClienteEm).getTime()) / 3_600_000
}

function UrgenciaBadge({ horas }: { horas: number }) {
  if (horas < 1) return <Badge variant="secondary" className="text-xs gap-1"><Clock className="size-3" />Novo</Badge>
  if (horas < 4) return <Badge className="text-xs gap-1 bg-amber-500 text-white"><Clock className="size-3" />{Math.floor(horas)}h</Badge>
  return (
    <Badge variant="destructive" className="text-xs gap-1">
      <AlertCircle className="size-3" />{Math.floor(horas)}h esperando
    </Badge>
  )
}

export default function LiberacoesPendentesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [liberarModal, setLiberarModal] = useState<PendenteLiberacao | null>(null)
  const [metodo, setMetodo] = useState('dinheiro')
  const [dataLib, setDataLib] = useState(hojeISODate())
  const [obs, setObs] = useState('')
  const [liberadoId, setLiberadoId] = useState<number | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery<PendenteLiberacao[]>({
    queryKey: ['loans', 'pendentes-liberacao'],
    queryFn: () => api.get('/loans/pendentes-liberacao').then(r => r.data),
    refetchInterval: 30_000,
  })

  const liberarMut = useMutation({
    mutationFn: (id: number) =>
      api.patch(`/loans/${id}/liberar-capital`, {
        metodoLiberacao: metodo,
        dataLiberacao: dataLib,
        observacao: obs || undefined,
      }),
    onSuccess: (_, id) => {
      setLiberadoId(id)
      setLiberarModal(null)
      void qc.invalidateQueries({ queryKey: ['loans', 'pendentes-liberacao'] })
      void qc.invalidateQueries({ queryKey: ['transactions', 'saldo'] })
      setTimeout(() => setLiberadoId(null), 4000)
    },
  })

  function abrirModal(loan: PendenteLiberacao) {
    setLiberarModal(loan)
    setMetodo('dinheiro')
    setDataLib(hojeISODate())
    setObs('')
  }

  const filtered = (data ?? []).filter(loan => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const nome = (loan.client.nomeSocial ?? loan.client.nome).toLowerCase()
    return nome.includes(q) || String(loan.id).includes(q)
  })

  const urgentes = filtered.filter(l => horasDesdeAceite(l.aceiteClienteEm) >= 4).length

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Banknote className="size-6 text-amber-500" />
            Liberações Pendentes
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Contratos com aceite digital aguardando entrega de capital
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* Alerta urgência */}
      {urgentes > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            <strong>{urgentes}</strong> contrato{urgentes !== 1 ? 's' : ''} aguardando há mais de 4 horas — confirme a entrega o quanto antes.
          </span>
        </div>
      )}

      {/* Sucesso */}
      {liberadoId && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          <CheckCircle className="size-4 shrink-0" />
          Capital do contrato #{liberadoId} liberado com sucesso! Contrato ativado.
        </div>
      )}

      {/* Busca + contador */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Buscar cliente ou contrato..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {!isLoading && (
          <span className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length !== 1 ? 'contratos' : 'contrato'}
            {data && data.length !== filtered.length && ` de ${data.length}`}
          </span>
        )}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-muted-foreground gap-2">
            <CheckCircle className="size-10 text-green-500" />
            <p className="font-medium text-green-600">
              {search ? 'Nenhum contrato encontrado.' : 'Nenhuma liberação pendente no momento!'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered
            .sort((a, b) => horasDesdeAceite(b.aceiteClienteEm) - horasDesdeAceite(a.aceiteClienteEm))
            .map(loan => {
              const horas = horasDesdeAceite(loan.aceiteClienteEm)
              const urgente = horas >= 4
              return (
                <Card key={loan.id} className={cn(
                  'transition-shadow hover:shadow-sm',
                  urgente && 'border-red-300 dark:border-red-800',
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-base">
                            {loan.client.nomeSocial ?? loan.client.nome}
                          </span>
                          <UrgenciaBadge horas={horas} />
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <span>Contrato <strong className="text-foreground">#{loan.id}</strong></span>
                          <span>Capital: <strong className="text-foreground">{formatCurrency(Number(loan.principalAmount))}</strong></span>
                          <span>{loan.numeroParcelas} parcelas</span>
                          {loan.consultor && <span>Consultor: {loan.consultor.nome}</span>}
                        </div>
                        {loan.aceiteClienteEm && (
                          <p className="text-xs text-muted-foreground">
                            Aceito pelo cliente em {formatDateTime(loan.aceiteClienteEm)}
                            {loan.aceiteClienteIp && ` · IP: ${loan.aceiteClienteIp}`}
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={() => abrirModal(loan)}
                        className={cn('shrink-0', urgente && 'bg-red-600 hover:bg-red-700')}
                      >
                        Confirmar entrega →
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
        </div>
      )}

      {/* Modal de liberação */}
      <Dialog open={!!liberarModal} onOpenChange={o => { if (!o) setLiberarModal(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar entrega de capital</DialogTitle>
          </DialogHeader>
          {liberarModal && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg bg-muted/50 px-4 py-3 space-y-1.5 text-sm">
                <p><span className="text-muted-foreground">Cliente:</span>{' '}
                  <span className="font-semibold">{liberarModal.client.nomeSocial ?? liberarModal.client.nome}</span>
                </p>
                <p><span className="text-muted-foreground">Contrato:</span>{' '}
                  <span className="font-medium">#{liberarModal.id}</span>
                </p>
                <p><span className="text-muted-foreground">Valor a liberar:</span>{' '}
                  <span className="font-semibold text-green-700 dark:text-green-400 text-base">
                    {formatCurrency(Number(liberarModal.principalAmount))}
                  </span>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Método de entrega <span className="text-destructive">*</span></Label>
                <Select value={metodo} onChange={e => setMetodo(e.target.value)}>
                  <option value="dinheiro">Dinheiro em espécie</option>
                  <option value="pix">PIX</option>
                  <option value="ted">TED / Transferência bancária</option>
                  <option value="transferencia">Transferência interna</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Data de liberação <span className="text-destructive">*</span></Label>
                <Input type="date" value={dataLib} onChange={e => setDataLib(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Observação <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input
                  placeholder="Ex: entregue pessoalmente no escritório"
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                />
              </div>

              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                ⚠ Esta ação ativará o contrato, iniciará a contagem das parcelas e registrará uma saída no caixa.
              </div>

              {liberarMut.isError && (
                <p className="text-xs text-destructive">Erro ao confirmar liberação. Tente novamente.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiberarModal(null)}>Cancelar</Button>
            <Button
              onClick={() => liberarModal && liberarMut.mutate(liberarModal.id)}
              disabled={liberarMut.isPending || !metodo || !dataLib}
            >
              {liberarMut.isPending ? 'Confirmando...' : 'Confirmar entrega'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
