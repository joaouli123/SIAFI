'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, XCircle, RefreshCcw, QrCode, DollarSign, FileDown, TrendingUp, Mail, Pencil, Percent, Plus, Undo2, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatDate, STATUS_LOAN, STATUS_INSTALLMENT, METODO_PAGAMENTO } from '@/lib/utils'
import { useAuth } from '@/contexts/auth.context'
import api from '@/lib/api'

interface Installment {
  id: number; numero: number; installmentAmount: number; dataVencimento: string
  status: string; totalPago: number; principalPayback: number; netGain: number
  saldoDevedor: number; moraAcumulada: number
  cobrancaEnviadaEm?: string | null
  cobrancaWhatsappOk: boolean; cobrancaEmailOk: boolean; cobrancaPortalOk: boolean
  multaAplicada: number; valorComEncargos?: number | null
}
interface ComissaoPagamento {
  id: number; valor: number; dataPagamento: string; observacao?: string | null
}
interface ComissaoResumo {
  percentual: number; prevista: number; realizada: number; paga: number; saldo: number
  status: 'sem_comissao' | 'nao_paga' | 'parcial' | 'paga'
}
interface Loan {
  id: number; principalAmount: number; targetProfit: number; totalReceivable: number
  taxaJuros: number | null; modoTaxa: string | null
  numeroParcelas: number; dataInicio: string; status: string
  observacoes?: string | null; metodoPagamento?: string | null
  comissaoPercentual?: number | null
  descontoQuitacaoPercentual?: number | null
  comissaoResumo?: ComissaoResumo
  comissaoPagamentos?: ComissaoPagamento[]
  client: { id: number; nome: string; cpf: string }
  installments: Installment[]
  consultor?: { id: number; nome: string } | null
}

