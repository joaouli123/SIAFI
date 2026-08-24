'use client'

import { useState, useMemo, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Save, Search, User, CreditCard, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ComboboxTexto } from '@/components/ui/combobox-texto'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatCurrency, formatDate, formatCPF, METODO_PAGAMENTO, hojeISODate } from '@/lib/utils'
import api from '@/lib/api'

const schema = z.object({
  installmentId: z.coerce.number().min(1),
  valorPago:     z.coerce.number().min(0.01, 'Valor deve ser maior que zero'),
  dataPagamento: z.string().min(1, 'Data obrigatória'),
  metodoPagamento: z.string().min(1, 'Método obrigatório'),
  contaDestino: z.string().optional(),
  desconto: z.coerce.number().min(0).optional(),
  descontoTipo: z.enum(['saldo', 'encargos']).optional(),
  descontoMotivo: z.string().optional(),
  observacao: z.string().optional(),
})
type FormData = z.infer<typeof schema>

type WizardStep = 1 | 2 | 3 | 'ok'

interface ClientRow { id: number; nome: string; cpf: string; active: boolean }
interface LoanRow   { id: number; totalReceivable: number; numeroParcelas: number; status: string }
interface InstRow   {
  id: number; numero: number; installmentAmount: number; totalPago: number
  saldoDevedor?: number; dataVencimento: string; status: string
}
interface InstWithClient extends InstRow {
  loan: { id: number; client: { id: number; nome: string } }
}

interface SelectedInst {
  id: number; numero: number; installmentAmount: number; totalPago: number
  saldoDevedor?: number; dataVencimento: string; clientNome: string
}

interface Encargos {
  valor: number; totalPago: number
  valorMulta: number; valorMora: number
  totalDevido: number; diasAtraso: number
}

