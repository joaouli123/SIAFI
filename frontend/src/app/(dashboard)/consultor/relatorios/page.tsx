'use client'

import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, AlertTriangle, DollarSign, CreditCard,
  RefreshCw, BarChart2, Percent,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface RelatorioResumo {
  totalContratos: number
  totalInvestido: number
  totalAReceber: number
  totalRecebido: number
  totalEmAtraso: number
  comissaoPrevista?: number
  comissaoRealizada?: number
  inadimplentes: number
}

interface FaturamentoMes {
  mes: string
  total: number
}

interface ParcelaAtrasada {
  installmentAmount: number
  totalPago: number
  dataVencimento: string
  loan: { client: { nome: string } }
}

interface RelatorioData {
  resumo: RelatorioResumo
  faturamentoMensal: FaturamentoMes[]
  parcelasAtrasadas: ParcelaAtrasada[]
}

function mesLabel(mes: string) {
  const [ano, m] = mes.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[parseInt(m) - 1]}/${ano.slice(2)}`
}

function diasAtraso(dataVencimento: string) {
  const venc = new Date(dataVencimento)
  venc.setHours(0, 0, 0, 0)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000)
}

const colorMap = {
  blue:  { bg: 'bg-blue-50 dark:bg-blue-950/30', icon: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600', value: 'text-blue-700 dark:text-blue-400' },
  green: { bg: 'bg-green-50 dark:bg-green-950/30', icon: 'bg-green-100 dark:bg-green-900/40 text-green-600', value: 'text-green-700 dark:text-green-400' },
  red:   { bg: 'bg-red-50 dark:bg-red-950/30', icon: 'bg-red-100 dark:bg-red-900/40 text-red-600', value: 'text-red-700 dark:text-red-400' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', icon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600', value: 'text-amber-700 dark:text-amber-400' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', icon: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600', value: 'text-emerald-700 dark:text-emerald-400' },
}
type Color = keyof typeof colorMap

function KpiCard({
  title, value, icon: Icon, color, loading, sub,
}: { title: string; value: string; icon: React.ElementType; color: Color; loading: boolean; sub?: string }) {
  const c = colorMap[color]
  return (
    <Card className={cn('border-0 shadow-sm', c.bg)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={cn('rounded-lg p-2', c.icon)}><Icon className="size-4" /></div>
      </CardHeader>
      <CardContent>
        {loading
          ? <Skeleton className="h-8 w-28" />
          : <>
              <p className={cn('text-2xl font-bold', c.value)}>{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            </>
        }
      </CardContent>
    </Card>
  )
}

export default function ConsultorRelatoriosPage() {
  const { data, isLoading, refetch, isFetching } = useQuery<RelatorioData>({
    queryKey: ['consultor', 'relatorio'],
    queryFn: () => api.get('/consultor/relatorio').then(r => r.data),
    refetchInterval: 120_000,
  })

  const maxFat = Math.max(...(data?.faturamentoMensal.map(m => m.total) ?? [1]), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios da Carteira</h1>
          <p className="text-muted-foreground text-sm mt-1">Desempenho e inadimplência da sua carteira</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        <KpiCard
          title="Contratos Ativos"
          value={isLoading ? '—' : String(data?.resumo.totalContratos ?? 0)}
          icon={CreditCard} color="blue" loading={isLoading}
        />
        <KpiCard
          title="Total Recebido"
          value={isLoading ? '—' : formatCurrency(data?.resumo.totalRecebido ?? 0)}
          icon={DollarSign} color="green" loading={isLoading}
        />
        <KpiCard
          title="A Receber"
          value={isLoading ? '—' : formatCurrency(data?.resumo.totalAReceber ?? 0)}
          icon={TrendingUp} color="blue" loading={isLoading}
          sub={isLoading ? undefined : `Capital investido: ${formatCurrency(data?.resumo.totalInvestido ?? 0)}`}
        />
        <KpiCard
          title="Em Atraso"
          value={isLoading ? '—' : formatCurrency(data?.resumo.totalEmAtraso ?? 0)}
          icon={AlertTriangle} color="red" loading={isLoading}
          sub={isLoading ? undefined : `${data?.resumo.inadimplentes ?? 0} contrato${(data?.resumo.inadimplentes ?? 0) !== 1 ? 's' : ''} inadimplente${(data?.resumo.inadimplentes ?? 0) !== 1 ? 's' : ''}`}
        />
        <KpiCard
          title="Taxa de Inadimplência"
          value={isLoading || !data?.resumo.totalAReceber
            ? '—'
            : `${((data.resumo.totalEmAtraso / (data.resumo.totalAReceber || 1)) * 100).toFixed(1)}%`}
          icon={BarChart2} color="amber" loading={isLoading}
        />
        <KpiCard
          title="Comissão Recebida"
          value={isLoading ? '—' : formatCurrency(data?.resumo.comissaoRealizada ?? 0)}
          icon={Percent} color="emerald" loading={isLoading}
          sub={isLoading ? undefined : `Prevista (contratos ativos): ${formatCurrency(data?.resumo.comissaoPrevista ?? 0)}`}
        />
      </div>

      {/* Faturamento mensal */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="size-4 text-green-500" />
            Faturamento — Últimos 6 Meses
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-end gap-3 h-32">
              {[0,1,2,3,4,5].map(i => <Skeleton key={i} className="flex-1 rounded" style={{ height: `${40 + i * 15}%` }} />)}
            </div>
          ) : !data?.faturamentoMensal.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados de faturamento.</p>
          ) : (
            <div className="space-y-3">
              {data.faturamentoMensal.map((m) => {
                const pct = maxFat > 0 ? (m.total / maxFat) * 100 : 0
                return (
                  <div key={m.mes} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-12 shrink-0">{mesLabel(m.mes)}</span>
                    <div className="flex-1 bg-muted/40 rounded-full h-5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500/80 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-24 text-right shrink-0">
                      {formatCurrency(m.total)}
                    </span>
                  </div>
                )
              })}
              <p className="text-xs text-muted-foreground text-right pt-1">
                Total período: {formatCurrency(data.faturamentoMensal.reduce((s, m) => s + m.total, 0))}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parcelas em atraso */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="size-4 text-red-500" />
            Parcelas em Atraso
            {(data?.parcelasAtrasadas.length ?? 0) > 0 && (
              <Badge variant="destructive" className="text-xs">{data?.parcelasAtrasadas.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !data?.parcelasAtrasadas.length ? (
            <div className="text-center py-8 text-green-600">
              <p className="font-medium text-sm">Nenhuma parcela em atraso!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.parcelasAtrasadas.map((inst, i) => {
                const dias = diasAtraso(inst.dataVencimento)
                const saldo = Number(inst.installmentAmount) - Number(inst.totalPago)
                return (
                  <div key={i} className={cn(
                    'flex items-center justify-between rounded-lg px-4 py-3 border',
                    dias > 30
                      ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                      : 'bg-muted/30 border-border',
                  )}>
                    <div>
                      <p className="text-sm font-medium">{inst.loan.client.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Venceu {formatDate(inst.dataVencimento)} ·{' '}
                        <span className="font-medium text-red-600">{dias} dia{dias !== 1 ? 's' : ''} de atraso</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(saldo)}</p>
                      <p className="text-xs text-muted-foreground">saldo</p>
                    </div>
                  </div>
                )
              })}
              {(data?.parcelasAtrasadas.length ?? 0) >= 20 && (
                <p className="text-xs text-muted-foreground text-center pt-1">Exibindo as 20 mais antigas</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
