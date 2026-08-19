'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, XCircle, RefreshCcw, QrCode, DollarSign, FileDown, TrendingUp, Mail, Pencil, Percent, Plus, Undo2, CheckCircle, History, ChevronDown, ChevronRight, Tag } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatDate, formatDateLocal, STATUS_LOAN, STATUS_INSTALLMENT, METODO_PAGAMENTO, hojeISODate } from '@/lib/utils'
import { useAuth } from '@/contexts/auth.context'
import api from '@/lib/api'
import { ComboboxTexto } from '@/components/ui/combobox-texto'

interface Payment {
  id: number; valorPago: number; valorDevido?: number | null
  dataPagamento: string; metodoPagamento: string
  desconto: number; descontoTipo?: string | null; descontoMotivo?: string | null
  estornado: boolean; contaDestino?: string | null; observacao?: string | null
  split?: { capital: number; lucro: number; comissao: number; comissaoAdministrador?: number; lucroEmpresa: number; comissaoPercentual: number; comissaoAdministradorPercentual?: number } | null
}
interface Installment {
  id: number; numero: number; installmentAmount: number; dataVencimento: string
  status: string; totalPago: number; principalPayback: number; netGain: number
  saldoDevedor: number; moraAcumulada: number
  cobrancaEnviadaEm?: string | null
  cobrancaWhatsappOk: boolean; cobrancaEmailOk: boolean; cobrancaPortalOk: boolean
  multaAplicada: number; valorComEncargos?: number | null
  payments?: Payment[]
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
  comissaoAdministradorPercentual?: number | null
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
  const [dataPagamento, setDataPagamento] = useState(hojeISODate())
  const [contaDestino, setContaDestino] = useState('')
  const [descPago, setDescPago] = useState('')
  const [descTipo, setDescTipo] = useState<'saldo' | 'encargos'>('saldo')
  const [descMotivo, setDescMotivo] = useState('')
  const [comissaoRecebimento, setComissaoRecebimento] = useState('')
  const [comissaoAdminRecebimento, setComissaoAdminRecebimento] = useState('')
  const [activeTab, setActiveTab] = useState<'parcelas' | 'cobrancas'>('parcelas')

  

  // Contas/bancos ja usados — sugestoes dos campos "Bco Recebedor"

