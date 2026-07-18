'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import Link from 'next/link'
import {
  PlusCircle, FileText, CheckCircle2, ShieldCheck, Zap, XCircle, Calculator,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate, METODO_PAGAMENTO, hojeISODate } from '@/lib/utils'
import { useAuth } from '@/contexts/auth.context'
import api from '@/lib/api'
import Decimal from 'decimal.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoanInfo {
  id: number; status: string; principalAmount: number; totalReceivable: number
  numeroParcelas: number; reparcelamentoCount: number; consultorId: number | null
  metodoPagamento: string | null
}
interface SolicitacaoItem {
  id: number; status: string; tipo: string; motivoCliente: string
  dataPrevistaPagamento?: string | null; createdAt: string
  novoValorPrincipal?: number | null; novoTargetProfit?: number | null
  novoNumeroParcelas?: number | null; novaDataInicio?: string | null
  multaAplicada?: number | null; moraAplicada?: number | null
  observacaoFinanceiro?: string | null; novoLoanId?: number | null
  aprovadoSegundaInstancia: boolean
  client:    { id: number; nome: string; whatsapp: string | null }
  loan:      LoanInfo
  consultor: { id: number; nome: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_REPARCELA: Record<string, { label: string; variant: 'outline' | 'success' | 'destructive' | 'warning' | 'secondary' }> = {
  pendente:          { label: 'Pendente',              variant: 'warning' },
  proposta_enviada:  { label: 'Proposta Enviada',      variant: 'secondary' },
  aprovado:          { label: 'Aprovado (2ª inst.)',   variant: 'success' },
  executado:         { label: 'Executado',             variant: 'outline' },
  rejeitado:         { label: 'Rejeitado',             variant: 'destructive' },
}

const TIPOS_LABEL: Record<string, string> = {
  prorrogacao:      'Prorrogação',
  reducao_parcelas: 'Redução de parcelas',
  aumento_prazo:    'Aumento de prazo',
  reducao_juros:    'Redução de juros',
  composicao_divida:'Composição de dívida',
  outro:            'Outro',
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const schemaProposta = z.object({
  novoValorPrincipal: z.coerce.number().positive(),
  novoTargetProfit:   z.coerce.number().min(0),
  novoNumeroParcelas: z.coerce.number().int().min(1).max(360),
  novaDataInicio:     z.string().min(1),
  multaAplicada:      z.coerce.number().min(0).optional(),
  moraAplicada:       z.coerce.number().min(0).optional(),
  observacaoFinanceiro: z.string().optional(),
})

const schemaRejeitar = z.object({
  motivo: z.string().optional(),
})

type PropostaForm  = z.infer<typeof schemaProposta>
type RejeitarForm  = z.infer<typeof schemaRejeitar>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeDecimal(v: unknown) {
  const d = new Decimal(v?.toString() || '0')
  return d.isNaN() ? new Decimal(0) : d
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReparcelamentosPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isAdmin    = user?.role === 'admin'
  const canProposta = user?.role === 'admin' || user?.role === 'financeiro'

  const [statusFiltro, setStatusFiltro] = useState('')
  const [openProposta, setOpenProposta] = useState<SolicitacaoItem | null>(null)
  const [openRejeitar, setOpenRejeitar] = useState<SolicitacaoItem | null>(null)
  const [confirmExecutar, setConfirmExecutar] = useState<SolicitacaoItem | null>(null)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['reparcelamentos', statusFiltro],
    queryFn: () => api.get<SolicitacaoItem[]>('/reparcelamentos', {
      params: statusFiltro ? { status: statusFiltro } : {},
    }).then(r => r.data),
  })

  // ── Mutations ────────────────────────────────────────────────────────────

  const propostaMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PropostaForm }) =>
      api.patch(`/reparcelamentos/${id}/proposta`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reparcelamentos'] }); setOpenProposta(null) },
  })

  const segundaInstMut = useMutation({
    mutationFn: (id: number) => api.patch(`/reparcelamentos/${id}/aprovar-segunda-instancia`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reparcelamentos'] }),
  })

  const rejeitarMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: RejeitarForm }) =>
      api.patch(`/reparcelamentos/${id}/rejeitar`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reparcelamentos'] }); setOpenRejeitar(null) },
  })

  const executarMut = useMutation({
    mutationFn: (id: number) => api.patch(`/reparcelamentos/${id}/executar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reparcelamentos'] }); setConfirmExecutar(null) },
  })

  // ── Forms ────────────────────────────────────────────────────────────────

  const formProposta = useForm<PropostaForm>({ resolver: zodResolver(schemaProposta) as any })
  const formRejeitar = useForm<RejeitarForm>({ resolver: zodResolver(schemaRejeitar) as any })

  const wP = formProposta.watch()
  const parcelaSimul = (() => {
    const p = safeDecimal(wP.novoValorPrincipal)
    const l = safeDecimal(wP.novoTargetProfit)
    const n = safeDecimal(wP.novoNumeroParcelas)
    if (n.isZero()) return '—'
    return formatCurrency(p.plus(l).dividedBy(n).toDecimalPlaces(2).toNumber())
  })()

  function abrirProposta(item: SolicitacaoItem) {
    setOpenProposta(item)
    formProposta.reset({
      novoValorPrincipal: Number(item.loan.principalAmount),
      novoTargetProfit:   0,
      novoNumeroParcelas: item.loan.numeroParcelas,
      novaDataInicio:     hojeISODate(),
    })
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────

  const pendCount = items.filter(i => i.status === 'pendente').length
  const tabs = [
    { label: 'Todas',             value: '' },
    { label: 'Pendentes',         value: 'pendente',         badge: pendCount },
    { label: 'Proposta Enviada',  value: 'proposta_enviada' },
    { label: 'Aprovados',         value: 'aprovado' },
    { label: 'Executados',        value: 'executado' },
    { label: 'Rejeitados',        value: 'rejeitado' },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reparcelamentos</h1>
          <p className="text-muted-foreground text-sm">Solicitações de renegociação com fluxo de aprovação em dois estágios</p>
        </div>
        <Link href="/reparcelamentos/nova">
          <Button className="gap-2"><PlusCircle className="size-4" />Nova Solicitação</Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.value} onClick={() => setStatusFiltro(tab.value)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              statusFiltro === tab.value
                ? 'text-primary border-b-2 border-primary -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
            {tab.label}
            {(tab.badge ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-orange-500 text-white text-[10px] leading-none px-1.5 py-0.5">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">Nenhuma solicitação encontrada.</div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const st = STATUS_REPARCELA[item.status] ?? { label: item.status, variant: 'outline' as const }
            const temProposta = !!item.novoValorPrincipal
            return (
              <Card key={item.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      {/* Linha 1: cliente + status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{item.client.nome}</span>
                        <Badge variant={st.variant}>{st.label}</Badge>
                        <span className="text-xs text-muted-foreground">{TIPOS_LABEL[item.tipo] ?? item.tipo}</span>
                        {item.loan.reparcelamentoCount > 0 && (
                          <span className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-semibold">
                            {item.loan.reparcelamentoCount}º reparcelamento
                          </span>
                        )}
                      </div>

                      {/* Linha 2: dados do empréstimo original */}
                      <p className="text-sm text-muted-foreground">
                        Empréstimo #{item.loan.id} · {formatCurrency(Number(item.loan.principalAmount))} · {item.loan.numeroParcelas}x
                        {item.consultor && ` · Consultor: ${item.consultor.nome}`}
                        {' · '}{formatDate(item.createdAt)}
                      </p>

                      {/* Motivo */}
                      <p className="text-sm italic text-muted-foreground">"{item.motivoCliente}"</p>

                      {/* Proposta (se existir) */}
                      {temProposta && (
                        <div className="mt-1 flex flex-wrap gap-3 text-xs">
                          <span className="text-blue-700 dark:text-blue-400 font-medium">
                            Proposta: {item.novoNumeroParcelas}x de {
                              formatCurrency(
                                (Number(item.novoValorPrincipal) + Number(item.novoTargetProfit)) / Number(item.novoNumeroParcelas)
                              )
                            }
                          </span>
                          <span>Capital: {formatCurrency(Number(item.novoValorPrincipal))}</span>
                          <span>Lucro: {formatCurrency(Number(item.novoTargetProfit))}</span>
                          {item.multaAplicada && Number(item.multaAplicada) > 0 && (
                            <span className="text-orange-600">Multa: {formatCurrency(Number(item.multaAplicada))}</span>
                          )}
                          {item.novaDataInicio && (
                            <span>Início: {formatDate(item.novaDataInicio)}</span>
                          )}
                        </div>
                      )}

                      {item.observacaoFinanceiro && (
                        <p className="text-xs text-muted-foreground">Obs.: {item.observacaoFinanceiro}</p>
                      )}

                      {item.novoLoanId && (
                        <p className="text-xs text-green-600 font-medium">
                          Novo empréstimo criado: #{item.novoLoanId}
                        </p>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex flex-wrap gap-2 shrink-0 items-start">
                      {/* Financeiro: enviar proposta */}
                      {canProposta && item.status === 'pendente' && (
                        <Button size="sm" variant="outline" className="gap-1"
                          onClick={() => abrirProposta(item)}>
                          <FileText className="size-3.5" />Proposta
                        </Button>
                      )}

                      {/* Admin: segunda instância */}
                      {isAdmin && item.status === 'proposta_enviada' && (
                        <Button size="sm" variant="outline"
                          className="gap-1 text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950/30"
                          disabled={segundaInstMut.isPending}
                          onClick={() => { if (confirm('Aprovar como segunda instância?')) segundaInstMut.mutate(item.id) }}>
                          <ShieldCheck className="size-3.5" />2ª Instância
                        </Button>
                      )}

                      {/* Financeiro: executar */}
                      {canProposta && item.status === 'aprovado' && (
                        <Button size="sm" variant="outline"
                          className="gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                          onClick={() => setConfirmExecutar(item)}>
                          <Zap className="size-3.5" />Executar
                        </Button>
                      )}

                      {/* Rejeitar */}
                      {canProposta && (item.status === 'pendente' || item.status === 'proposta_enviada') && (
                        <Button size="sm" variant="outline"
                          className="gap-1 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() => { setOpenRejeitar(item); formRejeitar.reset() }}>
                          <XCircle className="size-3.5" />Rejeitar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Modal: Proposta ─────────────────────────────────────────────── */}
      <Dialog open={!!openProposta} onOpenChange={v => !v && setOpenProposta(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <Calculator className="size-4 text-indigo-600" />
                Proposta — Reparcelamento #{openProposta?.id}
              </span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={formProposta.handleSubmit(d => propostaMut.mutate({ id: openProposta!.id, data: d }))}
            className="space-y-4">
            <div className="rounded-lg bg-muted/40 border p-3 text-sm">
              <span className="text-muted-foreground">Cliente: </span>
              <strong>{openProposta?.client.nome}</strong>
              <span className="ml-4 text-muted-foreground">Empréstimo #{openProposta?.loan.id} · {openProposta?.loan.numeroParcelas}x</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Capital Emprestado (R$)</Label>
                <Input type="number" step="0.01" min="0.01" {...formProposta.register('novoValorPrincipal')} />
              </div>
              <div className="space-y-1.5">
                <Label>Lucro Alvo (R$)</Label>
                <Input type="number" step="0.01" min="0" {...formProposta.register('novoTargetProfit')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nº de Parcelas</Label>
                <Input type="number" min="1" max="360" {...formProposta.register('novoNumeroParcelas')} />
              </div>
              <div className="space-y-1.5">
                <Label>Data da 1ª Parcela</Label>
                <Input type="date" {...formProposta.register('novaDataInicio')} />
              </div>
            </div>
            {/* Simulação inline */}
            <div className="rounded-lg border bg-muted/40 p-3 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">Valor por parcela</span>
              <span className="font-bold text-blue-700 dark:text-blue-400 text-base">{parcelaSimul}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Multa Aplicada (R$) — opcional</Label>
                <Input type="number" step="0.01" min="0" placeholder="0,00" {...formProposta.register('multaAplicada')} />
              </div>
              <div className="space-y-1.5">
                <Label>Mora Aplicada (R$) — opcional</Label>
                <Input type="number" step="0.01" min="0" placeholder="0,00" {...formProposta.register('moraAplicada')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Input placeholder="Condições especiais, negociação..." {...formProposta.register('observacaoFinanceiro')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenProposta(null)}>Cancelar</Button>
              <Button type="submit" disabled={propostaMut.isPending}>
                {propostaMut.isPending ? 'Enviando...' : 'Enviar Proposta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Rejeitar ─────────────────────────────────────────────── */}
      <Dialog open={!!openRejeitar} onOpenChange={v => !v && setOpenRejeitar(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rejeitar Solicitação #{openRejeitar?.id}</DialogTitle></DialogHeader>
          <form onSubmit={formRejeitar.handleSubmit(d => rejeitarMut.mutate({ id: openRejeitar!.id, data: d }))}
            className="space-y-4">
            <div className="space-y-1.5">
              <Label>Motivo (opcional)</Label>
              <Input placeholder="Explique o motivo da rejeição..." {...formRejeitar.register('motivo')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenRejeitar(null)}>Cancelar</Button>
              <Button type="submit" disabled={rejeitarMut.isPending} variant="destructive">
                {rejeitarMut.isPending ? 'Rejeitando...' : 'Confirmar Rejeição'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Executar ─────────────────────────────────────────────── */}
      <Dialog open={!!confirmExecutar} onOpenChange={v => !v && setConfirmExecutar(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="size-4 text-indigo-600" />Executar Reparcelamento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Esta ação é <strong>irreversível</strong>. Ao confirmar:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>O empréstimo #{confirmExecutar?.loan.id} será <strong>cancelado</strong></li>
              <li>As parcelas não pagas serão canceladas</li>
              <li>Um <strong>novo empréstimo</strong> será criado com os termos aprovados</li>
              <li>O aceite digital será registrado com data/hora e IP</li>
            </ul>
            {confirmExecutar && (
              <div className="rounded-lg border p-3 space-y-1 bg-indigo-50/50 dark:bg-indigo-950/20">
                <p><span className="text-muted-foreground">Cliente: </span><strong>{confirmExecutar.client.nome}</strong></p>
                <p><span className="text-muted-foreground">Novos termos: </span>
                  {confirmExecutar.novoNumeroParcelas}x de {
                    formatCurrency(
                      (Number(confirmExecutar.novoValorPrincipal) + Number(confirmExecutar.novoTargetProfit))
                      / Number(confirmExecutar.novoNumeroParcelas)
                    )
                  }
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmExecutar(null)}>Cancelar</Button>
            <Button
              disabled={executarMut.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => executarMut.mutate(confirmExecutar!.id)}>
              {executarMut.isPending ? 'Executando...' : 'Confirmar e Executar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
