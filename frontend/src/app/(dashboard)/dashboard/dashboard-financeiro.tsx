'use client'

import { useState } from 'react'
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, TrendingUp, AlertTriangle, CheckCircle, RefreshCw, ChevronRight,
  Banknote, Clock, AlertCircle, BarChart2, Wallet, DollarSign, Plus, UserPlus,
  Percent, PieChart as PieIcon, TicketPercent,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDate, formatCurrency, formatDateTime, hojeISODate } from '@/lib/utils'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useRealtimeDashboard } from '@/hooks/useRealtimeDashboard'
import { useAuth } from '@/contexts/auth.context'

interface ClientStats   { total: number; ativos: number; inativos: number; quitados: number; atrasados: number }
interface LoanStats     { totalAtivos: number; totalQuitados: number; valorEmCarteira: number; valorRecebidoMes: number; descontosMes?: number }
interface CarteiraStats { faturamentoAReceber: number; principalARecuperar: number }
interface EvolucaoMes   {
  mes: string; label: string
  totalRecebido: number; faturamentoBruto: number; recuperacaoCapital: number
  quantidadeParcelas: number; novosContratos: number
}

interface OverdueInstallment {
  id: number; numero: number; dataVencimento: string; installmentAmount: number; totalPago: number
  loan: { id: number; client: { id: number; nome: string } }
}

interface QuitadoClient { id: number; nome: string; cpf: string | null }

interface PendenteLiberacao {
  id: number; principalAmount: number; aceiteClienteEm: string | null
  client: { id: number; nome: string; nomeSocial: string | null }
}

interface Intencao {
  id: number; valorSolicitado: number; numeroParcelas: number; status: string
  prazoExpiracaoEm: string | null; createdAt: string
  client: { nome: string; cpf: string | null }
  consultor: { nome: string }
}

function slaInfo(prazoExpiracaoEm: string | null) {
  if (!prazoExpiracaoEm) return { label: '—', urgent: false, expired: false }
  const diff = new Date(prazoExpiracaoEm).getTime() - Date.now()
  const horas = Math.floor(diff / 3_600_000)
  if (diff < 0) return { label: 'SLA expirado', urgent: true, expired: true }
  if (horas < 2) return { label: `${horas}h restantes`, urgent: true, expired: false }
  if (horas < 24) return { label: `${horas}h restantes`, urgent: false, expired: false }
  const dias = Math.floor(horas / 24)
  return { label: `${dias}d restantes`, urgent: false, expired: false }
}