  const { data: contasUsadas } = useQuery<string[]>({

    queryKey: ['payments-contas'],

    queryFn: () => api.get<string[]>('/payments/contas').then((r) => r.data),

    staleTime: 60_000,

  })
  const [expandedPayments, setExpandedPayments] = useState<Set<number>>(new Set())
  const togglePayments = (id: number) => setExpandedPayments(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const [showComForm, setShowComForm] = useState(false)
  const [comValor, setComValor] = useState('')
  const [comData, setComData] = useState(hojeISODate())
  const [comObs, setComObs] = useState('')
  const [showQuitar, setShowQuitar] = useState(false)
  const [qData, setQData] = useState(hojeISODate())
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
    mutationFn: (data: { installmentId: number; valorPago: number; metodoPagamento: string; dataPagamento: string; contaDestino?: string; desconto?: number; descontoTipo?: string; descontoMotivo?: string; comissaoPercentual?: number; comissaoAdministradorPercentual?: number }) =>
      api.post('/payments', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans', id] })
      setPayInstallmentId(null)
      setValorPago('')
      setContaDestino('')
      setDescPago(''); setDescMotivo('')
      setComissaoRecebimento(''); setComissaoAdminRecebimento('')
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
    // Pré-preenche com o total para quitar (saldo + encargos: multa + mora),
    // idêntico ao exibido em /parcelas e no recibo de pagamento.
    const totalParaQuitar =
      Number(inst.saldoDevedor) + Number(inst.moraAcumulada) + Number(inst.multaAplicada)
    setValorPago(totalParaQuitar.toFixed(2))
    setDescPago(''); setDescMotivo(''); setDescTipo('saldo')
    setComissaoRecebimento(loan?.comissaoPercentual != null ? String(Number(loan.comissaoPercentual)) : '')
    setComissaoAdminRecebimento(loan?.comissaoAdministradorPercentual != null ? String(Number(loan.comissaoAdministradorPercentual)) : '')
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
      comissaoPercentual: user?.role === 'admin' && comissaoRecebimento !== '' ? Number(comissaoRecebimento) : undefined,
      comissaoAdministradorPercentual: user?.role === 'admin' && comissaoAdminRecebimento !== '' ? Number(comissaoAdminRecebimento) : undefined,
    })
  }

  if (isLoading) return (
    <div className="space-y-4 w-full">
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
  // Pendente = total a cobrar AGORA (saldo + encargos) das parcelas em aberto,
  // coerente com a coluna "Saldo" da mesma tela e com /parcelas.
  const pendente = loan.installments
    .filter((i) => i.status !== 'pago' && i.status !== 'cancelado')
    .reduce((s, i) => s + Number(i.valorComEncargos ?? Math.max(0, Number(i.installmentAmount) - Number(i.totalPago))), 0)
  const margemPct = Number(loan.principalAmount) > 0
    ? ((Number(loan.targetProfit) / Number(loan.principalAmount)) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Empréstimo #{loan.id}</h1>
            <Badge variant={st.variant} className="text-sm px-2 py-0.5">{st.label}</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            <Link href={`/clientes/${loan.client?.id}`} className="hover:underline">{loan.client?.nome}</Link>
            {' · '}Início em {formatDateLocal(loan.dataInicio)}
            {loan.consultor?.nome ? <span className="text-muted-foreground/60"> · Cons: {loan.consultor.nome}</span> : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1 shadow-sm" onClick={baixarContrato}>
            <FileDown className="size-3.5" />PDF
          </Button>
          {loan.status !== 'cancelado' && (
            <Link href={`/emprestimos/${loan.id}/editar`}>
              <Button size="sm" variant="outline" className="gap-1 shadow-sm"><Pencil className="size-3.5" />Editar</Button>
            </Link>
          )}
          {loan.status === 'aguardando_aceite' && (
            <Button size="sm" variant="outline" className="gap-1 shadow-sm"
              onClick={() => { if (confirm('Reenviar link de aceite para o cliente?')) reenviarAceiteMut.mutate() }}
              disabled={reenviarAceiteMut.isPending}>
              <Mail className="size-3.5" />{reenviarAceiteMut.isPending ? 'Enviando...' : 'Reenviar Aceite'}
            </Button>
          )}
          {(loan.status === 'ativo' || loan.status === 'inadimplente') && (
            <>
              <Link href={`/renegociacoes/nova?loanId=${loan.id}`}>
                <Button size="sm" variant="outline" className="gap-1 shadow-sm"><RefreshCcw className="size-3.5" />Renegociar</Button>
              </Link>
              <Button size="sm" variant="outline" className="gap-1 text-green-700 dark:text-green-400 border-green-300 shadow-sm"
                onClick={() => { setQPct(loan.descontoQuitacaoPercentual != null ? String(loan.descontoQuitacaoPercentual) : ''); setShowQuitar(v => !v) }}>
                <CheckCircle className="size-3.5" />Quitar contrato
              </Button>
              <Button size="sm" variant="destructive" className="gap-1 shadow-sm"
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
                <div className="space-y-1.5"><Label>Bco Recebedor</Label><ComboboxTexto value={qConta} onChange={setQConta} opcoes={contasUsadas} placeholder="opcional" /></div>
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
            {(Number(loan.comissaoPercentual ?? 0) > 0 || Number(loan.comissaoAdministradorPercentual ?? 0) > 0) && (
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
                    {formatCurrency(Number(loan.targetProfit) * (1 - (Number(loan.comissaoPercentual ?? 0) + Number(loan.comissaoAdministradorPercentual ?? 0)) / 100))}
                  </p>
                  <p className="text-xs text-muted-foreground">Lucro Geral − comissão do consultor − comissão do administrador</p>
                </div>
                {Number(loan.comissaoAdministradorPercentual ?? 0) > 0 && (
                  <div>
                    <p className="text-muted-foreground">Comissão Administrador</p>
                    <p className="font-bold text-base text-violet-700 dark:text-violet-400">
                      {Number(loan.comissaoAdministradorPercentual).toFixed(2)}% · {formatCurrency(Number(loan.targetProfit) * Number(loan.comissaoAdministradorPercentual) / 100)}
                    </p>
                  </div>
                )}
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
                <div className="tabela-rolavel rounded-lg border">
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
          <CardContent className="p-0 tabela-rolavel">
            <table className="w-full text-sm min-w-[700px]">
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
                    <td className="px-4 py-2">{formatDateLocal(inst.dataVencimento)}</td>
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

        {activeTab === 'parcelas' && <CardContent className="p-0 tabela-rolavel">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vencimento</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total</th>
                {canSeeSplit && <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell">Capital</th>}
                {canSeeSplit && <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell">Lucro</th>}
                <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Pago</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Saldo</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell">Encargos</th>
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
                const temHistorico = inst.payments && inst.payments.filter(p => !p.estornado).length > 0
                return (
                  <tr key={inst.id} className={`border-b border-border hover:bg-muted/20 ${isParcial ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}>
                    <td className="px-4 py-2 text-muted-foreground">{inst.numero}</td>
                    <td className={`px-4 py-2 font-medium ${vencida ? 'text-destructive' : venceHoje ? 'text-amber-600' : ''}`}>{formatDateLocal(inst.dataVencimento)}</td>
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
                      {Number(inst.saldoDevedor) > 0 ? (
                        <>
                          <span className="text-red-600 font-medium">
                            {formatCurrency(Number(inst.valorComEncargos ?? inst.saldoDevedor))}
                          </span>
                          {(Number(inst.moraAcumulada) + Number(inst.multaAplicada)) > 0 && (
                            <span className="block text-[10px] text-muted-foreground font-normal">
                              base {formatCurrency(Number(inst.saldoDevedor))}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right hidden lg:table-cell">
                      {(Number(inst.moraAcumulada) + Number(inst.multaAplicada)) > 0
                        ? <span className="text-orange-600 text-xs">{formatCurrency(Number(inst.moraAcumulada) + Number(inst.multaAplicada))}</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2 text-center"><Badge variant={ist.variant}>{ist.label}</Badge></td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1 whitespace-nowrap">
                        {/* Botão histórico de pagamentos */}
                        {temHistorico && (
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 gap-1 text-xs text-muted-foreground hover:text-blue-600"
                            onClick={() => togglePayments(inst.id)}
                            title="Ver histórico de baixas"
                          >
                            <History className="size-3" />
                            {expandedPayments.has(inst.id) ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                          </Button>
                        )}
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
              {/* Sub-linhas: histórico de pagamentos por parcela */}
              {loan.installments.map((inst) => {
                if (!expandedPayments.has(inst.id)) return null
                const pagamentos = inst.payments?.filter(p => !p.estornado) ?? []
                if (pagamentos.length === 0) return null
                const colSpan = 7 + (canSeeSplit ? 2 : 0)
                return (
                  <tr key={`hist-${inst.id}`} className="bg-blue-50/60 dark:bg-blue-950/20 border-b border-border">
                    <td colSpan={colSpan} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <History className="size-3.5 text-blue-600" />
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                          Histórico de baixas — Parcela #{inst.numero}
                        </span>
                      </div>
                      <div className="tabela-rolavel rounded border border-blue-200 dark:border-blue-900">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-blue-100/60 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-900">
                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Data</th>
                              <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Valor Devido c/ Juros</th>
                              <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Valor Pago</th>
                              <th className="text-right px-3 py-1.5 font-medium text-orange-600">Desconto Dado</th>
                              <th className="text-right px-3 py-1.5 font-medium text-blue-700 dark:text-blue-400">Capital</th>
                              <th className="text-right px-3 py-1.5 font-medium text-emerald-700 dark:text-emerald-400">Lucro</th>
                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground hidden md:table-cell">Método</th>
                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground hidden md:table-cell">Bco Recebedor</th>
                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground hidden lg:table-cell">Motivo desconto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagamentos.map((p) => {
                              const temDesconto = Number(p.desconto) > 0
                              const valorDevido = p.valorDevido != null ? Number(p.valorDevido) : Number(inst.installmentAmount)
                              return (
                                <tr key={p.id} className="border-b border-blue-100 dark:border-blue-900/50 last:border-0 hover:bg-blue-50 dark:hover:bg-blue-950/30">
                                  <td className="px-3 py-2 text-muted-foreground">{formatDate(p.dataPagamento)}</td>
                                  <td className="px-3 py-2 text-right font-medium">
                                    {formatCurrency(valorDevido)}
                                  </td>
                                  <td className="px-3 py-2 text-right text-green-700 dark:text-green-400 font-semibold">
                                    {formatCurrency(Number(p.valorPago))}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {temDesconto ? (
                                      <span className="inline-flex items-center gap-1 text-orange-600 font-semibold">
                                        <Tag className="size-3" />
                                        {formatCurrency(Number(p.desconto))}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right text-blue-700 dark:text-blue-400" title="Parte desta baixa que repõe o capital emprestado">
                                    {p.split ? formatCurrency(p.split.capital) : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400" title={p.split?.comissaoPercentual ? `Comissão do consultor: ${formatCurrency(p.split.comissao)} (${p.split.comissaoPercentual}%)` : 'Lucro realizado nesta baixa'}>
                                    {p.split ? formatCurrency(p.split.lucro) : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell capitalize">
                                    {METODO_PAGAMENTO[p.metodoPagamento] ?? p.metodoPagamento}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                                    {p.contaDestino || '—'}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">
                                    {p.descontoMotivo || (temDesconto ? (p.descontoTipo === 'encargos' ? 'Desconto em encargos' : 'Desconto no saldo') : '—')}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          {pagamentos.length > 1 && (
                            <tfoot>
                              <tr className="bg-blue-100/60 dark:bg-blue-900/30 font-medium">
                                <td className="px-3 py-1.5 text-xs text-muted-foreground">{pagamentos.length} baixa(s)</td>
                                <td className="px-3 py-1.5 text-right text-xs">—</td>
                                <td className="px-3 py-1.5 text-right text-xs text-green-700">
                                  {formatCurrency(pagamentos.reduce((s, p) => s + Number(p.valorPago), 0))}
                                </td>
                                <td className="px-3 py-1.5 text-right text-xs text-orange-600">
                                  {formatCurrency(pagamentos.reduce((s, p) => s + Number(p.desconto), 0))}
                                </td>
                                <td className="px-3 py-1.5 text-right text-xs text-blue-700 dark:text-blue-400">
                                  {formatCurrency(pagamentos.reduce((s, p) => s + Number(p.split?.capital ?? 0), 0))}
                                </td>
                                <td className="px-3 py-1.5 text-right text-xs text-emerald-700 dark:text-emerald-400">
                                  {formatCurrency(pagamentos.reduce((s, p) => s + Number(p.split?.lucro ?? 0), 0))}
                                </td>
                                <td className="hidden md:table-cell" />
                                <td className="hidden md:table-cell" />
                                <td className="hidden lg:table-cell" />
                              </tr>
                            </tfoot>
                          )}
                        </table>
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
                  {Number(instSelecionada.multaAplicada) > 0 && (
                    <span>Multa: <strong>{formatCurrency(Number(instSelecionada.multaAplicada))}</strong></span>
                  )}
                  {Number(instSelecionada.moraAcumulada) > 0 && (
                    <span>Mora: <strong>{formatCurrency(Number(instSelecionada.moraAcumulada))}</strong></span>
                  )}
                </div>
              )}
              {payMut.isError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {(payMut.error as any)?.response?.data?.message
                    ?? 'Erro ao registrar pagamento. Verifique os dados e tente novamente.'}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Valor Pago (R$)</Label>
                  <Input type="number" step="0.01" min="0.01" value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
                  {instSelecionada && Number(instSelecionada.saldoDevedor) > 0 && (
                    <p className="text-[10px] text-muted-foreground">Pré-preenchido com saldo + encargos (multa + mora) para quitação total</p>
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
                  <Label>Bco Recebedor</Label>
                  <ComboboxTexto value={contaDestino} onChange={setContaDestino} opcoes={contasUsadas} placeholder="ex: Itaú PJ, dinheiro em caixa" />
                </div>

                {user?.role === 'admin' && (
                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50/60 dark:bg-violet-950/20 p-3">
                    <div className="space-y-1.5">
                      <Label>Comissão do Consultor (% do Lucro Geral)</Label>
                      <Input type="number" step="0.01" min="0" max="100" value={comissaoRecebimento} onChange={(e) => setComissaoRecebimento(e.target.value)} placeholder="Usa o padrão do contrato" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Comissão do Administrador (% do Lucro Geral)</Label>
                      <Input type="number" step="0.01" min="0" max="100" value={comissaoAdminRecebimento} onChange={(e) => setComissaoAdminRecebimento(e.target.value)} placeholder="Usa o padrão do contrato" />
                    </div>
                    <p className="md:col-span-2 text-[10px] text-muted-foreground">Os percentuais ficam congelados neste recebimento e são calculados sobre o Lucro Geral (Valor − Capital).</p>
                  </div>
                )}

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
