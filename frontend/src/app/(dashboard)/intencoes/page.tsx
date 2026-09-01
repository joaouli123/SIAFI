'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { PlusCircle, CheckCircle, XCircle, MessageSquare, Clock, TrendingUp, User, ChevronDown, ChevronUp, HelpCircle, AlertTriangle, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { ClienteCombobox } from '@/components/ui/cliente-combobox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate, formatDateTime, METODO_PAGAMENTO, hojeISODate } from '@/lib/utils'
import { useAuth } from '@/contexts/auth.context'
import api from '@/lib/api'
import Link from 'next/link'
import Decimal from 'decimal.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreRisco { scoreGeral: number; classificacao: string }
interface IntencaoItem {
  id: number
  status: string
  valorSolicitado: number
  numeroParcelas: number
  finalidade?: string | null
  observacoes?: string | null
  prazoExpiracaoEm?: string | null
  motivoRejeicaoTipo?: string | null
  motivoRejeicao?: string | null
  feedbackEnviadoEm?: string | null
  feedbackCanal?: string | null
  createdAt: string
  client: {
    id: number; nome: string; nomeSocial?: string | null
    cpf?: string | null; whatsapp?: string | null; email?: string | null
    portalAtivo: boolean; scoreRisco: ScoreRisco | null
  }
  consultor: { id: number; nome: string }
}