const colorMap = {
  blue:   { bg: 'bg-card text-card-foreground', icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', value: 'text-foreground' },
  green:  { bg: 'bg-card text-card-foreground', icon: 'bg-green-500/10 text-green-600 dark:text-green-400', value: 'text-foreground' },
  purple: { bg: 'bg-card text-card-foreground', icon: 'bg-purple-500/10 text-purple-600 dark:text-purple-400', value: 'text-foreground' },
  red:    { bg: 'bg-card text-card-foreground', icon: 'bg-red-500/10 text-red-600 dark:text-red-400', value: 'text-foreground' },
  amber:  { bg: 'bg-card text-card-foreground', icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', value: 'text-foreground' },
}

type Color = keyof typeof colorMap

interface StatCardProps {
  title: string; value: string | number; icon: React.ElementType; color: Color
  isLoading: boolean; href?: string; subItems?: { label: string; value: string; color?: string }[]
}

function StatCard({ title, value, icon: Icon, color, isLoading, href, subItems }: StatCardProps) {
  const c = colorMap[color]
  const content = (
    <Card className={cn('h-full flex flex-col border border-border/60 shadow-sm card-hover transition-all p-5', c.bg, href && 'cursor-pointer hover:border-border')}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {href && <ChevronRight className="size-4 text-muted-foreground/50 shrink-0" />}
      </div>
      
      <div className="mt-3 flex items-center gap-3">
        <div className={cn('rounded-full p-2 shrink-0', c.icon)}><Icon className="size-5" /></div>
        {isLoading ? <Skeleton className="h-8 w-24" /> : <p className={cn('text-3xl font-bold tracking-tight', c.value)}>{value}</p>}
      </div>
      
      {subItems && !isLoading && (
        <div className="mt-auto pt-4 flex flex-col gap-1.5">
          <div className="h-px w-full bg-border/40 mb-1" />
          {subItems.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s.label}:</span>
              <span className={cn('font-medium', s.color ?? 'text-foreground')}>{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function Donut({ data }: { data: { name: string; value: number; cor: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <ResponsiveContainer width={170} height={170}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} strokeWidth={0}>
            {data.map((d, i) => <Cell key={i} fill={d.cor} />)}
          </Pie>
          <Tooltip formatter={(v: any) => formatCurrency(Number(v ?? 0))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(214.3 31.8% 91.4%)' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5 w-full">
        {data.map(d => (
          <div key={d.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2.5 rounded-full shrink-0" style={{ background: d.cor }} />{d.name}
            </span>
            <span className="font-medium">{formatCurrency(d.value)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between text-sm border-t pt-1.5 mt-1.5">
          <span className="text-muted-foreground">Total</span>
          <span className="font-bold">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  )
}

export default function DashboardFinanceiro() {
  const { connected } = useRealtimeDashboard()
  const { user } = useAuth()
  const qc = useQueryClient()

  const [liberarModal, setLiberarModal] = useState<PendenteLiberacao | null>(null)
  const [metodoLiberacao, setMetodoLiberacao] = useState('dinheiro')
  const [dataLiberacao, setDataLiberacao] = useState(hojeISODate())
  const [obsLiberacao, setObsLiberacao] = useState('')

  const pendentesQuery = useQuery({
    queryKey: ['loans', 'pendentes-liberacao'],
    queryFn: () => api.get<PendenteLiberacao[]>('/loans/pendentes-liberacao').then(r => r.data),
    refetchInterval: 60_000,
  })

  const intencoesQuery = useQuery({
    queryKey: ['intencoes', 'aguardando'],
    queryFn: () => api.get<Intencao[]>('/intencoes', { params: { status: 'aguardando' } }).then(r => r.data),
    refetchInterval: 120_000,
  })

  const liberarMut = useMutation({
    mutationFn: (id: number) => api.patch(`/loans/${id}/liberar-capital`, { metodoLiberacao, dataLiberacao, observacao: obsLiberacao || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['loans', 'pendentes-liberacao'] })
      void qc.invalidateQueries({ queryKey: ['loans', 'stats'] })
      setLiberarModal(null)
    },
  })

  const evolucaoQuery = useQuery<EvolucaoMes[]>({
    queryKey: ['reports', 'evolucao'],
    queryFn:  () => api.get<EvolucaoMes[]>('/reports/evolucao', { params: { meses: 6 } }).then(r => r.data),
    staleTime: 5 * 60_000,
  })

  const results = useQueries({
    queries: [
      { queryKey: ['clients', 'stats'],       queryFn: () => api.get<ClientStats>('/clients/stats').then(r => r.data) },
      { queryKey: ['loans', 'stats'],         queryFn: () => api.get<LoanStats>('/loans/stats').then(r => r.data) },
      { queryKey: ['installments', 'overdue'],queryFn: () => api.get<OverdueInstallment[]>('/installments/overdue').then(r => r.data) },
      { queryKey: ['clients', 'quitados'],    queryFn: () => api.get<QuitadoClient[]>('/clients/quitados').then(r => r.data) },
      { queryKey: ['reports', 'carteira'],    queryFn: () => api.get<CarteiraStats>('/reports/carteira').then(r => r.data) },
    ],
  })

  const [clientsQ, loansQ, overdueQ, quitadosQ, carteiraQ] = results
  const isAnyLoading = results.some(r => r.isLoading)

  function refetchAll() { results.forEach(r => r.refetch()); intencoesQuery.refetch(); pendentesQuery.refetch() }

  const overdueClients = overdueQ.data
    ? Array.from(new Map(overdueQ.data.map(i => [i.loan.client.id, i.loan.client])).values())
    : []

  const intencoesOrdenadas = [...(intencoesQuery.data ?? [])].sort((a, b) => {
    const ta = a.prazoExpiracaoEm ? new Date(a.prazoExpiracaoEm).getTime() : Infinity
    const tb = b.prazoExpiracaoEm ? new Date(b.prazoExpiracaoEm).getTime() : Infinity
    return ta - tb
  })

  const lastUpdated = results.map(r => r.dataUpdatedAt).filter(Boolean).reduce((m, t) => Math.max(m, t), 0)

  // ── Resumo financeiro ──────────────────────────────────────────────────────
  const lucroMes = evolucaoQuery.data?.length
    ? Number(evolucaoQuery.data[evolucaoQuery.data.length - 1].faturamentoBruto)
    : 0
  const overdueSaldo = (overdueQ.data ?? []).reduce(
    (s, i) => s + Math.max(0, Number(i.installmentAmount) - Number(i.totalPago)), 0,
  )
  const aReceber = Number((carteiraQ.data as CarteiraStats & { aReceber?: number })?.aReceber ?? 0)
  const taxaInad = aReceber > 0 ? (overdueSaldo / aReceber) * 100 : 0

  // ── Aging da inadimplência (rosca) ─────────────────────────────────────────
  const agingDef = [
    { faixa: '1-30 dias', max: 30, cor: '#f59e0b' },
    { faixa: '31-60 dias', max: 60, cor: '#f97316' },
    { faixa: '61-90 dias', max: 90, cor: '#ef4444' },
    { faixa: '90+ dias', max: Infinity, cor: '#b91c1c' },
  ]
  const hojeMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()
  const agingData = (() => {
    const acc = agingDef.map(a => ({ name: a.faixa, value: 0, cor: a.cor }))
    for (const i of overdueQ.data ?? []) {
      const saldo = Math.max(0, Number(i.installmentAmount) - Number(i.totalPago))
      if (saldo <= 0) continue
      const venc = new Date(i.dataVencimento); venc.setHours(0, 0, 0, 0)
      const dias = Math.floor((hojeMs - venc.getTime()) / 86400000)
      let idx = agingDef.findIndex(a => dias <= a.max)
      if (idx === -1) idx = agingDef.length - 1
      acc[idx].value += saldo
    }
    return acc.filter(a => a.value > 0)
  })()

  // ── Composição da carteira (capital × lucro a receber) ─────────────────────
  const cart = carteiraQ.data as (CarteiraStats & { principalARecuperar?: number; faturamentoAReceber?: number }) | undefined
  const composicaoData = cart ? [
    { name: 'Capital a recuperar', value: Number(cart.principalARecuperar ?? 0), cor: '#2563eb' },
    { name: 'Lucro a receber', value: Number(cart.faturamentoAReceber ?? 0), cor: '#ea580c' },
  ].filter(d => d.value > 0) : []

  return (
    <div className="space-y-6">
      {/* Header — saudação + atalhos rápidos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'},
              {' '}{(user?.nome ?? '').split(' ')[0] || 'time'} 👋
            </h2>
            <span title={connected ? 'Realtime conectado' : 'Conectando...'} className="relative flex size-2.5 shrink-0 ml-1">
              {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
              <span className={cn('relative inline-flex rounded-full size-2.5', connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]')} />
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
            <span>{user?.role === 'admin' ? 'Painel administrativo' : 'Painel financeiro'}</span>
            <span>·</span>
            <span>atualizado em tempo real</span>
            {lastUpdated > 0 && <span className="hidden sm:inline"> · {formatDate(new Date(lastUpdated))}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Link href="/emprestimos/novo"><Button size="sm" className="gap-2 shadow-sm bg-primary/90 hover:bg-primary"><Plus className="size-4" />Novo empréstimo</Button></Link>
          <Link href="/pagamentos/novo"><Button size="sm" variant="outline" className="gap-2 shadow-sm border-border/60 hover:bg-muted/50"><DollarSign className="size-4 text-green-600 dark:text-green-500" />Pagamento</Button></Link>
          <Link href="/clientes/novo"><Button size="sm" variant="outline" className="gap-2 shadow-sm border-border/60 hover:bg-muted/50"><UserPlus className="size-4 text-blue-600 dark:text-blue-500" />Cliente</Button></Link>
          <Button variant="ghost" size="icon" onClick={refetchAll} disabled={isAnyLoading} title="Atualizar" className="size-8 ml-1 hover:bg-muted/50">
            <RefreshCw className={cn('size-4 text-muted-foreground', isAnyLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Faixa de resumo financeiro */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { icon: Wallet,        label: 'Valor em carteira',     value: formatCurrency(loansQ.data?.valorEmCarteira ?? 0), color: 'text-blue-700 dark:text-blue-400',   iconBg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',     loading: loansQ.isLoading,    hint: 'Saldo a receber em aberto' },
          { icon: DollarSign,    label: 'Recebido no mês',       value: formatCurrency(loansQ.data?.valorRecebidoMes ?? 0), color: 'text-green-700 dark:text-green-400', iconBg: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400', loading: loansQ.isLoading,    hint: 'Entradas de parcelas' },
          { icon: TrendingUp,    label: 'Lucro do mês',          value: formatCurrency(lucroMes),                          color: 'text-orange-600 dark:text-orange-400', iconBg: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400', loading: evolucaoQuery.isLoading, hint: 'Faturamento realizado' },
          { icon: Percent,       label: 'Inadimplência',          value: `${taxaInad.toFixed(1)}%`,                          color: taxaInad >= 15 ? 'text-red-700 dark:text-red-400' : taxaInad >= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-green-700 dark:text-green-400', iconBg: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400', loading: overdueQ.isLoading || carteiraQ.isLoading, hint: 'Saldo atrasado ÷ a receber' },
          { icon: TicketPercent, label: 'Descontos no mês',      value: formatCurrency(loansQ.data?.descontosMes ?? 0),     color: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400', loading: loansQ.isLoading, hint: 'Concedidos nas baixas' },
        ].map((t) => (
          <Card key={t.label} className="border border-border/60 shadow-sm flex items-center gap-3 p-4 h-full bg-card hover:border-border transition-all">
            <div className={cn('rounded-full p-2.5 shrink-0', t.iconBg)}><t.icon className="size-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground truncate">{t.label}</p>
              {t.loading ? <Skeleton className="h-6 w-24 mt-1" /> : <p className={cn('text-lg font-bold leading-tight mt-0.5', t.color)}>{t.value}</p>}
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{t.hint}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Clientes Ativos"     value={clientsQ.data?.ativos ?? '—'}       icon={Users}         color="blue"   isLoading={clientsQ.isLoading}  href="/clientes" />
        <StatCard title="Empréstimos Ativos"  value={loansQ.data?.totalAtivos ?? '—'}     icon={TrendingUp}    color="green"  isLoading={loansQ.isLoading}    href="/emprestimos"
          subItems={carteiraQ.data ? [
            { label: 'A faturar',       value: formatCurrency(carteiraQ.data.faturamentoAReceber) },
            { label: 'Capital em risco', value: formatCurrency(carteiraQ.data.principalARecuperar) },
          ] : undefined}
        />
        <StatCard title="Clientes Atrasados"  value={clientsQ.data?.atrasados ?? overdueClients.length} icon={AlertTriangle} color="red"    isLoading={clientsQ.isLoading}  href="/inadimplentes" />
        <StatCard title="Clientes Quitados"   value={clientsQ.data?.quitados ?? '—'}     icon={CheckCircle}   color="purple" isLoading={clientsQ.isLoading} href="/clientes/quitados" />
      </div>

      {/* Gráficos: composição da carteira + inadimplência por faixa */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 tracking-tight"><PieIcon className="size-4 text-primary" />Composição da carteira</CardTitle>
          </CardHeader>
          <CardContent>
            {carteiraQ.isLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : composicaoData.length ? (
              <Donut data={composicaoData} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">Sem carteira ativa.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 tracking-tight"><AlertTriangle className="size-4 text-red-500" />Inadimplência por faixa</CardTitle>
          </CardHeader>
          <CardContent>
            {overdueQ.isLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : agingData.length ? (
              <Donut data={agingData} />
            ) : (
              <div className="text-center py-10">
                <CheckCircle className="size-8 mx-auto text-green-500 mb-2" />
                <p className="text-sm text-green-600 font-medium">Sem parcelas em atraso!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fila de intenções aguardando análise */}
      {((intencoesQuery.data?.length ?? 0) > 0 || intencoesQuery.isLoading) && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <Clock className="size-4" />
              Intenções aguardando análise
              {(intencoesQuery.data?.length ?? 0) > 0 && (
                <Badge className="bg-blue-600 text-white text-xs">{intencoesQuery.data?.length}</Badge>
              )}
            </CardTitle>
            <Link href="/intencoes">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-700 dark:text-blue-300">
                Ver todas <ChevronRight className="size-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {intencoesQuery.isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="space-y-2">
                {intencoesOrdenadas.slice(0, 5).map(int => {
                  const sla = slaInfo(int.prazoExpiracaoEm)
                  return (
                    <Link key={int.id} href="/intencoes">
                      <div className={cn(
                        'flex items-center justify-between rounded-lg px-4 py-3 border transition-colors',
                        sla.expired
                          ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'
                          : sla.urgent
                            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
                            : 'bg-white dark:bg-slate-900 border-blue-100 dark:border-blue-900 hover:bg-blue-50/50 dark:hover:bg-blue-950/30',
                      )}>
                        <div>
                          <p className="text-sm font-medium">{int.client.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            #{int.id} · {formatCurrency(Number(int.valorSolicitado))} · {int.numeroParcelas}x
                            {int.consultor?.nome && <span className="ml-1">· {int.consultor.nome}</span>}
                          </p>
                        </div>
                        <Badge
                          variant={sla.expired ? 'destructive' : sla.urgent ? 'default' : 'secondary'}
                          className={cn('ml-4 shrink-0 text-xs', sla.urgent && !sla.expired && 'bg-amber-500 text-white')}
                        >
                          {sla.expired ? <AlertCircle className="size-3 mr-1" /> : <Clock className="size-3 mr-1" />}
                          {sla.label}
                        </Badge>
                      </div>
                    </Link>
                  )
                })}
                {(intencoesOrdenadas.length > 5) && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{intencoesOrdenadas.length - 5} intenções
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-amber-700 dark:text-amber-300">
                Ver todas <ChevronRight className="size-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {pendentesQuery.isLoading ? (
              <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="space-y-2">
                {pendentesQuery.data?.map(loan => (
                  <div key={loan.id} className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-lg px-4 py-3 border border-amber-100 dark:border-amber-900">
                    <div>
                      <p className="text-sm font-medium">{loan.client.nomeSocial ?? loan.client.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Contrato #{loan.id} · {formatCurrency(loan.principalAmount)}
                        {loan.aceiteClienteEm && <span className="ml-2">· Aceito em {formatDateTime(loan.aceiteClienteEm)}</span>}
                      </p>
                    </div>
                    <Button size="sm" className="ml-4 shrink-0" onClick={() => { setLiberarModal(loan); setMetodoLiberacao('dinheiro'); setDataLiberacao(hojeISODate()); setObsLiberacao('') }}>
                      Confirmar →
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Clientes Atrasados + Quitados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border border-border/40 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2 tracking-tight">
              <AlertTriangle className="size-4 text-red-500" />
              Clientes Atrasados
            </CardTitle>
            <Link href="/inadimplentes">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">Ver todos <ChevronRight className="size-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            {overdueQ.isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : overdueClients.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle className="size-8 mx-auto text-green-500 mb-2" />
                <p className="text-sm text-green-600 font-medium">Nenhum cliente em atraso!</p>
              </div>
            ) : (
              <div className="space-y-1">
                {overdueClients.slice(0, 8).map(client => {
                  const count = overdueQ.data?.filter(i => i.loan.client.id === client.id).length ?? 0
                  return (
                    <Link key={client.id} href={`/clientes/${client.id}`}>
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <span className="text-sm font-medium">{client.nome}</span>
                        <Badge variant="destructive" className="text-xs">{count} parcela{count !== 1 ? 's' : ''}</Badge>
                      </div>
                    </Link>
                  )
                })}
                {overdueClients.length > 8 && <p className="text-xs text-muted-foreground text-center pt-1">+{overdueClients.length - 8} clientes</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 tracking-tight">
              <CheckCircle className="size-4 text-green-500" />
              Clientes Quitados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {quitadosQ.isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : !quitadosQ.data?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum cliente quitado.</p>
            ) : (
              <div className="space-y-1">
                {quitadosQ.data.slice(0, 8).map(client => (
                  <Link key={client.id} href={`/clientes/${client.id}`}>
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <span className="text-sm font-medium">{client.nome}</span>
                      <Badge variant="success" className="text-xs">Quitado</Badge>
                    </div>
                  </Link>
                ))}
                {quitadosQ.data.length > 8 && <p className="text-xs text-muted-foreground text-center pt-1">+{quitadosQ.data.length - 8} clientes</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Evolução mensal */}
      <Card className="border border-border/40 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2 tracking-tight">
            <BarChart2 className="size-4 text-primary" />
            Evolução dos últimos 6 meses
          </CardTitle>
          <Link href="/relatorios">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
              Relatórios <ChevronRight className="size-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {evolucaoQuery.isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : evolucaoQuery.data && evolucaoQuery.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={evolucaoQuery.data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215.4 16.3% 46.9% / 0.2)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'hsl(215.4 16.3% 46.9%)' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(215.4 16.3% 46.9%)' }}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                  axisLine={false} tickLine={false} width={40}
                />
                <Tooltip
                  formatter={(value: any, name: any) => [formatCurrency(Number(value ?? 0)), String(name ?? '')]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(214.3 31.8% 91.4%)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar
                  dataKey="totalRecebido"
                  name="Total Recebido"
                  fill="#16a34a"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="faturamentoBruto"
                  name="Lucro (Faturamento)"
                  fill="#ea580c"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">
              Sem dados de evolução disponíveis.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Modal liberação */}
      <Dialog open={!!liberarModal} onOpenChange={o => { if (!o) setLiberarModal(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirmar liberação de capital</DialogTitle></DialogHeader>
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
                <Input placeholder="ex: entregue pessoalmente na agência" value={obsLiberacao} onChange={e => setObsLiberacao(e.target.value)} className="h-9" />
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-3 py-2">
                ⚠ Esta ação iniciará a contagem das parcelas a partir da data de liberação informada.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiberarModal(null)}>Cancelar</Button>
            <Button onClick={() => liberarModal && liberarMut.mutate(liberarModal.id)} disabled={liberarMut.isPending || !metodoLiberacao || !dataLiberacao}>
              {liberarMut.isPending ? 'Confirmando...' : 'Confirmar e ativar contrato'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
