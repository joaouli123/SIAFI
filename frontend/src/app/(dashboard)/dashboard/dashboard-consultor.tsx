'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Users, TrendingUp, AlertTriangle, ClipboardList, RefreshCw,
  ChevronRight, Phone, Clock, MessageSquare, CheckCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useUnreadCount } from '@/hooks/useUnreadCount'

interface ConsultorStats {
  totalClientes: number
  emprestimoAtivos: number
  parcelasAtrasadas: number
}

interface Intencao {
  id: number
  valorSolicitado: number
  numeroParcelas: number
  status: string
  feedbackEnviadoEm: string | null
  createdAt: string
  client: { nome: string }
}

interface Solicitacao {
  id: number
  tipo: string
  status: string
  client: { nome: string }
  createdAt: string
}

interface OverdueInstallment {
  id: number
  numero: number
  dataVencimento: string
  installmentAmount: number
  totalPago: number
  loan: {
    id: number
    client: { id: number; nome: string; whatsapp: string | null }
  }
}

const colorMap = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 transition-colors', icon: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600', value: 'text-blue-700 dark:text-blue-400' },
  green:  { bg: 'bg-green-50 dark:bg-green-950/30 hover:bg-green-100 transition-colors', icon: 'bg-green-100 dark:bg-green-900/40 text-green-600', value: 'text-green-700 dark:text-green-400' },
  red:    { bg: 'bg-red-50 dark:bg-red-950/30 hover:bg-red-100 transition-colors', icon: 'bg-red-100 dark:bg-red-900/40 text-red-600', value: 'text-red-700 dark:text-red-400' },
  amber:  { bg: 'bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 transition-colors', icon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600', value: 'text-amber-700 dark:text-amber-400' },
}

type Color = keyof typeof colorMap

