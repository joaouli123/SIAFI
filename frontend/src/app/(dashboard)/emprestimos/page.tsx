'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Plus, Search, RefreshCw, Eye, XCircle, CreditCard, TrendingUp,
  AlertTriangle, CheckCircle, Clock, MessageSquare, QrCode, FileText,
  DollarSign, X, ExternalLink, Pencil, FileDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  formatCurrency, formatDate, formatDateLocal, formatDateTimeLocal,
  formatCPF, toNumber, STATUS_LOAN, STATUS_INSTALLMENT, hojeISODate,
} from '@/lib/utils'
import { useAuth } from '@/contexts/auth.context'
import api from '@/lib/api'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface LoanStats {
  totalAtivos: number
  totalQuitados: number
  valorEmCarteira: string
  valorRecebidoMes: string
}

interface LoanRow {
  id: number
  principalAmount: string
  targetProfit: string
  totalReceivable: string
  numeroParcelas: number
  dataInicio: string
  status: string
  installmentAmount?: string
  client: { id: number; nome: string; cpf: string | null }
  consultor?: { id: number; nome: string } | null
}

interface LoansResponse { data: LoanRow[]; total: number; page: number; lastPage: number }

interface PixPayment {
  id: number
  txid: string | null
  qrCode: string | null
  pixCopiaECola: string | null
  amount: string
  status: string
  createdAt: string
  paidAt: string | null
  whatsappEnviadoEm: string | null
  emailEnviadoEm: string | null
  installmentId: number
}

interface MpPayment {
  id: number
  paymentId: string | null
  valor: string
  status: string
  createdAt: string
  installmentId: number
}

interface InstallmentDetail {
  id: number
  numero: number
  installmentAmount: string
  dataVencimento: string
  status: string
  totalPago: string
  saldoDevedor: string
  moraAcumulada: string
  multaAplicada: string
  principalPayback?: string
  netGain?: string
  pixPayments: PixPayment[]
  mpPayments: MpPayment[]
}

interface Notification {
  id: number
  type: string
  assunto: string | null
  canal: string | null
  status: string
  createdAt: string
}

interface Renegociacao {
  id: number
  novoValorTotal: string | null
  novasNumeroParcelas: number | null
  observacoes: string | null
  createdAt: string
}

interface LoanDetail {
  id: number
  principalAmount: string
  targetProfit: string
  totalReceivable: string
  numeroParcelas: number
  dataInicio: string
  status: string
  observacoes: string | null
  diaVencimento: number | null
  multaPercentual: string | null
  moraDiariaPercentual: string | null
  diasAntecedenciaCobranca: number | null
  cobrarWhatsapp: boolean
  cobrarEmail: boolean
  cobrarPortal: boolean
  createdAt: string
  liberadoEm: string | null
  client: {
    id: number; nome: string; cpf: string | null; email?: string | null; whatsapp: string | null
  }
  consultor: { id: number; nome: string } | null
  installments: InstallmentDetail[]
  notifications: Notification[]
  renegociacoes: Renegociacao[]
}

