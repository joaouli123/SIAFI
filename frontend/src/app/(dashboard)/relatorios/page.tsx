'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { BarChart2, RefreshCw, TrendingUp, Users, FileText, FileDown, DollarSign, FileStack } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate, STATUS_LOAN, hojeISODate, primeiroDiaMesISO, mesAtualISO } from '@/lib/utils'
import api from '@/lib/api'

type ReportTab = 'carteira' | 'faturamento' | 'clientes' | 'movimentacao' | 'contratos'

interface FaturamentoConsultor {
  consultorId: number | null
  consultorNome: string
  totalRecebido: number
  faturamentoBruto: number
  recuperacaoCapital: number
  comissao?: number
  lucroLiquido?: number
  quantidadeParcelas: number
}

interface FaturamentoResponse {
  mes: string
  totalRecebido: number
  faturamentoBruto: number
  recuperacaoCapital: number
  comissaoConsultores?: number
  lucroLiquidoEmpresa?: number
  quantidadeParcelas: number
  porConsultor: FaturamentoConsultor[]
}

export default function RelatoriosPage() {
  const [tab, setTab] = useState<ReportTab>('carteira')
  const [startDate, setStartDate] = useState(primeiroDiaMesISO())
  const [endDate, setEndDate] = useState(hojeISODate())
  const [statusFilter, setStatusFilter] = useState('')
  const [faturMes, setFaturMes] = useState(mesAtualISO())

  interface EvolucaoMes { mes: string; label: string; totalRecebido: number; faturamentoBruto: number; novosContratos: number }

  const { data: evolucao } = useQuery<EvolucaoMes[]>({
    queryKey: ['reports', 'evolucao'],
    queryFn: () => api.get<EvolucaoMes[]>('/reports/evolucao', { params: { meses: 6 } }).then(r => r.data),
    staleTime: 5 * 60_000,
  })

  const { data: carteiraData, isLoading: loadingCarteira } = useQuery({
    queryKey: ['reports', 'carteira'],
    queryFn: () => api.get<any>('/reports/carteira').then((r) => r.data),
    enabled: tab === 'carteira',
  })

  const { data: faturData, isLoading: loadingFatur, refetch: refetchFatur } = useQuery({
    queryKey: ['reports', 'faturamento', faturMes],
    queryFn: () => api.get<FaturamentoResponse>('/reports/faturamento', { params: { mes: faturMes } }).then((r) => r.data),
    enabled: tab === 'faturamento',
  })

  const { data: clientesData, isLoading: loadingClientes } = useQuery({
    queryKey: ['reports', 'clientes'],
    queryFn: () => api.get<any>('/reports/clientes').then((r) => r.data),
    enabled: tab === 'clientes',
  })

  const { data: movData, isLoading: loadingMov, refetch: refetchMov } = useQuery({
    queryKey: ['reports', 'movimentacao', startDate, endDate],
    queryFn: () => api.get<any>('/reports/movimentacao', { params: { startDate, endDate } }).then((r) => r.data),
    enabled: tab === 'movimentacao',
  })

  const { data: contratosData, isLoading: loadingContratos, refetch: refetchContratos } = useQuery({
    queryKey: ['reports', 'contratos', statusFilter],
    queryFn: () => api.get<any>('/reports/contratos', { params: { status: statusFilter || undefined } }).then((r) => r.data),
    enabled: tab === 'contratos',
  })

  async function exportarBlob(endpoint: string, filename: string, mimeType: string) {
    const res = await api.get(endpoint, { responseType: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: mimeType }))
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function exportarExcel(endpoint: string, filename: string) {
    return exportarBlob(endpoint, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }

  function exportarPdf(endpoint: string, filename: string) {
    return exportarBlob(endpoint, filename, 'application/pdf')
  }

  const tabs: { key: ReportTab; label: string; icon: React.ElementType }[] = [
    { key: 'carteira', label: 'Carteira', icon: TrendingUp },
    { key: 'faturamento', label: 'Faturamento', icon: DollarSign },
    { key: 'clientes', label: 'Clientes', icon: Users },
    { key: 'movimentacao', label: 'Movimentação', icon: BarChart2 },
    { key: 'contratos', label: 'Contratos', icon: FileText },
  ]

  const faturTotais = faturData ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart2 className="size-6" />Relatórios
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Análises e dados do sistema</p>
        </div>
        <Link href="/relatorios/central">
          <Button variant="outline" size="sm" className="gap-2"><FileStack className="size-4" />Central de Relatórios</Button>
        </Link>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(({ key, label, icon: Icon }) => (
          <Button key={key} variant={tab === key ? 'default' : 'outline'} size="sm" onClick={() => setTab(key)} className="gap-2">
            <Icon className="size-3.5" />{label}
          </Button>
        ))}
      </div>

      {tab === 'carteira' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => exportarPdf('/export/carteira', `carteira-${hojeISODate()}.pdf`)}>
              <FileDown className="size-3.5" />Exportar PDF
            </Button>
          </div>
          {loadingCarteira ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : carteiraData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Capital em Carteira', value: carteiraData.principalEmCarteira ?? carteiraData.valorInvestido ?? 0, color: 'text-foreground' },
                  { label: 'Total a Receber', value: carteiraData.totalReceivableAtivo ?? carteiraData.valorTotalParcelado ?? 0, color: 'text-blue-700' },
                  { label: 'Faturamento Realizado', value: carteiraData.faturamentoRealizado ?? carteiraData.valorRecebido ?? 0, color: 'text-green-700' },
                  { label: 'A Faturar', value: carteiraData.faturamentoAReceber ?? carteiraData.aReceber ?? 0, color: 'text-orange-600' },
                ].map((item) => (
                  <Card key={item.label}>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className={`text-xl font-bold mt-1 ${item.color}`}>{formatCurrency(item.value as number)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-green-50 dark:bg-green-950/20">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Empréstimos Ativos</p>
                    <p className="text-xl font-bold mt-1 text-green-700">{carteiraData.totalAtivos ?? '—'}</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 dark:bg-red-950/20">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Empréstimos em Atraso</p>
                    <p className="text-xl font-bold mt-1 text-red-700">{carteiraData.totalAtrasados ?? '—'}</p>
                  </CardContent>
                </Card>
              </div>
              {evolucao && evolucao.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Evolução dos últimos 6 meses</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={evolucao} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(215.4 16.3% 46.9% / 0.2)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={40} />
                        <Tooltip formatter={(v: any, n: any) => [formatCurrency(Number(v ?? 0)), String(n ?? '')]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                        <Bar dataKey="totalRecebido" name="Total Recebido" fill="#16a34a" radius={[3,3,0,0]} maxBarSize={40} />
                        <Bar dataKey="faturamentoBruto" name="Lucro" fill="#ea580c" radius={[3,3,0,0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </div>
      )}

      {tab === 'faturamento' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex gap-4 flex-wrap items-end">
                <div className="space-y-1.5">
                  <Label>Mês de referência</Label>
                  <Input
                    type="month"
                    value={faturMes}
                    onChange={(e) => setFaturMes(e.target.value)}
                    className="w-44"
                  />
                </div>
                <Button onClick={() => refetchFatur()} className="gap-2">
                  <RefreshCw className="size-3.5" />Gerar
                </Button>
              </div>
            </CardHeader>
          </Card>

          {loadingFatur ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : faturTotais ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-blue-50 dark:bg-blue-950/20">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total Recebido</p>
                    <p className="text-xl font-bold mt-1 text-blue-700">{formatCurrency(Number(faturTotais.totalRecebido))}</p>
                    <p className="text-xs text-muted-foreground mt-1">{faturTotais.quantidadeParcelas} parcela{faturTotais.quantidadeParcelas !== 1 ? 's' : ''} pagas</p>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50 dark:bg-orange-950/20">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Faturamento Bruto (Lucro)</p>
                    <p className="text-xl font-bold mt-1 text-orange-600">{formatCurrency(Number(faturTotais.faturamentoBruto))}</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 dark:bg-green-950/20">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Recuperação de Capital</p>
                    <p className="text-xl font-bold mt-1 text-green-700">{formatCurrency(Number(faturTotais.recuperacaoCapital))}</p>
                  </CardContent>
                </Card>
              </div>

              {faturTotais.comissaoConsultores != null && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-emerald-50 dark:bg-emerald-950/20">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Comissão dos Consultores</p>
                      <p className="text-xl font-bold mt-1 text-emerald-700 dark:text-emerald-400">{formatCurrency(Number(faturTotais.comissaoConsultores))}</p>
                      <p className="text-xs text-muted-foreground mt-1">Parte do lucro repassada</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-indigo-50 dark:bg-indigo-950/20">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Lucro Líquido da Empresa</p>
                      <p className="text-xl font-bold mt-1 text-indigo-700 dark:text-indigo-400">{formatCurrency(Number(faturTotais.lucroLiquidoEmpresa))}</p>
                      <p className="text-xs text-muted-foreground mt-1">Lucro − comissões</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {faturData?.porConsultor && faturData.porConsultor.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Faturamento por Consultor</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Consultor</th>
                          <th className="text-center px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Parcelas</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total Recebido</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Lucro</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell">Comissão</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell">Lucro Líq.</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Capital Rec.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faturData.porConsultor.map((row, idx) => (
                          <tr key={row.consultorId ?? idx} className="border-b border-border hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-medium">{row.consultorNome}</td>
                            <td className="px-4 py-2.5 text-center text-muted-foreground hidden sm:table-cell">{row.quantidadeParcelas}</td>
                            <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(Number(row.totalRecebido))}</td>
                            <td className="px-4 py-2.5 text-right text-orange-600 hidden md:table-cell">{formatCurrency(Number(row.faturamentoBruto))}</td>
                            <td className="px-4 py-2.5 text-right text-emerald-700 dark:text-emerald-400 hidden lg:table-cell">{formatCurrency(Number(row.comissao ?? 0))}</td>
                            <td className="px-4 py-2.5 text-right text-indigo-700 dark:text-indigo-400 hidden lg:table-cell">{formatCurrency(Number(row.lucroLiquido ?? row.faturamentoBruto))}</td>
                            <td className="px-4 py-2.5 text-right text-green-700 hidden md:table-cell">{formatCurrency(Number(row.recuperacaoCapital))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/30">
                          <td className="px-4 py-2.5 font-semibold">Total</td>
                          <td className="px-4 py-2.5 text-center font-semibold hidden sm:table-cell">{faturTotais.quantidadeParcelas}</td>
                          <td className="px-4 py-2.5 text-right font-bold">{formatCurrency(Number(faturTotais.totalRecebido))}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-orange-600 hidden md:table-cell">{formatCurrency(Number(faturTotais.faturamentoBruto))}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400 hidden lg:table-cell">{formatCurrency(Number(faturTotais.comissaoConsultores ?? 0))}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-indigo-700 dark:text-indigo-400 hidden lg:table-cell">{formatCurrency(Number(faturTotais.lucroLiquidoEmpresa ?? faturTotais.faturamentoBruto))}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-green-700 hidden md:table-cell">{formatCurrency(Number(faturTotais.recuperacaoCapital))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Selecione o mês e clique em Gerar.
            </div>
          )}
        </div>
      )}

      {tab === 'clientes' && (
        <div className="space-y-4">
          {loadingClientes ? (
            <Skeleton className="h-48 w-full" />
          ) : clientesData ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Total de Clientes', value: clientesData.total ?? '—' },
                { label: 'Clientes Ativos', value: clientesData.ativos ?? '—' },
                { label: 'Clientes Inativos', value: clientesData.inativos ?? '—' },
                { label: 'Com Empréstimo Ativo', value: clientesData.comEmprestimoAtivo ?? '—' },
                { label: 'Inadimplentes', value: clientesData.inadimplentes ?? '—' },
                { label: 'Novos no Mês', value: clientesData.novosMes ?? '—' },
              ].map((item) => (
                <Card key={item.label}><CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-xl font-bold mt-1">{item.value}</p>
                </CardContent></Card>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {tab === 'movimentacao' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex gap-4 flex-wrap items-end">
                <div className="space-y-1.5">
                  <Label>Data inicial</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-44" />
                </div>
                <div className="space-y-1.5">
                  <Label>Data final</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44" />
                </div>
                <Button onClick={() => refetchMov()} className="gap-2"><RefreshCw className="size-3.5" />Gerar</Button>
                <Button variant="outline" className="gap-2"
                  onClick={() => exportarExcel(`/export/movimentacao/excel?startDate=${startDate}&endDate=${endDate}`, `movimentacao-${startDate}-${endDate}.xlsx`)}>
                  <FileDown className="size-3.5" />Excel
                </Button>
              </div>
            </CardHeader>
          </Card>
          {loadingMov ? <Skeleton className="h-48 w-full" /> : movData ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-green-50 dark:bg-green-950/20"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Entradas</p><p className="text-xl font-bold text-green-700">{formatCurrency(movData.entradas ?? 0)}</p></CardContent></Card>
              <Card className="bg-red-50 dark:bg-red-950/20"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Saídas</p><p className="text-xl font-bold text-red-700">{formatCurrency(movData.saidas ?? 0)}</p></CardContent></Card>
              <Card className="bg-blue-50 dark:bg-blue-950/20"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Saldo</p><p className="text-xl font-bold text-blue-700">{formatCurrency(movData.saldo ?? 0)}</p></CardContent></Card>
            </div>
          ) : null}
        </div>
      )}

      {tab === 'contratos' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-center">
            {['', 'ativo', 'quitado', 'inadimplente', 'cancelado'].map((s) => (
              <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)}>
                {s === '' ? 'Todos' : STATUS_LOAN[s]?.label ?? s}
              </Button>
            ))}
            <Button size="sm" variant="outline" className="gap-1.5 ml-auto"
              onClick={() => exportarExcel(`/export/contratos/excel${statusFilter ? `?status=${statusFilter}` : ''}`, `contratos${statusFilter ? `-${statusFilter}` : ''}.xlsx`)}>
              <FileDown className="size-3.5" />Excel
            </Button>
          </div>
          {loadingContratos ? <Skeleton className="h-64 w-full" /> : (
            <Card>
              <CardContent className="p-0">
                {!contratosData?.length ? (
                  <div className="p-8 text-center text-muted-foreground">Nenhum contrato encontrado.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Capital</th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">Parcelas</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Início</th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contratosData.map((c: any) => {
                          const st = STATUS_LOAN[c.status] ?? { label: c.status, variant: 'outline' as const }
                          return (
                            <tr key={c.id} className="border-b border-border hover:bg-muted/20">
                              <td className="px-4 py-2.5 text-muted-foreground">#{c.id}</td>
                              <td className="px-4 py-2.5 font-medium">{c.client?.nome}</td>
                              <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(c.principalAmount ?? c.valor)}</td>
                              <td className="px-4 py-2.5 text-center text-muted-foreground">{c.numeroParcelas}x</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{formatDate(c.dataInicio)}</td>
                              <td className="px-4 py-2.5 text-center"><Badge variant={st.variant}>{st.label}</Badge></td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/30">
                          <td colSpan={2} className="px-4 py-2.5 font-semibold text-sm">
                            {contratosData.length} contrato{contratosData.length !== 1 ? 's' : ''}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-sm">
                            {formatCurrency(contratosData.reduce((s: number, c: any) => s + Number(c.principalAmount ?? c.valor), 0))}
                          </td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