function StatCard({ title, value, icon: Icon, color, isLoading, href }: {
  title: string; value: string | number; icon: React.ElementType
  color: Color; isLoading: boolean; href?: string
}) {
  const c = colorMap[color]
  const content = (
    <Card className={cn('border-0 shadow-sm', c.bg, href && 'cursor-pointer')}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={cn('rounded-lg p-2', c.icon)}><Icon className="size-4" /></div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-20" /> : <p className={cn('text-2xl font-bold', c.value)}>{value}</p>}
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function diasAtraso(dataVencimento: string) {
  const venc = new Date(dataVencimento)
  venc.setHours(0, 0, 0, 0)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000)
}

export default function DashboardConsultor() {
  const unreadCount = useUnreadCount()

  const statsQuery = useQuery({
    queryKey: ['consultor', 'stats'],
    queryFn: () => api.get<ConsultorStats>('/consultor/stats').then(r => r.data),
    refetchInterval: 60_000,
  })

  const intencoesQuery = useQuery({
    queryKey: ['intencoes', 'consultor'],
    queryFn: () => api.get<Intencao[]>('/intencoes').then(r => r.data),
    refetchInterval: 120_000,
  })

  const solicitacoesQuery = useQuery({
    queryKey: ['solicitacoes', 'consultor', 'pendente'],
    queryFn: () => api.get<Solicitacao[]>('/solicitacoes', { params: { status: 'pendente' } }).then(r => r.data),
    refetchInterval: 120_000,
  })

  const overdueQuery = useQuery({
    queryKey: ['installments', 'overdue', 'consultor'],
    queryFn: () => api.get<OverdueInstallment[]>('/installments/overdue').then(r => r.data),
    refetchInterval: 120_000,
  })

  // Uma linha por cliente: o consultor liga para a pessoa, nao para a parcela.
  // Ordena pelo atraso mais antigo, que era a prioridade da lista por parcela.
  const clientesEmAtraso = useMemo(() => {
    const mapa = new Map<number, {
      clientId: number; nome: string; numeros: number[]
      saldo: number; diasMax: number; maisAntiga: string
    }>()
    for (const inst of overdueQuery.data ?? []) {
      const id = inst.loan.client.id
      const atual = mapa.get(id) ?? {
        clientId: id, nome: inst.loan.client.nome, numeros: [],
        saldo: 0, diasMax: 0, maisAntiga: inst.dataVencimento,
      }
      atual.numeros.push(inst.numero)
      atual.saldo += Number(inst.installmentAmount) - Number(inst.totalPago)
      const dias = diasAtraso(inst.dataVencimento)
      if (dias > atual.diasMax) { atual.diasMax = dias; atual.maisAntiga = inst.dataVencimento }
      mapa.set(id, atual)
    }
    return [...mapa.values()]
      .map(c => ({ ...c, numeros: c.numeros.sort((x, y) => x - y) }))
      .sort((a, b) => b.diasMax - a.diasMax)
  }, [overdueQuery.data])

  // Intenções aprovadas ou rejeitadas sem feedback enviado → ação necessária
  const intencoesAcao = intencoesQuery.data?.filter(
    i => (i.status === 'aprovado' || i.status === 'rejeitado') && !i.feedbackEnviadoEm
  ) ?? []

  const isLoading = statsQuery.isLoading

  function refetchAll() {
    statsQuery.refetch()
    intencoesQuery.refetch()
    solicitacoesQuery.refetch()
    overdueQuery.refetch()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Minha Carteira</h2>
          <p className="text-muted-foreground text-sm mt-1">Visão geral da sua carteira de clientes</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll} disabled={isLoading} className="gap-2">
          <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Meus Clientes"
          value={statsQuery.data?.totalClientes ?? '—'}
          icon={Users} color="blue" isLoading={isLoading} href="/clientes"
        />
        <StatCard
          title="Intenções Aguardando"
          value={intencoesQuery.data?.filter(i => i.status === 'aguardando').length ?? '—'}
          icon={TrendingUp} color="green" isLoading={intencoesQuery.isLoading} href="/intencoes"
        />
        <StatCard
          title="Em Atraso"
          value={statsQuery.data?.parcelasAtrasadas ?? '—'}
          icon={AlertTriangle} color="red" isLoading={isLoading} href="/cobrancas"
        />
        <StatCard
          title="Solicitações Pendentes"
          value={solicitacoesQuery.data?.length ?? '—'}
          icon={ClipboardList} color="amber" isLoading={solicitacoesQuery.isLoading} href="/solicitacoes"
        />
      </div>

      {/* Ações necessárias */}
      {(intencoesAcao.length > 0 || unreadCount > 0) && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <Clock className="size-4" />
              Ações necessárias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {intencoesAcao.map(int => (
              <Link key={int.id} href="/intencoes">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-900 rounded-lg border border-blue-100 dark:border-blue-900 hover:bg-blue-50/50 transition-colors">
                  {int.status === 'aprovado'
                    ? <CheckCircle className="size-4 text-green-500 shrink-0" />
                    : <AlertTriangle className="size-4 text-red-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      Intenção #{int.id} {int.status === 'aprovado' ? 'aprovada' : 'rejeitada'} — informar {int.client.nome}
                    </p>
                    <p className="text-xs text-muted-foreground">Feedback pendente desde {formatDate(int.createdAt)}</p>
                  </div>
                  <Badge variant={int.status === 'aprovado' ? 'default' : 'destructive'} className="text-xs shrink-0">
                    {int.status === 'aprovado' ? 'Aprovada' : 'Rejeitada'}
                  </Badge>
                </div>
              </Link>
            ))}
            {unreadCount > 0 && (
              <Link href="/mensagens">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-900 rounded-lg border border-blue-100 dark:border-blue-900 hover:bg-blue-50/50 transition-colors">
                  <MessageSquare className="size-4 text-blue-500 shrink-0" />
                  <p className="text-sm font-medium flex-1">
                    {unreadCount} mensagen{unreadCount !== 1 ? 's' : ''} não lida{unreadCount !== 1 ? 's' : ''}
                  </p>
                  <Badge className="bg-red-500 text-white text-xs shrink-0">{unreadCount > 9 ? '9+' : unreadCount}</Badge>
                </div>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cobranças urgentes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="size-4 text-red-500" />
            Cobranças urgentes
            {clientesEmAtraso.length > 0 && (
              <Badge variant="destructive" className="text-xs" title={`${overdueQuery.data?.length ?? 0} parcelas em atraso`}>
                {clientesEmAtraso.length} cliente{clientesEmAtraso.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
          <Link href="/cobrancas">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
              Ver todas <ChevronRight className="size-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {overdueQuery.isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !overdueQuery.data?.length ? (
            <div className="text-center py-8">
              <CheckCircle className="size-8 mx-auto text-green-500 mb-2" />
              <p className="text-sm text-green-600 font-medium">Nenhuma parcela em atraso!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {clientesEmAtraso.slice(0, 10).map(c => (
                <div key={c.clientId} className={cn(
                  'flex items-center justify-between rounded-lg px-4 py-3 border',
                  c.diasMax > 30
                    ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                    : 'bg-muted/30 border-border',
                )}>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/consultor/relatorio-cliente?clientId=${c.clientId}`}
                      className="block text-sm font-medium truncate hover:underline"
                      title="Abrir os contratos deste cliente"
                    >
                      {c.nome}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {c.numeros.length === 1
                        ? `Parcela ${c.numeros[0]}`
                        : `${c.numeros.length} parcelas (${c.numeros.map(n => `P${n}`).join(', ')})`} ·{' '}
                      {c.numeros.length === 1 ? 'Venceu' : 'A mais antiga venceu'} {formatDate(c.maisAntiga)} ·{' '}
                      <span className="font-medium text-red-600">{c.diasMax} dia{c.diasMax !== 1 ? 's' : ''} de atraso</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(c.saldo)}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.numeros.length === 1 ? 'saldo devedor' : 'total em atraso'}
                      </p>
                    </div>
                    <Link href="/cobrancas">
                      <Button size="sm" variant="outline" className="gap-1 text-xs">
                        <Phone className="size-3" />
                        Registrar
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
              {clientesEmAtraso.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{clientesEmAtraso.length - 10} cliente{clientesEmAtraso.length - 10 !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