export default function NovoPagamentoPage() {
  const qc           = useQueryClient()
  const searchParams = useSearchParams()
  const router       = useRouter()

  // O deep-link ?parcelaId= vale so para a PRIMEIRA baixa. Como ele vivia preso na
  // URL, "Novo Pagamento" voltava ao passo 1 com a busca de clientes desligada
  // (enabled: !preParcelaId) e a lista vazia: a operadora nao conseguia dar a
  // segunda baixa. Virou estado justamente para poder ser zerado no reset.
  const [preParcelaId, setPreParcelaId] = useState<string | null>(
    () => searchParams.get('parcelaId'),
  )

  const [step,   setStep]   = useState<WizardStep>(preParcelaId ? 3 : 1)
  const [search, setSearch] = useState('')
  const [client, setClient] = useState<ClientRow | null>(null)
  const [loanId, setLoanId] = useState<number | null>(null)
  const [inst,   setInst]   = useState<SelectedInst | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      dataPagamento:   hojeISODate(),
      metodoPagamento: 'dinheiro',
    },
  })

  // Contas/bancos já usados — sugestões do campo "Bco Recebedor"
  const { data: contasUsadas } = useQuery<string[]>({
    queryKey: ['payments-contas'],
    queryFn: () => api.get<string[]>('/payments/contas').then(r => r.data),
    staleTime: 60_000,
  })

  // ── Step 1: busca de cliente ──────────────────────────────────────────────
  // A busca corre no servidor. Carregando "os 500 primeiros" e filtrando aqui,
  // os clientes alem do teto ficavam impossiveis de achar (ja sao 518) e a tela
  // baixava 590 KB so para abrir.
  const termo = search.trim()
  const { data: filtered = [], isLoading: loadingClients } = useQuery<ClientRow[]>({
    queryKey: ['clients-select', termo],
    queryFn: () => api.get('/clients', {
      params: { limit: 30, status: 'active', search: termo || undefined },
    }).then(r => r.data.data ?? r.data),
    enabled:  !preParcelaId,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  // ── Step 2: loans + installments ──────────────────────────────────────────
  const { data: loans, isLoading: loadingLoans } = useQuery<LoanRow[]>({
    queryKey: ['loans-wizard', client?.id],
    queryFn:  () => api.get('/loans', { params: { clientId: client!.id, limit: 20 } }).then(r => r.data.data ?? r.data),
    enabled:  !!client && step === 2,
  })

  useEffect(() => {
    if (loans?.length === 1) setLoanId(loans[0].id)
  }, [loans])

  const { data: loanDetail, isLoading: loadingInst } = useQuery<any>({
    queryKey: ['loan-wizard-detail', loanId],
    queryFn:  () => api.get(`/loans/${loanId}`).then(r => r.data),
    enabled:  !!loanId,
  })

  const pendingInst = useMemo<InstRow[]>(() => {
    if (!loanDetail?.installments) return []
    return [...loanDetail.installments]
      .filter((i: InstRow) => i.status !== 'pago' && i.status !== 'cancelado')
      .sort((a: InstRow, b: InstRow) =>
        new Date(a.dataVencimento).getTime() - new Date(b.dataVencimento).getTime()
      )
  }, [loanDetail])

  // ── Pre-filled from ?parcelaId= ────────────────────────────────────────────
  const { data: preInst } = useQuery<InstWithClient>({
    queryKey: ['inst-prefill', preParcelaId],
    queryFn:  () => api.get<InstWithClient>(`/installments/${preParcelaId}`).then(r => r.data),
    enabled:  !!preParcelaId,
  })

  // ── Encargos em tempo real (multa + mora) para parcelas atrasadas ──────────
  const instIdForEncargos = inst?.id ?? (preParcelaId ? Number(preParcelaId) : null)
  const overdueCheck = inst?.dataVencimento ?? preInst?.dataVencimento
  const isOverdueInst = overdueCheck
    ? new Date(overdueCheck) < new Date(new Date().toDateString())
    : false

  // A mora corre por dia, então o total depende da data da baixa, não de hoje.
  // Sem enviar a data, a tela mostrava a dívida de hoje e o backend recusava a
  // baixa retroativa por "excede o total devido".
  const dataPagamentoSel = form.watch('dataPagamento')

  const { data: encargos } = useQuery<Encargos>({
    queryKey: ['encargos', instIdForEncargos, dataPagamentoSel],
    queryFn:  () => api.get<Encargos>(`/installments/${instIdForEncargos}/encargos`, {
      params: { data: dataPagamentoSel || undefined },
    }).then(r => r.data),
    enabled:  !!instIdForEncargos && step === 3 && isOverdueInst,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (encargos && encargos.diasAtraso > 0 && encargos.totalDevido > 0) {
      form.setValue('valorPago', encargos.totalDevido)
    }
  }, [encargos, form])

  useEffect(() => {
    if (!preInst) return
    const saldo = Number(preInst.saldoDevedor ?? 0) || (Number(preInst.installmentAmount) - Number(preInst.totalPago))
    const si: SelectedInst = {
      id: preInst.id, numero: preInst.numero, installmentAmount: preInst.installmentAmount,
      totalPago: preInst.totalPago, saldoDevedor: preInst.saldoDevedor,
      dataVencimento: preInst.dataVencimento, clientNome: preInst.loan.client.nome,
    }
    setInst(si)
    form.setValue('installmentId', preInst.id)
    form.setValue('valorPago', saldo > 0 ? saldo : Number(preInst.installmentAmount))
  }, [preInst, form])

  useEffect(() => {
    if (!inst || preParcelaId) return
    const saldo = Number(inst.saldoDevedor ?? 0) || (Number(inst.installmentAmount) - Number(inst.totalPago))
    form.setValue('installmentId', inst.id)
    form.setValue('valorPago', saldo > 0 ? saldo : Number(inst.installmentAmount))
  }, [inst, preParcelaId, form])

  // ── Mutation ───────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (data: FormData) => api.post('/payments', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['loans'] })
      qc.invalidateQueries({ queryKey: ['installments'] })
      setStep('ok')
    },
  })

  function pickClient(c: ClientRow) {
    setClient(c); setLoanId(null); setInst(null); setStep(2)
  }

  function pickInst(i: InstRow) {
    setInst({
      id: i.id, numero: i.numero, installmentAmount: i.installmentAmount, totalPago: i.totalPago,
      saldoDevedor: i.saldoDevedor, dataVencimento: i.dataVencimento,
      clientNome: client!.nome,
    })
    setStep(3)
  }

  function resetWizard() {
    if (searchParams.get('parcelaId')) router.replace('/pagamentos/novo')
    setPreParcelaId(null)
    setStep(1); setSearch(''); setClient(null); setLoanId(null); setInst(null)
    form.reset({ dataPagamento: hojeISODate(), metodoPagamento: 'dinheiro' })
  }

  const StepDot = ({ n, label }: { n: 1 | 2 | 3; label: string }) => {
    const done   = typeof step === 'number' ? step > n : true
    const active = step === n
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={cn(
          'size-6 rounded-full flex items-center justify-center text-xs font-bold',
          done   ? 'bg-green-500 text-white'
          : active ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground',
        )}>
          {done ? <CheckCircle2 className="size-3.5" /> : n}
        </div>
        <span className={cn('text-sm hidden sm:inline', active ? 'font-semibold' : 'text-muted-foreground')}>
          {label}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-4">
        <Link href="/pagamentos">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="size-4" />Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registrar Pagamento</h1>
          <p className="text-muted-foreground text-sm">Recebimento de parcela</p>
        </div>
      </div>

      {step !== 'ok' && !preParcelaId && (
        <div className="flex items-center gap-3 px-1">
          <StepDot n={1} label="Cliente" />
          <div className="flex-1 h-px bg-border" />
          <StepDot n={2} label="Parcela" />
          <div className="flex-1 h-px bg-border" />
          <StepDot n={3} label="Pagamento" />
        </div>
      )}

      {/* ── STEP 1 — Buscar cliente ──────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="size-4" />Buscar Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9" autoFocus
                placeholder="Nome ou CPF..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {loadingClients ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : (
              <div className="space-y-0.5 max-h-72 overflow-y-auto">
                {filtered.map(c => (
                  <button
                    key={c.id}
                    onClick={() => pickClient(c)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{formatCPF(c.cpf)}</p>
                    </div>
                    <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))}
                {!termo && filtered.length === 30 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Digite para filtrar todos os clientes
                  </p>
                )}
                {termo && filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum cliente encontrado.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2 — Selecionar parcela ──────────────────────────────────── */}
      {step === 2 && client && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5">
            <div>
              <p className="text-sm font-medium">{client.nome}</p>
              <p className="text-xs text-muted-foreground">{formatCPF(client.cpf)}</p>
            </div>
            <Button
              variant="ghost" size="sm" className="text-xs h-7"
              onClick={() => { setClient(null); setStep(1) }}
            >
              Trocar
            </Button>
          </div>

          {loans && loans.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Contrato:</span>
              {loans.map(l => (
                <button
                  key={l.id}
                  onClick={() => setLoanId(l.id)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    loanId === l.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted',
                  )}
                >
                  #{l.id} · {formatCurrency(l.totalReceivable)}
                </button>
              ))}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="size-4" />Selecionar parcela
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(loadingLoans || loadingInst) ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : !loanId ? (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  Selecione um contrato acima.
                </p>
              ) : pendingInst.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  Nenhuma parcela pendente neste contrato.
                </p>
              ) : (
                <div className="divide-y">
                  {pendingInst.map(i => {
                    const saldo = Number(i.saldoDevedor ?? 0) || (Number(i.installmentAmount) - Number(i.totalPago))
                    const now  = new Date(); now.setHours(0, 0, 0, 0)
                    const venc = new Date(i.dataVencimento); venc.setHours(0, 0, 0, 0)
                    const diff = Math.floor((now.getTime() - venc.getTime()) / 86400000)
                    return (
                      <button
                        key={i.id}
                        onClick={() => pickInst(i)}
                        className={cn(
                          'w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left',
                          diff > 0 && 'bg-red-50/40 dark:bg-red-950/10',
                        )}
                      >
                        <div>
                          <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                            Parcela {i.numero}
                            {diff > 0 && (
                              <span className="text-[11px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                                {diff}d atraso
                              </span>
                            )}
                            {diff === 0 && (
                              <span className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                                Hoje
                              </span>
                            )}
                          </p>
                          <p className={cn('text-xs font-medium', diff > 0 ? 'text-destructive' : diff === 0 ? 'text-amber-600' : 'text-muted-foreground')}>Venc. {formatDate(i.dataVencimento)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn('text-sm font-bold', diff > 0 ? 'text-destructive' : '')}>
                            {formatCurrency(saldo)}
                          </span>
                          <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Button
            variant="outline" size="sm"
            onClick={() => { setStep(1); setClient(null) }}
            className="gap-2"
          >
            <ArrowLeft className="size-3.5" />Voltar
          </Button>
        </div>
      )}

      {/* ── STEP 3 — loading (pre-fill) ──────────────────────────────────── */}
      {step === 3 && !inst && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-40" />
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3 — Formulário de pagamento ─────────────────────────────── */}
      {step === 3 && inst && (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-sm">
            <p className="font-semibold text-blue-800 dark:text-blue-300">
              {inst.clientNome} · Parcela {inst.numero}
            </p>
            <p className="text-muted-foreground mt-0.5">
              Vencimento: {formatDate(inst.dataVencimento)} · Valor: {formatCurrency(inst.installmentAmount)} · Pago: {formatCurrency(inst.totalPago)}
            </p>
          </div>

          {encargos && encargos.diasAtraso > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm space-y-2">
              <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangle className="size-3.5" />
                Parcela em atraso — {encargos.diasAtraso} dia{encargos.diasAtraso !== 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <span className="text-muted-foreground">Valor base</span>
                <span className="text-right font-medium">{formatCurrency(encargos.valor - encargos.totalPago)}</span>
                {encargos.valorMulta > 0 && <>
                  <span className="text-muted-foreground">Multa</span>
                  <span className="text-right text-amber-700 dark:text-amber-400 font-medium">+ {formatCurrency(encargos.valorMulta)}</span>
                </>}
                {encargos.valorMora > 0 && <>
                  <span className="text-muted-foreground">Mora</span>
                  <span className="text-right text-amber-700 dark:text-amber-400 font-medium">+ {formatCurrency(encargos.valorMora)}</span>
                </>}
                <span className="font-semibold border-t border-amber-200 pt-1 mt-0.5">Total para quitar</span>
                <span className="text-right font-bold text-amber-800 dark:text-amber-300 border-t border-amber-200 pt-1 mt-0.5">{formatCurrency(encargos.totalDevido)}</span>
              </div>
            </div>
          )}

          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            {mutation.isError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {(mutation.error as any)?.response?.data?.message
                  ?? 'Erro ao registrar pagamento. Verifique os dados e tente novamente.'}
              </div>
            )}

            <Card>
              <CardContent className="pt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Valor Pago (R$) *</Label>
                  <Input type="number" step="0.01" min="0.01" {...form.register('valorPago')} />
                  {form.formState.errors.valorPago && (
                    <p className="text-xs text-destructive">{form.formState.errors.valorPago.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Data do Pagamento *</Label>
                  <Input type="date" {...form.register('dataPagamento')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Método de Pagamento *</Label>
                  <Select {...form.register('metodoPagamento')}>
                    {Object.entries(METODO_PAGAMENTO).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Bco Recebedor</Label>
                  <ComboboxTexto
                    value={form.watch('contaDestino') ?? ''}
                    onChange={(v) => form.setValue('contaDestino', v, { shouldDirty: true })}
                    opcoes={contasUsadas}
                    placeholder="ex: Itaú PJ, dinheiro em caixa"
                  />
                  <p className="text-[10px] text-muted-foreground">Conta/banco que recebeu o valor</p>
                </div>

                {/* Desconto (opcional) */}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 rounded-lg border border-dashed border-amber-300 dark:border-amber-900 p-3 bg-amber-50/40 dark:bg-amber-950/10">
                  <div className="space-y-1.5">
                    <Label>Desconto (R$)</Label>
                    <Input type="number" step="0.01" min="0" {...form.register('desconto')} placeholder="0,00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo do desconto</Label>
                    <Select {...form.register('descontoTipo')}>
                      <option value="saldo">Sobre o saldo (abate a parcela)</option>
                      <option value="encargos">Sobre encargos (multa/mora)</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Motivo do desconto</Label>
                    <Input {...form.register('descontoMotivo')} placeholder="ex: negociação à vista" />
                  </div>
                  <p className="md:col-span-3 text-[10px] text-muted-foreground">
                    Desconto sobre saldo permite quitar a parcela recebendo menos (reduz lucro e comissão). Sobre encargos apenas perdoa multa/mora.
                  </p>
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <Label>Observação</Label>
                  <Textarea
                    {...form.register('observacao')}
                    placeholder="Observações sobre o pagamento..."
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between gap-3">
              {!preParcelaId ? (
                <Button
                  variant="outline" type="button"
                  onClick={() => setStep(2)}
                  className="gap-2"
                >
                  <ArrowLeft className="size-3.5" />Voltar
                </Button>
              ) : (
                <Link href="/pagamentos">
                  <Button variant="outline" type="button">Cancelar</Button>
                </Link>
              )}
              <Button type="submit" disabled={mutation.isPending} className="gap-2">
                <Save className="size-4" />
                {mutation.isPending ? 'Registrando...' : 'Confirmar Pagamento'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── SUCCESS ───────────────────────────────────────────────────────── */}
      {step === 'ok' && inst && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <div className="size-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold">Pagamento registrado!</p>
              <p className="text-muted-foreground text-sm mt-1">
                {inst.clientNome} · Parcela {inst.numero} · {formatCurrency(Number(form.getValues('valorPago')))}
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={resetWizard}>Novo Pagamento</Button>
              <Link href="/pagamentos"><Button>Ver Pagamentos</Button></Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