// ─── Hook de debounce ────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`rounded-lg p-2 ${color.replace('text-', 'bg-').replace('-600', '-100').replace('-700', '-100')} dark:bg-opacity-20`}>
            <Icon className={`size-4 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Sheet de detalhe ────────────────────────────────────────────────────────

function LoanDetailSheet({
  loanId, open, onClose,
}: {
  loanId: number | null; open: boolean; onClose: () => void
}) {
  const { user } = useAuth()
  const canSeeSplit = user?.role === 'admin' || user?.role === 'financeiro'

  const { data: loan, isLoading } = useQuery({
    queryKey: ['loan-detail', loanId],
    queryFn: () => api.get<LoanDetail>(`/loans/${loanId}`).then((r) => r.data),
    enabled: open && loanId !== null,
  })

  if (!open) return null

  const st = loan ? (STATUS_LOAN[loan.status] ?? { label: loan.status, variant: 'outline' as const }) : null
  const totalPago = loan?.installments.reduce((s, i) => s + toNumber(i.totalPago), 0) ?? 0
  const totalReceivable = toNumber(loan?.totalReceivable)
  const pctPago = totalReceivable > 0 ? Math.min(100, (totalPago / totalReceivable) * 100) : 0
  // Saldo a cobrar AGORA (saldo + multa + mora das parcelas em aberto) — coerente com /parcelas e a página completa.
  const saldoComEncargos = loan?.installments
    .filter((i) => i.status !== 'pago' && i.status !== 'cancelado')
    .reduce((s, i) => s + Math.max(0, toNumber(i.saldoDevedor)) + toNumber(i.moraAcumulada) + toNumber(i.multaAplicada), 0) ?? 0
  const parcelasPagas = loan?.installments.filter((i) => i.status === 'pago').length ?? 0

  // Flatten pixPayments de todas as parcelas
  const allPix: (PixPayment & { parcelaNumero: number })[] =
    loan?.installments.flatMap((i) =>
      i.pixPayments.map((p) => ({ ...p, parcelaNumero: i.numero })),
    ) ?? []

  const allMp: (MpPayment & { parcelaNumero: number })[] =
    loan?.installments.flatMap((i) =>
      i.mpPayments.map((p) => ({ ...p, parcelaNumero: i.numero })),
    ) ?? []

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:!max-w-3xl lg:!max-w-4xl overflow-y-auto p-0 flex flex-col"
      >
        {isLoading || !loan ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            {/* Cabeçalho fixo */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 pt-5 pb-5">
              <SheetHeader className="mb-4">
                <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
                  <div>
                    <SheetTitle className="text-xl md:text-2xl font-bold">Contrato #{loan.id}</SheetTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      <Link
                        href={`/clientes/${loan.client.id}`}
                        className="hover:underline text-foreground/80"
                        onClick={onClose}
                      >
                        {loan.client.nome}
                      </Link>
                      {loan.client.cpf ? ` · ${formatCPF(loan.client.cpf)}` : ''}
                      {loan.consultor?.nome ? <span className="text-muted-foreground/60"> · Cons: {loan.consultor.nome}</span> : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    {st && <Badge variant={st.variant} className="mr-2">{st.label}</Badge>}
                    <a
                      href={`/api/export/contratos/${loan.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted transition-colors"
                      title="Ver Contrato"
                    >
                      <FileText className="size-4" />
                      <span className="hidden md:inline">Ver Contrato</span>
                    </a>
                    {loan.status !== 'cancelado' && (
                      <Link href={`/emprestimos/${loan.id}/editar`} onClick={onClose}>
                        <Button variant="ghost" size="sm" className="gap-1.5 px-2" title="Editar">
                          <Pencil className="size-4" />
                          <span className="hidden md:inline">Editar</span>
                        </Button>
                      </Link>
                    )}
                    <Link href={`/emprestimos/${loan.id}`} onClick={onClose}>
                      <Button variant="ghost" size="sm" className="gap-1.5 px-2" title="Página completa">
                        <ExternalLink className="size-4" />
                        <span className="hidden md:inline">Página completa</span>
                      </Button>
                    </Link>
                    <button
                      onClick={onClose}
                      className="ml-1 h-8 w-8 p-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <X className="size-4.5" />
                    </button>
                  </div>
                </div>
              </SheetHeader>

              {/* Mini KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Capital', value: formatCurrency(loan.principalAmount) },
                  { label: 'Total c/ juros', value: formatCurrency(loan.totalReceivable) },
                  { label: 'Total pago', value: formatCurrency(totalPago), color: 'text-green-600 dark:text-green-500' },
                  {
                    label: 'Saldo',
                    value: formatCurrency(saldoComEncargos),
                    color: saldoComEncargos > 0 ? 'text-red-600 dark:text-red-500' : 'text-green-600 dark:text-green-500',
                  },
                ].map((k) => (
                  <div key={k.label} className="bg-slate-50 dark:bg-slate-900/40 rounded-xl px-3 py-3 flex flex-col justify-center border border-border/40">
                    <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
                    <p className={`text-sm md:text-base font-bold ${k.color ?? 'text-foreground'}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Barra de progresso */}
              <div className="mt-3">
                <Progress value={pctPago} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {pctPago.toFixed(0)}% · {parcelasPagas} de {loan.numeroParcelas} parcelas pagas ·
                  Início: {formatDateLocal(loan.dataInicio)}
                </p>
              </div>
            </div>

            {/* Abas */}
            <Tabs defaultValue="visao-geral" className="flex-1 px-6 py-4">
              <TabsList className="w-full mb-4 grid grid-cols-5">
                <TabsTrigger value="visao-geral">Geral</TabsTrigger>
                <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
                <TabsTrigger value="comunicacoes">
                  Comunicações {loan.notifications.length > 0 && `(${loan.notifications.length})`}
                </TabsTrigger>
                <TabsTrigger value="pix">PIX</TabsTrigger>
                <TabsTrigger value="renegociacoes">Reneg.</TabsTrigger>
              </TabsList>

              {/* ── Aba 1: Visão Geral ── */}
              <TabsContent value="visao-geral" className="space-y-6 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 text-sm">
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Cliente</p>
                      <p className="font-medium">{loan.client.nome}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">CPF</p>
                      <p className="font-medium">
                        {loan.client.cpf
                          ? formatCPF(loan.client.cpf)
                          : <span className="text-muted-foreground italic text-xs">Não informado</span>}
                      </p>
                    </div>
                    {loan.client.whatsapp && (
                      <div>
                        <p className="text-xs text-muted-foreground">WhatsApp</p>
                        <p className="font-medium">{loan.client.whatsapp}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Capital emprestado</p>
                      <p className="font-bold">{formatCurrency(loan.principalAmount)}</p>
                    </div>
                    {canSeeSplit && (
                      <div>
                        <p className="text-xs text-muted-foreground">Lucro alvo</p>
                        <p className="font-medium text-orange-600">{formatCurrency(loan.targetProfit)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Total a receber</p>
                      <p className="font-bold text-blue-700 dark:text-blue-400">{formatCurrency(loan.totalReceivable)}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Número de parcelas</p>
                      <p className="font-medium">{loan.numeroParcelas}x</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Dia de vencimento</p>
                      <p className="font-medium">
                        {loan.diaVencimento ? `Dia ${loan.diaVencimento}` : 'Calculado pela data de início'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Multa por atraso</p>
                      <p className="font-medium">
                        {loan.multaPercentual ? `${toNumber(loan.multaPercentual).toFixed(2)}%` : 'Padrão global (2%)'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Mora diária</p>
                      <p className="font-medium">
                        {loan.moraDiariaPercentual
                          ? `${toNumber(loan.moraDiariaPercentual).toFixed(4)}%/dia`
                          : 'Padrão global (0,0333%/dia)'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Antecedência de cobrança</p>
                      <p className="font-medium">{loan.diasAntecedenciaCobranca ?? 10} dias antes</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Canais de cobrança</p>
                      <div className="flex gap-1 flex-wrap mt-0.5">
                        {loan.cobrarWhatsapp && <Badge variant="outline" className="text-xs">WhatsApp</Badge>}
                        {loan.cobrarEmail && <Badge variant="outline" className="text-xs">Email</Badge>}
                        {loan.cobrarPortal && <Badge variant="outline" className="text-xs">Portal</Badge>}
                      </div>
                    </div>
                  </div>
                </div>

                {loan.consultor && (
                  <div className="text-sm border-t pt-3">
                    <p className="text-xs text-muted-foreground">Consultor responsável</p>
                    <p className="font-medium">{loan.consultor.nome}</p>
                  </div>
                )}
                <div className="text-sm border-t pt-3 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Criado em</p>
                    <p className="font-medium">{formatDateTimeLocal(loan.createdAt)}</p>
                  </div>
                  {loan.liberadoEm && (
                    <div>
                      <p className="text-xs text-muted-foreground">Capital liberado em</p>
                      <p className="font-medium">{formatDateTimeLocal(loan.liberadoEm)}</p>
                    </div>
                  )}
                </div>
                {loan.observacoes && (
                  <div className="border-t pt-3 text-sm">
                    <p className="text-xs text-muted-foreground">Observações</p>
                    <p className="mt-0.5 whitespace-pre-wrap">{loan.observacoes}</p>
                  </div>
                )}
              </TabsContent>

              {/* ── Aba 2: Parcelas ── */}
              <TabsContent value="parcelas" className="mt-0">
                <div className="tabela-rolavel rounded-lg border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/40 border-b">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Vcto</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Valor</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pago</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Saldo</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Encargos</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loan.installments.map((inst) => {
                        const ist = STATUS_INSTALLMENT[inst.status] ?? { label: inst.status, variant: 'outline' as const }
                        const encargos = toNumber(inst.multaAplicada) + toNumber(inst.moraAcumulada)
                        const emAberto = inst.status !== 'pago' && inst.status !== 'cancelado'
                        const hojeD = new Date(); hojeD.setHours(0, 0, 0, 0)
                        const vencD = new Date(inst.dataVencimento); vencD.setHours(0, 0, 0, 0)
                        const vencida = emAberto && vencD < hojeD
                        const venceHoje = emAberto && vencD.getTime() === hojeD.getTime()
                        return (
                          <tr key={inst.id} className="border-b hover:bg-muted/20">
                            <td className="px-3 py-2 text-muted-foreground">{inst.numero}</td>
                            <td className={`px-3 py-2 font-medium ${vencida ? 'text-destructive' : venceHoje ? 'text-amber-600' : ''}`}>{formatDateLocal(inst.dataVencimento)}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatCurrency(inst.installmentAmount)}</td>
                            <td className={`px-3 py-2 text-right ${toNumber(inst.totalPago) > 0 ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                              {formatCurrency(inst.totalPago)}
                            </td>
                            <td className={`px-3 py-2 text-right ${toNumber(inst.saldoDevedor) > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                              {formatCurrency(toNumber(inst.saldoDevedor) + encargos)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {encargos > 0
                                ? <span className="text-orange-600">{formatCurrency(encargos)}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge variant={ist.variant} className="text-xs">{ist.label}</Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/40 font-medium">
                        <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">Totais</td>
                        <td className="px-3 py-2 text-right text-xs text-green-600">{formatCurrency(totalPago)}</td>
                        <td className="px-3 py-2 text-right text-xs text-red-600">
                          {formatCurrency(saldoComEncargos)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-orange-600">
                          {formatCurrency(
                            loan.installments.reduce(
                              (s, i) => s + toNumber(i.multaAplicada) + toNumber(i.moraAcumulada),
                              0,
                            ),
                          )}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </TabsContent>

              {/* ── Aba 3: Comunicações ── */}
              <TabsContent value="comunicacoes" className="mt-0">
                {loan.notifications.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <MessageSquare className="size-8 mb-2 opacity-40" />
                    <p className="text-sm">Nenhuma comunicação registrada.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {loan.notifications.map((n) => (
                      <div key={n.id} className="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm">
                        <span className="text-base mt-0.5">
                          {n.canal === 'whatsapp' ? '📱' : n.canal === 'email' ? '📧' : '🔔'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-xs">
                              {n.canal === 'whatsapp' ? 'WhatsApp' : n.canal === 'email' ? 'Email' : 'Sistema'}
                            </span>
                            {n.assunto && (
                              <span className="text-xs text-muted-foreground truncate">{n.assunto}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge
                              variant={n.status === 'enviado' ? 'success' : n.status === 'erro' ? 'destructive' : 'outline'}
                              className="text-xs capitalize"
                            >
                              {n.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTimeLocal(n.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ── Aba 4: PIX e Boletos ── */}
              <TabsContent value="pix" className="mt-0 space-y-3">
                {allPix.length === 0 && allMp.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <QrCode className="size-8 mb-2 opacity-40" />
                    <p className="text-sm">Nenhum PIX ou cobrança gerada.</p>
                  </div>
                ) : (
                  <>
                    {allPix.map((p) => (
                      <div key={p.id} className="rounded-lg border p-3 text-sm space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            PIX · Parcela {p.parcelaNumero}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{formatCurrency(p.amount)}</span>
                            <Badge variant={p.status === 'paid' ? 'success' : p.status === 'expired' ? 'destructive' : 'outline'} className="text-xs">
                              {p.status === 'paid' ? '✅ Pago' : p.status === 'expired' ? 'Expirado' : 'Pendente'}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Gerado em {formatDateTimeLocal(p.createdAt)}
                          {p.paidAt && ` · Pago em ${formatDateTimeLocal(p.paidAt)}`}
                        </p>
                        {p.pixCopiaECola && (
                          <div className="flex items-center gap-2 bg-muted/40 rounded p-2">
                            <code className="text-xs flex-1 truncate">{p.pixCopiaECola.slice(0, 40)}…</code>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => {
                                navigator.clipboard.writeText(p.pixCopiaECola!)
                                toast.success('Código PIX copiado!')
                              }}
                            >
                              Copiar
                            </Button>
                          </div>
                        )}
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {p.whatsappEnviadoEm && <span>📱 WhatsApp {formatDateLocal(p.whatsappEnviadoEm)}</span>}
                          {p.emailEnviadoEm && <span>📧 Email {formatDateLocal(p.emailEnviadoEm)}</span>}
                        </div>
                      </div>
                    ))}
                    {allMp.map((p) => (
                      <div key={`mp-${p.id}`} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Mercado Pago · Parcela {p.parcelaNumero}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{formatCurrency(p.valor)}</span>
                            <Badge variant="outline" className="text-xs">{p.status}</Badge>
                          </div>
                        </div>
                        {p.paymentId && (
                          <p className="text-xs text-muted-foreground mt-1">ID: {p.paymentId}</p>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </TabsContent>

              {/* ── Aba 5: Renegociações ── */}
              <TabsContent value="renegociacoes" className="mt-0 space-y-3">
                {loan.renegociacoes.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <FileText className="size-8 mb-2 opacity-40" />
                    <p className="text-sm">Nenhuma renegociação registrada.</p>
                    <Link href={`/renegociacoes/nova?loanId=${loan.id}`} onClick={onClose}>
                      <Button variant="outline" size="sm" className="mt-3 gap-1">
                        <Plus className="size-3.5" />Nova renegociação
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    {loan.renegociacoes.map((r) => (
                      <div key={r.id} className="rounded-lg border p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Renegociação</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateLocal(r.createdAt)}
                          </span>
                        </div>
                        {r.novoValorTotal && (
                          <p>Novo total: <span className="font-bold">{formatCurrency(r.novoValorTotal)}</span></p>
                        )}
                        {r.novasNumeroParcelas && (
                          <p className="text-muted-foreground">{r.novasNumeroParcelas} parcelas</p>
                        )}
                        {r.observacoes && (
                          <p className="text-xs text-muted-foreground italic">{r.observacoes}</p>
                        )}
                      </div>
                    ))}
                    <Link href={`/renegociacoes/nova?loanId=${loan.id}`} onClick={onClose}>
                      <Button variant="outline" size="sm" className="w-full gap-1">
                        <Plus className="size-3.5" />Nova renegociação
                      </Button>
                    </Link>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EmprestimosPage() {
  const { user } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState('')
  const [inicioDe, setInicioDe] = useState('')
  const [inicioAte, setInicioAte] = useState('')
  const [page, setPage] = useState(1)
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const qc = useQueryClient()

  const search = useDebounce(searchInput, 400)

  useEffect(() => { setPage(1) }, [search, status, inicioDe, inicioAte])

  const { data: stats } = useQuery({
    queryKey: ['loans-stats'],
    queryFn: () => api.get<LoanStats>('/loans/stats').then((r) => r.data),
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['loans', { search, status, inicioDe, inicioAte, page }],
    queryFn: () =>
      api.get<LoansResponse>('/loans', {
        params: {
          search: search || undefined,
          status: status || undefined,
          inicioDe: inicioDe || undefined,
          inicioAte: inicioAte || undefined,
          page,
          limit: 20,
        },
      }).then((r) => r.data),
  })

  const [baixando, setBaixando] = useState(false)

  const baixarExcel = async () => {
    // A planilha sai com os mesmos filtros da tela: exportar a carteira inteira
    // depois de filtrar um periodo so gera conferencia manual do outro lado.
    setBaixando(true)
    try {
      const res = await api.get('/export/contratos/excel', {
        params: {
          search: search || undefined,
          status: status || undefined,
          inicioDe: inicioDe || undefined,
          inicioAte: inicioAte || undefined,
        },
        responseType: 'blob',
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(
        new Blob([res.data as BlobPart], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      )
      a.download = `contratos-${hojeISODate()}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      toast.error('Nao foi possivel gerar a planilha. Tente novamente.')
    } finally {
      setBaixando(false)
    }
  }

  const cancelMut = useMutation({
    mutationFn: (id: number) => api.patch(`/loans/${id}/cancel`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['loans'] })
      qc.invalidateQueries({ queryKey: ['loans-stats'] })
      toast.success(`Contrato #${id} cancelado com sucesso`)
    },
    onError: () => toast.error('Não foi possível cancelar o contrato. Tente novamente.'),
  })

  function handleCancel(id: number) {
    if (confirm(`Cancelar o contrato #${id}? Esta ação não pode ser desfeita.`)) {
      cancelMut.mutate(id)
    }
  }

  function openSheet(id: number) {
    setSelectedLoanId(id)
    setSheetOpen(true)
  }

  const totalPaginaAtual = data?.data.reduce((s, l) => s + toNumber(l.principalAmount), 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Empréstimos</h1>
          <p className="text-muted-foreground text-sm mt-1">Contratos e parcelas</p>
        </div>
        <Link href="/emprestimos/novo">
          <Button className="gap-2"><Plus className="size-4" />Novo contrato</Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats ? (
          <>
            <KpiCard
              label="Em carteira"
              value={formatCurrency(stats.valorEmCarteira)}
              sub="Total em aberto"
              icon={TrendingUp}
              color="text-blue-700"
            />
            <KpiCard
              label="Contratos ativos"
              value={stats.totalAtivos.toString()}
              icon={CheckCircle}
              color="text-green-600"
            />
            <KpiCard
              label="Quitados"
              value={stats.totalQuitados.toString()}
              icon={Clock}
              color="text-muted-foreground"
            />
            <KpiCard
              label="Recebido no mês"
              value={formatCurrency(stats.valorRecebidoMes)}
              icon={DollarSign}
              color="text-emerald-600"
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4"><Skeleton className="h-10 w-full" /></CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Filtros e tabela */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente ou CPF..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-52"
            >
              <option value="">Todos os status</option>
              <option value="aguardando_aceite">Aguardando aceite</option>
              <option value="aguardando_liberacao">Aguardando liberação</option>
              <option value="ativo">Ativo</option>
              <option value="inadimplente">Inadimplente</option>
              <option value="quitado">Quitado</option>
              <option value="cancelado">Cancelado</option>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={baixarExcel}
              disabled={baixando}
              className="gap-2"
            >
              <FileDown className="size-3.5" />{baixando ? 'Gerando...' : 'Excel'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="size-3.5" />Atualizar
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 mt-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="inicio-de">Início do contrato — de</label>
              <Input
                id="inicio-de"
                type="date"
                value={inicioDe}
                onChange={(e) => setInicioDe(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="inicio-ate">até</label>
              <Input
                id="inicio-ate"
                type="date"
                value={inicioAte}
                onChange={(e) => setInicioAte(e.target.value)}
                className="w-44"
              />
            </div>
            {(inicioDe || inicioAte) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setInicioDe(''); setInicioAte('') }}
                className="gap-2"
              >
                <X className="size-3.5" />Limpar período
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-muted-foreground">
              <AlertTriangle className="size-8 mx-auto mb-3 opacity-40" />
              <p>Erro ao carregar empréstimos.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
                Tentar novamente
              </Button>
            </div>
          ) : !data?.data.length ? (
            <div className="p-8 text-center">
              <CreditCard className="size-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm font-medium">
                {searchInput || status
                  ? 'Nenhum resultado para o filtro aplicado.'
                  : 'Nenhum contrato cadastrado ainda.'}
              </p>
              {(searchInput || status) ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => { setSearchInput(''); setStatus('') }}
                >
                  Limpar filtros
                </Button>
              ) : (user?.role === 'admin' || user?.role === 'financeiro') ? (
                <Link href="/emprestimos/novo">
                  <Button size="sm" className="mt-3 gap-1"><Plus className="size-3.5" />Criar contrato</Button>
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="tabela-rolavel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell whitespace-nowrap">CPF</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground min-w-[240px]">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Consultor</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Capital</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Parcelas</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Vl. Parcela</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Início</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((loan) => {
                    const st = STATUS_LOAN[loan.status] ?? { label: loan.status, variant: 'outline' as const }
                    const vlParcela = loan.installmentAmount
                      ? toNumber(loan.installmentAmount)
                      : toNumber(loan.totalReceivable) / loan.numeroParcelas
                    return (
                      <tr
                        key={loan.id}
                        className="border-b border-border hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openSheet(loan.id)}
                            className="text-primary hover:underline font-mono text-xs"
                          >
                            #{loan.id}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                          {loan.client?.cpf
                            ? formatCPF(loan.client.cpf)
                            : <Badge variant="outline" className="text-xs font-normal">Não informado</Badge>}
                        </td>
                        <td className="px-4 py-3 font-medium">{loan.client?.nome ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                          {loan.consultor?.nome ? (
                            <span className="text-xs truncate max-w-[100px] block" title={loan.consultor.nome}>
                              {loan.consultor.nome}
                            </span>
                          ) : (
                            <span className="text-xs italic opacity-50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(loan.principalAmount)}
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground hidden lg:table-cell">
                          {loan.numeroParcelas}x
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                          {formatCurrency(vlParcela)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell">
                          {formatDateLocal(loan.dataInicio)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openSheet(loan.id)}
                              title="Ver detalhes"
                            >
                              <Eye className="size-3.5" />
                            </Button>
                            {loan.status !== 'cancelado' && (
                              <Link href={`/emprestimos/${loan.id}/editar`}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  title="Editar contrato"
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                              </Link>
                            )}
                            {loan.status === 'ativo' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleCancel(loan.id)}
                                disabled={cancelMut.isPending && cancelMut.variables === loan.id}
                                title="Cancelar contrato"
                              >
                                <XCircle className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Rodapé paginação */}
          {data && data.data.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  Exibindo {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} de {data.total} contrato{data.total !== 1 ? 's' : ''}
                  {status ? ` · ${STATUS_LOAN[status]?.label ?? status}` : ''}
                </p>
                <p className="text-sm font-medium">
                  Capital: {formatCurrency(totalPaginaAtual)}
                </p>
              </div>
              {data.lastPage > 1 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    ← Anterior
                  </Button>
                  <span className="flex items-center text-sm text-muted-foreground px-2">
                    {page} / {data.lastPage}
                  </span>
                  <Button variant="outline" size="sm" disabled={page === data.lastPage} onClick={() => setPage((p) => p + 1)}>
                    Próximo →
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sheet de detalhe */}
      <LoanDetailSheet
        loanId={selectedLoanId}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  )
}