interface LoanItem {
  id: number
  status: string
  principalAmount: number
  totalReceivable: number
  numeroParcelas: number
  dataInicio: string
  createdAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_INTENCAO: Record<string, { label: string; variant: 'outline' | 'success' | 'destructive' | 'warning' }> = {
  aguardando: { label: 'Aguardando', variant: 'warning' },
  aprovado:   { label: 'Aprovada',  variant: 'success' },
  rejeitado:  { label: 'Rejeitada', variant: 'destructive' },
}

const SCORE_STYLE: Record<string, { label: string; color: string }> = {
  excelente:  { label: 'Excelente',  color: 'text-green-700 bg-green-100 dark:bg-green-950/50 dark:text-green-400' },
  bom:        { label: 'Bom',        color: 'text-blue-700 bg-blue-100 dark:bg-blue-950/50 dark:text-blue-400' },
  regular:    { label: 'Regular',    color: 'text-yellow-700 bg-yellow-100 dark:bg-yellow-950/50 dark:text-yellow-400' },
  alto_risco: { label: 'Alto Risco', color: 'text-red-700 bg-red-100 dark:bg-red-950/50 dark:text-red-400' },
}

const MOTIVO_LABELS: Record<string, string> = {
  renda_insuficiente:   'Renda insuficiente',
  score_baixo:          'Score baixo',
  documentacao:         'Documentação irregular',
  historico_negativo:   'Histórico negativo',
  capacidade_pagamento: 'Capacidade de pagamento',
  outro:                'Outro motivo',
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const schemaCreate = z.object({
  clientId:        z.coerce.number().int().positive(),
  valorSolicitado: z.coerce.number().positive(),
  numeroParcelas:  z.coerce.number().int().min(1).max(360),
  finalidade:      z.string().optional(),
  observacoes:     z.string().optional(),
})

const schemaAprovar = z.object({
  principalAmount: z.coerce.number().positive(),
  targetProfit:    z.coerce.number().min(0),
  numeroParcelas:  z.coerce.number().int().min(1).max(360),
  dataInicio:      z.string().min(1),
  metodoPagamento: z.string().optional(),
  observacoes:     z.string().optional(),
})

const schemaRejeitar = z.object({
  motivoTipo: z.string().min(1),
  motivo:     z.string().optional(),
})

type CreateForm  = z.infer<typeof schemaCreate>
type AprovarForm = z.infer<typeof schemaAprovar>
type RejeitarForm = z.infer<typeof schemaRejeitar>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: ScoreRisco | null }) {
  if (!score) return <span className="text-xs text-muted-foreground">Sem score</span>
  const s = SCORE_STYLE[score.classificacao] ?? { label: score.classificacao, color: 'text-muted-foreground bg-muted' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${s.color}`}>
      <TrendingUp className="size-3" />{s.label} · {score.scoreGeral}
    </span>
  )
}

function SlaIndicator({ prazo, status }: { prazo?: string | null; status: string }) {
  if (!prazo || status !== 'aguardando') return null
  const diff = new Date(prazo).getTime() - Date.now()
  const horas = Math.floor(diff / 3_600_000)
  if (diff <= 0) {
    return <span className="text-xs text-red-500 font-medium flex items-center gap-1"><Clock className="size-3" />SLA expirado</span>
  }
  return <span className="text-xs text-orange-500 flex items-center gap-1"><Clock className="size-3" />{horas}h restantes</span>
}

function safeDecimal(v: unknown) {
  const d = new Decimal(v?.toString() || '0')
  return d.isNaN() ? new Decimal(0) : d
}

const STATUS_LOAN_LABEL: Record<string, string> = {
  aguardando_aceite:    'Aguardando aceite',
  aguardando_liberacao: 'Aguardando liberação',
  ativo:      'Ativo',
  quitado:    'Quitado',
  cancelado:  'Cancelado',
}

function ClientDetailPanel({
  client,
  loans,
  loadingLoans,
  canViewLoans,
}: {
  client: IntencaoItem['client']
  loans?: LoanItem[]
  loadingLoans: boolean
  canViewLoans: boolean
}) {
  const info = [
    client.cpf && `CPF: ${client.cpf}`,
    client.whatsapp && `WhatsApp: ${client.whatsapp}`,
    client.email && `Email: ${client.email}`,
  ].filter(Boolean)

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base">
            {client.nome}{client.nomeSocial ? ` (${client.nomeSocial})` : ''}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
            {info.map((i, idx) => <span key={idx}>{i}</span>)}
          </div>
        </div>
        <ScoreBadge score={client.scoreRisco} />
      </div>

      {canViewLoans && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Histórico de contratos</p>
          {loadingLoans ? (
            <div className="space-y-1"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-3/4" /></div>
          ) : loans && loans.length > 0 ? (
            <div className="space-y-1">
              {loans.map(loan => (
                <div key={loan.id} className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
                  <span className="font-medium">#{loan.id}</span>
                  <span>{STATUS_LOAN_LABEL[loan.status] ?? loan.status}</span>
                  <span>{loan.numeroParcelas}x de {formatCurrency(Number(loan.totalReceivable) / loan.numeroParcelas)}</span>
                  <span className="text-muted-foreground">{formatDate(loan.dataInicio)}</span>
                  <a href={`/emprestimos/${loan.id}`} className="text-blue-600 hover:underline">ver</a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum contrato anterior.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntencoesPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isConsultor = user?.role === 'consultor'
  const canApprove  = user?.role === 'admin' || user?.role === 'financeiro'

  const [statusFiltro, setStatusFiltro]   = useState('')
  const [openCreate,   setOpenCreate]     = useState(false)
  const [openAprovar,  setOpenAprovar]    = useState<IntencaoItem | null>(null)
  const [openRejeitar, setOpenRejeitar]   = useState<IntencaoItem | null>(null)
  const [openFeedback, setOpenFeedback]   = useState<IntencaoItem | null>(null)
  const [feedbackCanal, setFeedbackCanal] = useState('whatsapp')
  const [openSolicitarInfo, setOpenSolicitarInfo] = useState<IntencaoItem | null>(null)
  const [infoMensagem, setInfoMensagem]   = useState('')
  const [clienteDetalhe, setClienteDetalhe] = useState<number | null>(null)
  const [aprovarError, setAprovarError]   = useState<string | null>(null)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: intencoes = [], isLoading } = useQuery({
    queryKey: ['intencoes', statusFiltro],
    queryFn: () => api.get<IntencaoItem[]>('/intencoes', {
      params: statusFiltro ? { status: statusFiltro } : {},
    }).then(r => r.data),
  })

  const canViewLoans = user?.role === 'admin' || user?.role === 'financeiro'
  const { data: clientLoans = [], isLoading: loadingClientLoans } = useQuery({
    queryKey: ['client-loans', clienteDetalhe],
    queryFn: () =>
      api.get<{ data: LoanItem[] }>('/loans', { params: { clientId: clienteDetalhe, limit: 20 } })
        .then(r => r.data.data),
    enabled: clienteDetalhe !== null && canViewLoans,
    retry: 1,
  })

  // ── Mutations ────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (data: CreateForm) => api.post('/intencoes', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intencoes'] })
      setOpenCreate(false)
      formCreate.reset()
    },
  })

  const aprovarMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: AprovarForm }) => {
      const payload = {
        ...data,
        // Empty string from <select> would fail @IsEnum — send only valid values
        metodoPagamento: data.metodoPagamento || undefined,
        observacoes:     data.observacoes     || undefined,
      }
      return api.patch(`/intencoes/${id}/aprovar`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intencoes'] })
      setAprovarError(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Erro ao aprovar intenção'
      setAprovarError(Array.isArray(msg) ? msg.join('; ') : String(msg))
      // Revert optimistic update
      qc.invalidateQueries({ queryKey: ['intencoes'] })
    },
  })

  const rejeitarMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: RejeitarForm }) =>
      api.patch(`/intencoes/${id}/rejeitar`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['intencoes'] }); setOpenRejeitar(null) },
  })

  const feedbackMut = useMutation({
    mutationFn: ({ id, canal }: { id: number; canal: string }) =>
      api.patch(`/intencoes/${id}/feedback`, { canal }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['intencoes'] }); setOpenFeedback(null) },
  })

  const solicitarInfoMut = useMutation({
    mutationFn: ({ id, mensagem }: { id: number; mensagem: string }) =>
      api.patch(`/intencoes/${id}/solicitar-info`, { mensagem }),
    onSuccess: () => {
      setOpenSolicitarInfo(null)
      setInfoMensagem('')
    },
  })

  // ── Forms ────────────────────────────────────────────────────────────────

  const formCreate   = useForm<CreateForm>  ({ resolver: zodResolver(schemaCreate)   as any })
  const formAprovar  = useForm<AprovarForm> ({ resolver: zodResolver(schemaAprovar)  as any })
  const formRejeitar = useForm<RejeitarForm>({ resolver: zodResolver(schemaRejeitar) as any })

  const wA = formAprovar.watch()
  const parcelaSimul = (() => {
    const p = safeDecimal(wA.principalAmount)
    const l = safeDecimal(wA.targetProfit)
    const n = safeDecimal(wA.numeroParcelas)
    if (n.isZero()) return '—'
    return formatCurrency(p.plus(l).dividedBy(n).toDecimalPlaces(2).toNumber())
  })()

  function abrirAprovar(item: IntencaoItem) {
    setOpenAprovar(item)
    setAprovarError(null)
    formAprovar.reset({
      principalAmount: Number(item.valorSolicitado),
      targetProfit:    0,
      numeroParcelas:  item.numeroParcelas,
      dataInicio:      hojeISODate(),
    })
  }

  function handleAprovarSubmit(data: AprovarForm) {
    const item = openAprovar!
    setOpenAprovar(null)
    // Optimistic: mark as aprovado immediately in cache
    qc.setQueryData(['intencoes', statusFiltro], (old: IntencaoItem[] | undefined) =>
      old ? old.map(i => i.id === item.id ? { ...i, status: 'aprovado' } : i) : old
    )
    aprovarMut.mutate({ id: item.id, data })
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────

  const aguardandoCount = intencoes.filter(i => i.status === 'aguardando').length
  const tabs = [
    { label: 'Todas',      value: '' },
    { label: 'Aguardando', value: 'aguardando', badge: aguardandoCount },
    { label: 'Aprovadas',  value: 'aprovado' },
    { label: 'Rejeitadas', value: 'rejeitado' },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intenções de Empréstimo</h1>
          <p className="text-muted-foreground text-sm">
            {isConsultor
              ? 'Suas solicitações de análise financeira'
              : 'Solicitações de consultores aguardando análise'}
          </p>
        </div>
        {isConsultor && (
          <Button onClick={() => setOpenCreate(true)} className="gap-2">
            <PlusCircle className="size-4" />Nova Intenção
          </Button>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-0 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFiltro(tab.value)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              statusFiltro === tab.value
                ? 'text-primary border-b-2 border-primary -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {(tab.badge ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-orange-500 text-white text-[10px] leading-none px-1.5 py-0.5">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error banner for failed approvals */}
      {aprovarError && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center justify-between">
          <span><strong>Erro ao aprovar:</strong> {aprovarError}</span>
          <button onClick={() => setAprovarError(null)} className="ml-4 text-red-400 hover:text-red-600 font-bold">×</button>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : intencoes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">Nenhuma intenção encontrada.</div>
      ) : (
        <div className="space-y-3">
          {intencoes.map(item => {
            const st = STATUS_INTENCAO[item.status] ?? { label: item.status, variant: 'outline' as const }
            return (
              <Card key={item.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{item.client.nome}</span>
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {item.client.portalAtivo && (
                          <span className="text-[10px] text-green-700 bg-green-100 dark:bg-green-950/50 dark:text-green-400 px-1.5 py-0.5 rounded-full font-semibold">
                            Portal ativo
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        <ScoreBadge score={item.client.scoreRisco} />
                        {!isConsultor && <span>Consultor: {item.consultor.nome}</span>}
                        <span>{item.numeroParcelas}x · {formatCurrency(Number(item.valorSolicitado))}</span>
                        {item.finalidade && (
                          <span className="truncate max-w-[220px] italic">{item.finalidade}</span>
                        )}
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                      <SlaIndicator prazo={item.prazoExpiracaoEm} status={item.status} />
                      {item.status === 'rejeitado' && item.motivoRejeicaoTipo && (
                        <p className="text-xs text-red-600 mt-0.5">
                          Motivo: {MOTIVO_LABELS[item.motivoRejeicaoTipo] ?? item.motivoRejeicaoTipo}
                          {item.motivoRejeicao && ` — ${item.motivoRejeicao}`}
                        </p>
                      )}
                      {item.feedbackEnviadoEm && (
                        <p className="text-xs text-green-600 mt-0.5">
                          Feedback via {item.feedbackCanal} · {formatDateTime(item.feedbackEnviadoEm)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground"
                        onClick={() => setClienteDetalhe(clienteDetalhe === item.client.id ? null : item.client.id)}>
                        <User className="size-3.5" />Ver cliente
                        {clienteDetalhe === item.client.id
                          ? <ChevronUp className="size-3" />
                          : <ChevronDown className="size-3" />}
                      </Button>
                      {canApprove && item.status === 'aguardando' && (
                        <>
                          <Button size="sm" variant="outline"
                            className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                            onClick={() => { setOpenSolicitarInfo(item); setInfoMensagem('') }}>
                            <HelpCircle className="size-3.5" />Pedir info
                          </Button>
                          <Button size="sm" variant="outline"
                            className="gap-1 text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950/30"
                            onClick={() => abrirAprovar(item)}>
                            <CheckCircle className="size-3.5" />Aprovar
                          </Button>
                          <Button size="sm" variant="outline"
                            className="gap-1 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => { setOpenRejeitar(item); formRejeitar.reset() }}>
                            <XCircle className="size-3.5" />Rejeitar
                          </Button>
                        </>
                      )}
                      {isConsultor && (item.status === 'aprovado' || item.status === 'rejeitado') && !item.feedbackEnviadoEm && (
                        <Button size="sm" variant="outline" className="gap-1"
                          onClick={() => { setOpenFeedback(item); setFeedbackCanal('whatsapp') }}>
                          <MessageSquare className="size-3.5" />Feedback
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* ── Painel inline de dados do cliente ── */}
                  {clienteDetalhe === item.client.id && (
                    <div className="mt-3 border-t pt-3">
                      <ClientDetailPanel
                        client={item.client}
                        loans={clientLoans}
                        loadingLoans={loadingClientLoans}
                        canViewLoans={canViewLoans}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Modal: Nova Intenção ────────────────────────────────────────── */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova Intenção de Empréstimo</DialogTitle></DialogHeader>
          <form onSubmit={formCreate.handleSubmit(d => createMut.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <ClienteCombobox
                buscaRemota
                value={formCreate.watch('clientId') || null}
                placeholder="Buscar cliente por nome ou CPF..."
                onSelect={c => formCreate.setValue('clientId', c?.id ?? 0, { shouldValidate: true })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor Solicitado (R$)</Label>
                <Input type="number" step="0.01" min="0.01" placeholder="0,00" {...formCreate.register('valorSolicitado')} />
              </div>
              <div className="space-y-1.5">
                <Label>Nº de Parcelas</Label>
                <Input type="number" min="1" max="360" placeholder="12" {...formCreate.register('numeroParcelas')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Finalidade (opcional)</Label>
              <Input placeholder="Ex: capital de giro, reforma..." {...formCreate.register('finalidade')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? 'Enviando...' : 'Enviar para Análise'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Aprovar ──────────────────────────────────────────────── */}
      <Dialog open={!!openAprovar} onOpenChange={v => !v && setOpenAprovar(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Aprovar Intenção #{openAprovar?.id} — {openAprovar?.client.nome}</DialogTitle>
          </DialogHeader>

          {/* Aviso sobre status do portal do cliente */}
          {openAprovar && (
            <div className="space-y-2 -mt-1">
              {!openAprovar.client.email && (
                <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-700 px-3 py-2.5 text-sm text-yellow-800 dark:text-yellow-300 flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Cliente sem email cadastrado.</strong> O link de aceite não será enviado por email.{' '}
                    <a href={`/clientes/${openAprovar.client.id}/editar`} className="underline font-medium">Cadastre o email</a> antes de aprovar ou notifique o cliente manualmente.
                  </span>
                </div>
              )}
              {openAprovar.client.email && !openAprovar.client.portalAtivo && (
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-700 px-3 py-2.5 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <Info className="size-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Portal não ativo.</strong> O portal será ativado automaticamente e um email de ativação com link para assinar o contrato será enviado para <strong>{openAprovar.client.email}</strong>.
                  </span>
                </div>
              )}
              {openAprovar.client.email && openAprovar.client.portalAtivo && (
                <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-700 px-3 py-2.5 text-sm text-green-800 dark:text-green-300 flex items-start gap-2">
                  <CheckCircle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Portal ativo.</strong> O cliente receberá um email com link direto para assinar o contrato em <strong>{openAprovar.client.email}</strong>.
                  </span>
                </div>
              )}
            </div>
          )}

          <form onSubmit={formAprovar.handleSubmit(handleAprovarSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Capital Emprestado (R$)</Label>
                <Input type="number" step="0.01" min="0.01" {...formAprovar.register('principalAmount')} />
              </div>
              <div className="space-y-1.5">
                <Label>Lucro Alvo (R$)</Label>
                <Input type="number" step="0.01" min="0" {...formAprovar.register('targetProfit')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nº de Parcelas</Label>
                <Input type="number" min="1" max="360" {...formAprovar.register('numeroParcelas')} />
              </div>
              <div className="space-y-1.5">
                <Label>Data da 1ª Parcela</Label>
                <Input type="date" {...formAprovar.register('dataInicio')} />
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">Valor por parcela</span>
              <span className="font-bold text-blue-700 dark:text-blue-400 text-base">{parcelaSimul}</span>
            </div>
            <div className="space-y-1.5">
              <Label>Método de Pagamento (opcional)</Label>
              <Select {...formAprovar.register('metodoPagamento')}>
                <option value="">Padrão</option>
                {Object.entries(METODO_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenAprovar(null)}>Cancelar</Button>
              <Button type="submit" className="bg-green-600 hover:bg-green-700">
                Confirmar Aprovação
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Rejeitar ─────────────────────────────────────────────── */}
      <Dialog open={!!openRejeitar} onOpenChange={v => !v && setOpenRejeitar(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rejeitar Intenção #{openRejeitar?.id}</DialogTitle></DialogHeader>
          <form onSubmit={formRejeitar.handleSubmit(d => rejeitarMut.mutate({ id: openRejeitar!.id, data: d }))}
            className="space-y-4">
            <div className="space-y-1.5">
              <Label>Motivo da Rejeição</Label>
              <Select {...formRejeitar.register('motivoTipo')}>
                <option value="">Selecione...</option>
                {Object.entries(MOTIVO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Detalhes (opcional)</Label>
              <Input placeholder="Informações adicionais..." {...formRejeitar.register('motivo')} />
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

      {/* ── Modal: Solicitar informações ────────────────────────────────── */}
      <Dialog open={!!openSolicitarInfo} onOpenChange={v => !v && setOpenSolicitarInfo(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="size-4 text-blue-500" />
              Solicitar informações
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Envie uma mensagem ao consultor <strong>{openSolicitarInfo?.consultor.nome}</strong> pedindo mais informações sobre a intenção de{' '}
              <strong>{openSolicitarInfo?.client.nome}</strong>.
            </p>
            <div className="space-y-1.5">
              <Label>Mensagem</Label>
              <Textarea
                rows={3}
                placeholder="Ex: Precisamos do comprovante de renda do cliente..."
                value={infoMensagem}
                onChange={e => setInfoMensagem(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A mensagem será enviada via chat interno. Você pode acompanhar a resposta em{' '}
              <Link href="/mensagens" className="text-blue-600 hover:underline">Mensagens</Link>.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSolicitarInfo(null)}>Cancelar</Button>
            <Button
              disabled={solicitarInfoMut.isPending || infoMensagem.trim().length < 5}
              onClick={() => openSolicitarInfo && solicitarInfoMut.mutate({ id: openSolicitarInfo.id, mensagem: infoMensagem.trim() })}
            >
              {solicitarInfoMut.isPending ? 'Enviando...' : 'Enviar mensagem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Feedback ─────────────────────────────────────────────── */}
      <Dialog open={!!openFeedback} onOpenChange={v => !v && setOpenFeedback(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Registrar Feedback ao Cliente</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Como o resultado foi comunicado a <strong>{openFeedback?.client.nome}</strong>?
            </p>
            <div className="space-y-1.5">
              <Label>Canal de Comunicação</Label>
              <Select value={feedbackCanal} onChange={e => setFeedbackCanal(e.target.value)}>
                <option value="whatsapp">WhatsApp</option>
                <option value="telefone">Telefone</option>
                <option value="email">E-mail</option>
                <option value="presencial">Presencial</option>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenFeedback(null)}>Cancelar</Button>
            <Button disabled={feedbackMut.isPending}
              onClick={() => feedbackMut.mutate({ id: openFeedback!.id, canal: feedbackCanal })}>
              {feedbackMut.isPending ? 'Salvando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