export default function EmprestimoDetalhePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [payInstallmentId, setPayInstallmentId] = useState<number | null>(null)
  const [valorPago, setValorPago] = useState('')
  const [metodo, setMetodo] = useState('dinheiro')
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0])
  const [contaDestino, setContaDestino] = useState('')
  const [descPago, setDescPago] = useState('')
  const [descTipo, setDescTipo] = useState<'saldo' | 'encargos'>('saldo')
  const [descMotivo, setDescMotivo] = useState('')
  const [activeTab, setActiveTab] = useState<'parcelas' | 'cobrancas'>('parcelas')
  const [showComForm, setShowComForm] = useState(false)
  const [comValor, setComValor] = useState('')
  const [comData, setComData] = useState(new Date().toISOString().split('T')[0])
  const [comObs, setComObs] = useState('')
  const [showQuitar, setShowQuitar] = useState(false)
  const [qData, setQData] = useState(new Date().toISOString().split('T')[0])
  const [qMetodo, setQMetodo] = useState('dinheiro')
  const [qConta, setQConta] = useState('')
  const [qPct, setQPct] = useState('')

  const canSeeSplit = user?.role === 'admin' || user?.role === 'financeiro' || user?.role === 'consultor'
  const canPagarComissao = user?.role === 'admin' || user?.role === 'financeiro'

  const { data: loan, isLoading, isError } = useQuery({
    queryKey: ['loans', id],
    queryFn: () => api.get<Loan>(`/loans/${id}`).then((r) => r.data),
  })

  const cancelMut = useMutation({
    mutationFn: () => api.patch(`/loans/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loans', id] }),
  })

  const reenviarAceiteMut = useMutation({
    mutationFn: () => api.patch(`/loans/${id}/reenviar-aceite`),
    onSuccess: () => alert('Link de aceite reenviado com sucesso!'),
  })

  const payMut = useMutation({
    mutationFn: (data: { installmentId: number; valorPago: number; metodoPagamento: string; dataPagamento: string; contaDestino?: string; desconto?: number; descontoTipo?: string; descontoMotivo?: string }) =>
      api.post('/payments', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans', id] })
      setPayInstallmentId(null)
      setValorPago('')
      setContaDestino('')
      setDescPago(''); setDescMotivo('')
    },
  })

  const quitarMut = useMutation({
    mutationFn: (data: { dataPagamento: string; metodoPagamento: string; contaDestino?: string; descontoPercentual?: number }) =>
      api.post(`/payments/quitar/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans', id] }); setShowQuitar(false) },
  })

  const registrarComissaoMut = useMutation({
    mutationFn: (data: { valor: number; dataPagamento: string; observacao?: string }) =>
      api.post(`/loans/${id}/comissao`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans', id] })
      setShowComForm(false); setComValor(''); setComObs('')
    },
  })

  const estornarComissaoMut = useMutation({
    mutationFn: (pagamentoId: number) => api.delete(`/loans/${id}/comissao/${pagamentoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loans', id] }),
  })

  async function baixarContrato() {
    const res = await api.get(`/export/contratos/${id}/pdf`, { responseType: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }))
    a.download = `contrato-${id}.pdf`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function handlePay(inst: Installment) {
    setPayInstallmentId(inst.id)
    // Pré-preenche com saldo devedor + mora acumulada (total para quitar)
    const totalParaQuitar = Number(inst.saldoDevedor) + Number(inst.moraAcumulada)
    setValorPago(totalParaQuitar.toFixed(2))
    setDescPago(''); setDescMotivo(''); setDescTipo('saldo')
  }

  function submitPay() {
    if (!payInstallmentId || !valorPago) return
    const desc = Number(descPago) || 0
    payMut.mutate({
      installmentId: payInstallmentId,
      valorPago: Number(valorPago),
      metodoPagamento: metodo,
      dataPagamento,
      contaDestino: contaDestino.trim() || undefined,
      desconto: desc > 0 ? desc : undefined,
      descontoTipo: desc > 0 ? descTipo : undefined,
      descontoMotivo: desc > 0 ? (descMotivo.trim() || undefined) : undefined,
    })
  }

  if (isLoading) return (
    <div className="space-y-4 max-w-4xl">
      <Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /><Skeleton className="h-64 w-full" />
    </div>
  )
  if (isError || !loan) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Empréstimo não encontrado.</p>
      <Link href="/emprestimos"><Button variant="outline" className="mt-4">Voltar</Button></Link>
    </div>
  )

  const st = STATUS_LOAN[loan.status] ?? { label: loan.status, variant: 'outline' as const }
  const totalPago = loan.installments.reduce((s, i) => s + Number(i.totalPago), 0)
  const pendente = Number(loan.totalReceivable) - totalPago
  const margemPct = Number(loan.principalAmount) > 0
    ? ((Number(loan.targetProfit) / Number(loan.principalAmount)) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link href="/emprestimos"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="size-4" />Voltar</Button></Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Empréstimo #{loan.id}</h1>
            <p className="text-muted-foreground text-sm">
              <Link href={`/clientes/${loan.client?.id}`} className="hover:underline">{loan.client?.nome}</Link>
              {' · '}Início em {formatDate(loan.dataInicio)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={st.variant}>{st.label}</Badge>
          <Button size="sm" variant="outline" className="gap-1" onClick={baixarContrato}>
            <FileDown className="size-3.5" />PDF
          </Button>
          {loan.status !== 'cancelado' && (
            <Link href={`/emprestimos/${loan.id}/editar`}>
              <Button size="sm" variant="outline" className="gap-1"><Pencil className="size-3.5" />Editar</Button>
            </Link>
          )}
          {loan.status === 'aguardando_aceite' && (
            <Button size="sm" variant="outline" className="gap-1"
              onClick={() => { if (confirm('Reenviar link de aceite para o cliente?')) reenviarAceiteMut.mutate() }}
              disabled={reenviarAceiteMut.isPending}>
              <Mail className="size-3.5" />{reenviarAceiteMut.isPending ? 'Enviando...' : 'Reenviar Aceite'}
            </Button>
          )}
          {(loan.status === 'ativo' || loan.status === 'inadimplente') && (
            <>
              <Link href={`/renegociacoes/nova?loanId=${loan.id}`}>
                <Button size="sm" variant="outline" className="gap-1"><RefreshCcw className="size-3.5" />Renegociar</Button>
              </Link>
              <Button size="sm" variant="outline" className="gap-1 text-green-700 dark:text-green-400 border-green-300"
                onClick={() => { setQPct(loan.descontoQuitacaoPercentual != null ? String(loan.descontoQuitacaoPercentual) : ''); setShowQuitar(v => !v) }}>
                <CheckCircle className="size-3.5" />Quitar contrato
              </Button>
              <Button size="sm" variant="destructive" className="gap-1"
                onClick={() => { if (confirm('Cancelar empréstimo?')) cancelMut.mutate() }}
                disabled={cancelMut.isPending}>
                <XCircle className="size-3.5" />Cancelar
              </Button>
            </>
          )}
        </div>
      </div>

      {showQuitar && (loan.status === 'ativo' || loan.status === 'inadimplente') && (() => {
        const pct = Number(qPct) || 0
        const abertas = loan.installments.filter(i => i.status !== 'pago' && i.status !== 'cancelado')
        const saldoPend = abertas.reduce((s, i) => s + Math.max(0, Number(i.installmentAmount) - Number(i.totalPago)), 0)
        const descEst = abertas.reduce((s, i) => {
          const lucroReal = Math.max(0, Number(i.totalPago) - Number(i.principalPayback))
          const remLucro = Math.max(0, Number(i.netGain) - lucroReal)
          return s + Math.min(Math.max(0, Number(i.installmentAmount) - Number(i.totalPago)), remLucro * pct / 100)
        }, 0)
        const aReceber = saldoPend - descEst
        return (
          <Card className="border-green-300 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400"><CheckCircle className="size-4" />Quitar contrato com desconto</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Saldo pendente</p><p className="font-bold">{formatCurrency(saldoPend)}</p></div>
                <div><p className="text-xs text-muted-foreground">Desconto estimado</p><p className="font-bold text-orange-600">{formatCurrency(descEst)}</p></div>
                <div><p className="text-xs text-muted-foreground">A receber para quitar</p><p className="font-bold text-green-700 dark:text-green-400">{formatCurrency(aReceber)}</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1.5"><Label>% Desconto (sobre lucro)</Label><Input type="number" step="0.01" min="0" max="100" value={qPct} onChange={(e) => setQPct(e.target.value)} placeholder="0" /></div>
                <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={qData} onChange={(e) => setQData(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Método</Label><Select value={qMetodo} onChange={(e) => setQMetodo(e.target.value)}>{Object.entries(METODO_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
                <div className="space-y-1.5"><Label>Conta / Detalhes</Label><Input value={qConta} onChange={(e) => setQConta(e.target.value)} placeholder="opcional" /></div>
              </div>
              <div className="flex gap-2">
                <Button className="bg-green-600 hover:bg-green-700 gap-2" disabled={quitarMut.isPending}
                  onClick={() => { if (confirm(`Quitar o contrato dando baixa em ${abertas.length} parcela(s) com desconto de ${formatCurrency(descEst)}?`)) quitarMut.mutate({ dataPagamento: qData, metodoPagamento: qMetodo, contaDestino: qConta.trim() || undefined, descontoPercentual: qPct !== '' ? pct : undefined }) }}>
                  <CheckCircle className="size-4" />{quitarMut.isPending ? 'Quitando...' : 'Confirmar quitação'}
                </Button>
                <Button variant="outline" onClick={() => setShowQuitar(false)}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Capital Emprestado', value: formatCurrency(Number(loan.principalAmount)), color: 'text-foreground' },
          { label: 'Total a Receber', value: formatCurrency(Number(loan.totalReceivable)), color: 'text-blue-700 dark:text-blue-400' },
          { label: 'Total Pago', value: formatCurrency(totalPago), color: 'text-green-600' },
          { label: 'Pendente', value: formatCurrency(Math.max(0, pendente)), color: pendente > 0 ? 'text-red-600' : 'text-green-600' },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
              <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Informações do Contrato</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Parcelas</p>
            <p className="font-medium">{loan.numeroParcelas}x de {formatCurrency(Number(loan.totalReceivable) / loan.numeroParcelas)}</p>
          </div>
          <div><p className="text-muted-foreground">Data de Início</p><p className="font-medium">{formatDate(loan.dataInicio)}</p></div>
          {loan.metodoPagamento && (
            <div>
              <p className="text-muted-foreground">Pagamento</p>
              <p className="font-medium">{METODO_PAGAMENTO[loan.metodoPagamento] ?? loan.metodoPagamento}</p>
            </div>
          )}
          <div><p className="text-muted-foreground">Status</p><Badge variant={st.variant}>{st.label}</Badge></div>
          {loan.observacoes && (
            <div className="col-span-full">
              <p className="text-muted-foreground">Observações</p>
              <p className="font-medium">{loan.observacoes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {canSeeSplit && (
        <Card className="border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
              <TrendingUp className="size-4" />Split do Contrato
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Capital Emprestado</p>
              <p className="font-bold text-base">{formatCurrency(Number(loan.principalAmount))}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Lucro Alvo</p>
              <p className="font-bold text-base text-orange-600">{formatCurrency(Number(loan.targetProfit))}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total a Receber</p>
              <p className="font-bold text-base text-blue-700 dark:text-blue-400">{formatCurrency(Number(loan.totalReceivable))}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Margem sobre Capital</p>
              <p className="font-bold text-base text-indigo-700 dark:text-indigo-400">{margemPct}%</p>
            </div>
            {loan.consultor && (
              <div>
                <p className="text-muted-foreground">Consultor</p>
                <p className="font-medium">{loan.consultor.nome}</p>
              </div>
            )}
            {Number(loan.comissaoPercentual ?? 0) > 0 && (
              <>
                <div>
                  <p className="text-muted-foreground">Comissão Consultor</p>
                  <p className="font-bold text-base text-emerald-700 dark:text-emerald-400">
                    {Number(loan.comissaoPercentual).toFixed(2)}% · {formatCurrency(Number(loan.targetProfit) * Number(loan.comissaoPercentual) / 100)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Lucro da Empresa</p>
                  <p className="font-bold text-base text-blue-700 dark:text-blue-400">
                    {formatCurrency(Number(loan.targetProfit) * (1 - Number(loan.comissaoPercentual) / 100))}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {canSeeSplit && loan.comissaoResumo && loan.comissaoResumo.percentual > 0 && (() => {
        const rc = loan.comissaoResumo!
        const pct = rc.percentual
        const statusMap: Record<string, { label: string; variant: 'success' | 'outline' | 'destructive' }> = {
          paga: { label: 'Comissão paga', variant: 'success' },
          parcial: { label: 'Parcialmente paga', variant: 'outline' },
          nao_paga: { label: 'A pagar', variant: 'destructive' },
          sem_comissao: { label: '—', variant: 'outline' },
        }
        const stCom = statusMap[rc.status] ?? statusMap.nao_paga
        const quitadas = loan.installments.filter((i) => Number(i.totalPago) > 0)
        return (
          <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900">
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <Percent className="size-4" />Comissão do Consultor
                {loan.consultor && <span className="text-xs font-normal text-muted-foreground">· {loan.consultor.nome}</span>}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={stCom.variant}>{stCom.label}</Badge>
                {canPagarComissao && rc.saldo > 0.005 && (
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setComValor(rc.saldo.toFixed(2)); setShowComForm((v) => !v) }}>
                    <Plus className="size-3" />Registrar pagamento
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Resumo */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Prevista ({pct.toFixed(2)}%)</p><p className="font-bold">{formatCurrency(rc.prevista)}</p></div>
                <div><p className="text-xs text-muted-foreground">Realizada (recebido)</p><p className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(rc.realizada)}</p></div>
                <div><p className="text-xs text-muted-foreground">Paga ao consultor</p><p className="font-bold">{formatCurrency(rc.paga)}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground">{rc.saldo >= 0 ? 'Saldo a pagar' : 'Pago a mais'}</p>
                  <p className={`font-bold ${rc.saldo > 0.005 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(Math.abs(rc.saldo))}</p>
                </div>
              </div>

              {/* Form de registro */}
              {showComForm && canPagarComissao && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 p-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label>Valor (R$)</Label>
                    <Input type="number" step="0.01" min="0.01" value={comValor} onChange={(e) => setComValor(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data</Label>
                    <Input type="date" value={comData} onChange={(e) => setComData(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Observação</Label>
                    <Input value={comObs} onChange={(e) => setComObs(e.target.value)} placeholder="opcional" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                      disabled={registrarComissaoMut.isPending || !comValor}
                      onClick={() => registrarComissaoMut.mutate({ valor: Number(comValor), dataPagamento: comData, observacao: comObs.trim() || undefined })}
                    >
                      <DollarSign className="size-3.5" />{registrarComissaoMut.isPending ? '...' : 'Confirmar'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowComForm(false)}>Cancelar</Button>
                  </div>
                </div>
              )}

              {/* Tabela: parcelas quitadas e parte do consultor */}
              {quitadas.length > 0 && (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Parcela</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pago</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Capital reposto</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Lucro</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Comissão consultor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quitadas.map((i) => {
                        const pago = Number(i.totalPago)
                        const cap = Math.min(pago, Number(i.principalPayback))
                        const luc = Math.max(0, pago - Number(i.principalPayback))
                        const com = luc * pct / 100
                        return (
                          <tr key={i.id} className="border-b hover:bg-muted/20">
                            <td className="px-3 py-2 text-muted-foreground">#{i.numero}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(pago)}</td>
                            <td className="px-3 py-2 text-right text-blue-700 dark:text-blue-400">{formatCurrency(cap)}</td>
                            <td className="px-3 py-2 text-right text-orange-600">{formatCurrency(luc)}</td>
                            <td className="px-3 py-2 text-right font-medium text-emerald-700 dark:text-emerald-400">{formatCurrency(com)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagamentos de comissão registrados */}
              {loan.comissaoPagamentos && loan.comissaoPagamentos.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Pagamentos ao consultor</p>
                  <div className="space-y-1.5">
                    {loan.comissaoPagamentos.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <div>
                          <span className="font-medium">{formatCurrency(Number(c.valor))}</span>
                          <span className="text-xs text-muted-foreground"> · {formatDate(c.dataPagamento)}</span>
                          {c.observacao && <span className="text-xs text-muted-foreground"> · {c.observacao}</span>}
                        </div>
                        {canPagarComissao && (
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                            disabled={estornarComissaoMut.isPending}
                            onClick={() => { if (confirm(`Estornar pagamento de comissão de ${formatCurrency(Number(c.valor))}?`)) estornarComissaoMut.mutate(c.id) }}
                          >
                            <Undo2 className="size-3" />Estornar
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      <Card>
        <CardHeader className="pb-0">
          <div className="flex gap-1 border-b border-border pb-0 -mb-px">
            {(['parcelas', 'cobrancas'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'parcelas' ? 'Parcelas' : 'Cobranças'}
              </button>
            ))}
          </div>
        </CardHeader>

        {activeTab === 'cobrancas' && (
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vencimento</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Enviada em</th>
                  <th className="text-center px-4 py-2 font-medium text-muted-foreground">WA</th>
                  <th className="text-center px-4 py-2 font-medium text-muted-foreground">Email</th>
                  <th className="text-center px-4 py-2 font-medium text-muted-foreground">Portal</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Multa</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Com encargos</th>
                </tr>
              </thead>
              <tbody>
                {loan.installments.map((inst) => (
                  <tr key={inst.id} className="border-b border-border hover:bg-muted/20">
                    <td className="px-4 py-2 text-muted-foreground">{inst.numero}</td>
                    <td className="px-4 py-2">{formatDate(inst.dataVencimento)}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {inst.cobrancaEnviadaEm ? formatDate(inst.cobrancaEnviadaEm) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2 text-center">{inst.cobrancaWhatsappOk ? '✅' : '—'}</td>
                    <td className="px-4 py-2 text-center">{inst.cobrancaEmailOk ? '✅' : '—'}</td>
                    <td className="px-4 py-2 text-center">{inst.cobrancaPortalOk ? '✅' : '—'}</td>
                    <td className="px-4 py-2 text-right">
                      {Number(inst.multaAplicada) > 0
                        ? <span className="text-orange-600">{formatCurrency(Number(inst.multaAplicada))}</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {inst.valorComEncargos
                        ? <span className="font-medium">{formatCurrency(Number(inst.valorComEncargos))}</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        )}

        {activeTab === 'parcelas' && <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vencimento</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total</th>
                {canSeeSplit && <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell">Capital</th>}
                {canSeeSplit && <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell">Lucro</th>}
                <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Pago</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Saldo</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell">Mora</th>
                <th className="text-center px-4 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Ação</th>
              </tr>
            </thead>
            <tbody>
              {loan.installments.map((inst) => {
                const ist = STATUS_INSTALLMENT[inst.status] ?? { label: inst.status, variant: 'outline' as const }
                const isParcial = inst.status === 'parcialmente_pago'
                const canPay = inst.status === 'pendente' || inst.status === 'atrasado' || isParcial
                const emAberto = inst.status !== 'pago' && inst.status !== 'cancelado'
                const hojeD = new Date(); hojeD.setHours(0, 0, 0, 0)
                const vencD = new Date(inst.dataVencimento); vencD.setHours(0, 0, 0, 0)
                const vencida = emAberto && vencD < hojeD
                const venceHoje = emAberto && vencD.getTime() === hojeD.getTime()
                return (
                  <tr key={inst.id} className={`border-b border-border hover:bg-muted/20 ${isParcial ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}>
                    <td className="px-4 py-2 text-muted-foreground">{inst.numero}</td>
                    <td className={`px-4 py-2 font-medium ${vencida ? 'text-destructive' : venceHoje ? 'text-amber-600' : ''}`}>{formatDate(inst.dataVencimento)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCurrency(Number(inst.installmentAmount))}</td>
                    {canSeeSplit && (
                      <td className="px-4 py-2 text-right text-blue-700 dark:text-blue-400 hidden lg:table-cell">
                        {formatCurrency(Number(inst.principalPayback))}
                      </td>
                    )}
                    {canSeeSplit && (
                      <td className="px-4 py-2 text-right text-orange-600 hidden lg:table-cell">
                        {formatCurrency(Number(inst.netGain))}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right text-green-600 hidden md:table-cell">
                      {Number(inst.totalPago) > 0 ? formatCurrency(Number(inst.totalPago)) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right hidden md:table-cell">
                      {Number(inst.saldoDevedor) > 0
                        ? <span className="text-red-600 font-medium">{formatCurrency(Number(inst.saldoDevedor))}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right hidden lg:table-cell">
                      {Number(inst.moraAcumulada) > 0
                        ? <span className="text-orange-600 text-xs">{formatCurrency(Number(inst.moraAcumulada))}</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2 text-center"><Badge variant={ist.variant}>{ist.label}</Badge></td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {canPay && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                              onClick={() => handlePay(inst)}>
                              <DollarSign className="size-3" />{isParcial ? 'Complementar' : 'Pagar'}
                            </Button>
                            {!isParcial && (
                              <Link href={`/pix?parcelaId=${inst.id}`}>
                                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
                                  <QrCode className="size-3" />PIX
                                </Button>
                              </Link>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>}
      </Card>

      {payInstallmentId && (() => {
        const instSelecionada = loan.installments.find(i => i.id === payInstallmentId)
        return (
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
            <CardHeader>
              <CardTitle className="text-base text-green-700 dark:text-green-400">
                Registrar Pagamento — Parcela #{instSelecionada?.numero}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {instSelecionada && instSelecionada.status === 'parcialmente_pago' && (
                <div className="rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex gap-4">
                  <span>Pago: <strong>{formatCurrency(Number(instSelecionada.totalPago))}</strong></span>
                  <span>Saldo: <strong>{formatCurrency(Number(instSelecionada.saldoDevedor))}</strong></span>
                  {Number(instSelecionada.moraAcumulada) > 0 && (
                    <span>Mora: <strong>{formatCurrency(Number(instSelecionada.moraAcumulada))}</strong></span>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Valor Pago (R$)</Label>
                  <Input type="number" step="0.01" min="0.01" value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
                  {instSelecionada && Number(instSelecionada.saldoDevedor) > 0 && (
                    <p className="text-[10px] text-muted-foreground">Pré-preenchido com saldo + mora para quitação total</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Data do Pagamento</Label>
                  <Input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Método de Pagamento</Label>
                  <Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                    {Object.entries(METODO_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Conta / Detalhes</Label>
                  <Input value={contaDestino} onChange={(e) => setContaDestino(e.target.value)} placeholder="ex: Itaú PJ, dinheiro em caixa" />
                </div>

                {/* Desconto (opcional) */}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border border-dashed border-amber-300 dark:border-amber-900 p-3">
                  <div className="space-y-1.5">
                    <Label>Desconto (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={descPago} onChange={(e) => setDescPago(e.target.value)} placeholder="0,00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select value={descTipo} onChange={(e) => setDescTipo(e.target.value as 'saldo' | 'encargos')}>
                      <option value="saldo">Sobre o saldo</option>
                      <option value="encargos">Sobre encargos</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Motivo</Label>
                    <Input value={descMotivo} onChange={(e) => setDescMotivo(e.target.value)} placeholder="ex: à vista" />
                  </div>
                  {Number(descPago) > 0 && (
                    <p className="md:col-span-3 text-[10px] text-muted-foreground">
                      {descTipo === 'saldo'
                        ? 'Abate o saldo da parcela (quita recebendo menos; reduz lucro e comissão).'
                        : 'Perdoa multa/mora; a parcela quita normalmente pelo valor.'}
                    </p>
                  )}
                </div>

                <div className="md:col-span-2 flex items-end gap-2">
                  <Button onClick={submitPay} disabled={payMut.isPending} className="gap-2 bg-green-600 hover:bg-green-700">
                    <DollarSign className="size-4" />{payMut.isPending ? 'Registrando...' : 'Confirmar Pagamento'}
                  </Button>
                  <Button variant="outline" onClick={() => setPayInstallmentId(null)}>Cancelar</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })()}
    </div>
  )
}
