'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Calculator, ChevronDown, ChevronRight, AlertTriangle, Percent } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, METODO_PAGAMENTO, toDateInputValue } from '@/lib/utils'
import api from '@/lib/api'
import { useAuth } from '@/contexts/auth.context'
import Decimal from 'decimal.js'

function safeDecimal(val: unknown): Decimal {
  const d = new Decimal(val?.toString() || '0')
  return d.isNaN() ? new Decimal(0) : d
}

const schema = z.object({
  principalAmount: z.coerce.number().min(1, 'Capital deve ser maior que zero'),
  targetProfit: z.coerce.number().min(0, 'Lucro alvo não pode ser negativo'),
  numeroParcelas: z.coerce.number().min(1).max(360),
  valorParcela: z.coerce.number().optional(), // UI: cálculo reverso (não enviado)
  metodoPagamento: z.string().optional(),
  dataInicio: z.string().min(1, 'Data de início obrigatória'),
  dataPrimeiroVencimento: z.string().optional(),
  observacoes: z.string().optional(),
  diaVencimento: z.coerce.number().min(1).max(28).optional(),
  multaPercentual: z.coerce.number().min(0).max(9.99).optional(),
  moraDiariaPercentual: z.coerce.number().min(0).max(9.99).optional(),
  comissaoPercentual: z.coerce.number().min(0).max(100).optional(),
  comissaoAdministradorPercentual: z.coerce.number().min(0).max(100).optional(),
  comissaoAdministradorValor: z.coerce.number().optional(),
  comissaoValor: z.coerce.number().optional(),
  descontoQuitacaoPercentual: z.coerce.number().min(0).max(100).optional(),
  diasAntecedenciaCobranca: z.coerce.number().min(1).max(60).optional(),
  cobrarWhatsapp: z.boolean().optional(),
  cobrarEmail: z.boolean().optional(),
  cobrarPortal: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

export default function EditarEmprestimoPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const router = useRouter()
  const { id } = useParams()
  const qc = useQueryClient()
  const [showCobrancaConfig, setShowCobrancaConfig] = useState(false)

  const { data: loan, isLoading } = useQuery({
    queryKey: ['loans', id],
    queryFn: () => api.get<any>(`/loans/${id}`).then((r) => r.data),
  })

  const { register, handleSubmit, watch, setValue, getValues, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  })

  useEffect(() => {
    if (!loan) return
    reset({
      principalAmount: Number(loan.principalAmount),
      targetProfit: Number(loan.targetProfit),
      numeroParcelas: loan.numeroParcelas,
      valorParcela: loan.numeroParcelas > 0
        ? Number(((Number(loan.totalReceivable)) / loan.numeroParcelas).toFixed(2))
        : undefined,
      metodoPagamento: loan.metodoPagamento ?? 'dinheiro',
      dataInicio: toDateInputValue(loan.dataInicio),
      dataPrimeiroVencimento: '',
      observacoes: loan.observacoes ?? '',
      diaVencimento: loan.diaVencimento ?? undefined,
      multaPercentual: loan.multaPercentual != null ? Number(loan.multaPercentual) : undefined,
      moraDiariaPercentual: loan.moraDiariaPercentual != null ? Number(loan.moraDiariaPercentual) : undefined,
      comissaoPercentual: loan.comissaoPercentual != null ? Number(loan.comissaoPercentual) : undefined,
      comissaoValor: loan.comissaoPercentual != null
        ? Number((Number(loan.targetProfit) * Number(loan.comissaoPercentual) / 100).toFixed(2))
        : undefined,
      comissaoAdministradorPercentual: loan.comissaoAdministradorPercentual != null ? Number(loan.comissaoAdministradorPercentual) : undefined,
      comissaoAdministradorValor: loan.comissaoAdministradorPercentual != null
        ? Number((Number(loan.targetProfit) * Number(loan.comissaoAdministradorPercentual) / 100).toFixed(2))
        : undefined,
      descontoQuitacaoPercentual: loan.descontoQuitacaoPercentual != null ? Number(loan.descontoQuitacaoPercentual) : undefined,
      diasAntecedenciaCobranca: loan.diasAntecedenciaCobranca ?? 10,
      cobrarWhatsapp: loan.cobrarWhatsapp ?? true,
      cobrarEmail: loan.cobrarEmail ?? true,
      cobrarPortal: loan.cobrarPortal ?? true,
    })
  }, [loan, reset])

  const principal = safeDecimal(watch('principalAmount'))
  const lucro     = safeDecimal(watch('targetProfit'))
  const parcelas  = safeDecimal(watch('numeroParcelas'))
  const total     = principal.plus(lucro)
  const parcela   = parcelas.isZero() ? new Decimal(0) : total.dividedBy(parcelas)
  const simOk     = !parcela.isNaN()
  const parcelaCapital = parcelas.isZero() ? new Decimal(0) : principal.dividedBy(parcelas)
  const parcelaLucro   = parcelas.isZero() ? new Decimal(0) : lucro.dividedBy(parcelas)

  const comissaoPct        = safeDecimal(watch('comissaoPercentual'))
  const comissaoAdministradorPct = safeDecimal(watch('comissaoAdministradorPercentual'))
  const comissaoTotal      = lucro.times(comissaoPct).dividedBy(100)
  const comissaoAdministradorTotal = lucro.times(comissaoAdministradorPct).dividedBy(100)
  const comissaoPorParcela = parcelas.isZero() ? new Decimal(0) : comissaoTotal.dividedBy(parcelas)
  const lucroEmpresaTotal  = lucro.minus(comissaoTotal).minus(comissaoAdministradorTotal)

  function recalcComissaoValorFromPct() {
    const l = safeDecimal(getValues('targetProfit'))
    const pct = safeDecimal(getValues('comissaoPercentual'))
    setValue('comissaoValor', l.times(pct).dividedBy(100).toDecimalPlaces(2).toNumber())
  }
  function recalcComissaoPctFromValor() {
    const l = safeDecimal(getValues('targetProfit'))
    const val = safeDecimal(getValues('comissaoValor'))
    if (l.lte(0)) return
    setValue('comissaoPercentual', Decimal.min(val.dividedBy(l).times(100), new Decimal(100)).toDecimalPlaces(2).toNumber())
  }
  function recalcComissaoAdministradorValorFromPct() {
    const l = safeDecimal(getValues('targetProfit'))
    const pct = safeDecimal(getValues('comissaoAdministradorPercentual'))
    setValue('comissaoAdministradorValor', l.times(pct).dividedBy(100).toDecimalPlaces(2).toNumber())
  }
  function recalcComissaoAdministradorPctFromValor() {
    const l = safeDecimal(getValues('targetProfit'))
    const val = safeDecimal(getValues('comissaoAdministradorValor'))
    if (l.lte(0)) return
    setValue('comissaoAdministradorPercentual', Decimal.min(val.dividedBy(l).times(100), new Decimal(100)).toDecimalPlaces(2).toNumber())
  }

  // Capital + Lucro ÷ Parcelas ⇄ Valor da Parcela (igual ao /novo)
  function recalcParcelaFromInputs() {
    const p = safeDecimal(getValues('principalAmount'))
    const l = safeDecimal(getValues('targetProfit'))
    const num = safeDecimal(getValues('numeroParcelas'))
    if (num.lte(0)) return
    setValue('valorParcela', p.plus(l).dividedBy(num).toDecimalPlaces(2).toNumber())
    recalcComissaoValorFromPct()
    recalcComissaoAdministradorValorFromPct()
  }
  function recalcLucroFromParcela() {
    const vp = safeDecimal(getValues('valorParcela'))
    const p = safeDecimal(getValues('principalAmount'))
    const num = safeDecimal(getValues('numeroParcelas'))
    const novoLucro = vp.times(num).minus(p)
    setValue('targetProfit', (novoLucro.isNegative() ? new Decimal(0) : novoLucro).toDecimalPlaces(2).toNumber())
    recalcComissaoValorFromPct()
    recalcComissaoAdministradorValorFromPct()
  }

  // Quantas parcelas já têm pagamento (preservadas na regeneração)
  const parcelasPagas = (loan?.installments ?? []).filter(
    (i: any) => i.status === 'pago' || i.status === 'parcialmente_pago' || i.status === 'cancelado' || Number(i.totalPago) > 0,
  ).length

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const { comissaoValor, comissaoAdministradorValor, valorParcela, ...rest } = data
      const payload = {
        ...rest,
        dataPrimeiroVencimento: data.dataPrimeiroVencimento || undefined, // só envia se preenchida
      }
      return api.patch(`/loans/${id}`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans', id] })
      qc.invalidateQueries({ queryKey: ['loans'] })
      router.push(`/emprestimos/${id}`)
    },
  })

  // Espelha o cronogramaMudou do backend: só estes campos regeneram as parcelas.
  // Mexer em comissão, multa, mora ou observações não toca no cronograma.
  function regeneraParcelas(d: FormData) {
    return (
      Number(d.principalAmount) !== Number(loan.principalAmount) ||
      Number(d.targetProfit) !== Number(loan.targetProfit) ||
      Number(d.numeroParcelas) !== Number(loan.numeroParcelas) ||
      (d.dataInicio ?? '') !== toDateInputValue(loan.dataInicio) ||
      (d.diaVencimento ?? null) !== (loan.diaVencimento ?? null) ||
      !!d.dataPrimeiroVencimento
    )
  }

  function onSubmit(d: FormData) {
    const msg = regeneraParcelas(d)
      ? 'Salvar alterações? As parcelas pendentes/atrasadas serão regeneradas; parcelas já pagas serão preservadas.'
      : 'Salvar alterações? O cronograma de parcelas não muda — nenhuma parcela será regerada.'
    if (!confirm(msg)) return
    mutation.mutate(d)
  }

  if (isLoading || !loan) return (
    <div className="space-y-4 w-full"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>
  )

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-4">
        <Link href={`/emprestimos/${id}`}><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="size-4" />Voltar</Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Editar Empréstimo #{loan.id}</h1>
          <p className="text-muted-foreground text-sm">{loan.client?.nome}</p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
        <AlertTriangle className="size-5 shrink-0" />
        <div>
          Alterar valores ou número de parcelas <strong>regenera as parcelas pendentes/atrasadas</strong>.
          {parcelasPagas > 0 && <> {parcelasPagas} parcela(s) com pagamento serão <strong>preservadas</strong>.</>}
          {' '}Toda edição é registrada na auditoria.
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
        {mutation.isError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {(mutation.error as any)?.response?.data?.message ?? 'Erro ao salvar alterações.'}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Empréstimo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Capital Emprestado (R$) *</Label>
              <Input type="number" step="0.01" min="0" {...register('principalAmount', { onChange: recalcParcelaFromInputs })} />
              {errors.principalAmount && <p className="text-xs text-destructive">{errors.principalAmount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Lucro Alvo (R$) *</Label>
              <Input type="number" step="0.01" min="0" {...register('targetProfit', { onChange: recalcParcelaFromInputs })} />
              {errors.targetProfit && <p className="text-xs text-destructive">{errors.targetProfit.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Número de Parcelas *</Label>
              <Input type="number" min="1" max="360" {...register('numeroParcelas', { onChange: recalcParcelaFromInputs })} />
              {errors.numeroParcelas && <p className="text-xs text-destructive">{errors.numeroParcelas.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Valor da Parcela (R$)</Label>
              <Input type="number" step="0.01" min="0" {...register('valorParcela', { onChange: recalcLucroFromParcela })} placeholder="0,00" />
              {!parcelas.isZero() && simOk && (parcelaCapital.greaterThan(0) || parcelaLucro.greaterThan(0)) ? (
                <p className="text-xs text-muted-foreground">
                  Capital: <span className="font-medium text-foreground">{formatCurrency(parcelaCapital.toNumber())}</span>
                  {' + '}Lucro: <span className="font-medium text-orange-600">{formatCurrency(parcelaLucro.toNumber())}</span>
                  {' por parcela'}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Edite a parcela e o Lucro Alvo se ajusta sozinho</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Forma de Pagamento</Label>
              <Select {...register('metodoPagamento')}>
                {Object.entries(METODO_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data de Início do Contrato *</Label>
              <Input type="date" {...register('dataInicio')} />
              {errors.dataInicio && <p className="text-xs text-destructive">{errors.dataInicio.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Data do 1º Vencimento</Label>
              <Input type="date" {...register('dataPrimeiroVencimento')} />
              <p className="text-xs text-muted-foreground">Preencha para redefinir o vencimento das parcelas pendentes (a 1ª nesta data); vazio mantém o cronograma</p>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea {...register('observacoes')} rows={3} />
            </div>
          </CardContent>
        </Card>

        {!principal.isZero() && simOk && (
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-blue-700 dark:text-blue-400"><Calculator className="size-4" />Nova Simulação</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-xs text-muted-foreground">Capital</p><p className="font-bold text-lg">{formatCurrency(principal.toNumber())}</p></div>
              <div><p className="text-xs text-muted-foreground">Lucro Alvo</p><p className="font-bold text-lg text-orange-600">{formatCurrency(lucro.toNumber())}</p></div>
              <div><p className="text-xs text-muted-foreground">Total a Receber</p><p className="font-bold text-lg text-blue-700 dark:text-blue-400">{formatCurrency(total.toNumber())}</p></div>
              <div><p className="text-xs text-muted-foreground">Valor da Parcela</p><p className="font-bold text-lg">{parcelas.toNumber() > 0 ? `${parcelas.toNumber()}x de ${formatCurrency(parcela.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber())}` : '—'}</p></div>
            </CardContent>
          </Card>
        )}

        {isAdmin && <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Percent className="size-4" />Comissões sobre o Lucro Geral</CardTitle>
            <p className="text-xs text-muted-foreground">Consultor e administrador recebem percentuais calculados sobre o Lucro Geral. O Lucro da Empresa é o valor restante.</p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Comissão do Consultor (% do Lucro Geral)</Label>
              <Input type="number" step="0.01" min={0} max={100} {...register('comissaoPercentual', { onChange: recalcComissaoValorFromPct })} placeholder="ex: 30" />
            </div>
            <div className="space-y-1.5">
              <Label>Comissão do Consultor (R$ total)</Label>
              <Input type="number" step="0.01" min={0} {...register('comissaoValor', { onChange: recalcComissaoPctFromValor })} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Comissão do Administrador (% do Lucro Geral)</Label>
              <Input type="number" step="0.01" min={0} max={100} {...register('comissaoAdministradorPercentual', { onChange: recalcComissaoAdministradorValorFromPct })} placeholder="ex: 70" />
            </div>
            <div className="space-y-1.5">
              <Label>Comissão do Administrador (R$ total)</Label>
              <Input type="number" step="0.01" min={0} {...register('comissaoAdministradorValor', { onChange: recalcComissaoAdministradorPctFromValor })} placeholder="0,00" />
            </div>
            {(comissaoPct.greaterThan(0) || comissaoAdministradorPct.greaterThan(0)) && lucro.greaterThan(0) && (
              <div className="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">% do Lucro Geral</p><p className="font-bold">{comissaoPct.toFixed(2)}%</p></div>
                <div><p className="text-xs text-muted-foreground">Comissão do consultor</p><p className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(comissaoTotal.toNumber())}</p></div>
                <div><p className="text-xs text-muted-foreground">~ por parcela</p><p className="font-bold">{formatCurrency(comissaoPorParcela.toNumber())}</p></div>
                <div><p className="text-xs text-muted-foreground">Comissão administrador</p><p className="font-bold text-violet-700 dark:text-violet-400">{formatCurrency(comissaoAdministradorTotal.toNumber())}</p></div>
                <div><p className="text-xs text-muted-foreground">Lucro da Empresa</p><p className="font-bold text-blue-700 dark:text-blue-400">{formatCurrency(lucroEmpresaTotal.toNumber())}</p></div>
              </div>
            )}
            <div className="md:col-span-2 space-y-1.5 border-t pt-3">
              <Label>Desconto p/ quitação total do contrato (% do lucro a vencer)</Label>
              <Input type="number" step="0.01" min={0} max={100} {...register('descontoQuitacaoPercentual')} placeholder="ex: 10 — opcional" className="md:w-1/2" />
            </div>
          </CardContent>
        </Card>}

        <Card>
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowCobrancaConfig(v => !v)}>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Configurações de Cobrança</span>
              {showCobrancaConfig ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </CardTitle>
          </CardHeader>
          {showCobrancaConfig && (
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Dia Fixo de Vencimento (1–28)</Label>
                <Input type="number" min={1} max={28} {...register('diaVencimento')} />
                <p className="text-xs text-muted-foreground">Ignorado se a Data do 1º Vencimento for informada</p>
              </div>
              <div className="space-y-1.5">
                <Label>Antecedência de Cobrança (dias)</Label>
                <Input type="number" min={1} max={60} {...register('diasAntecedenciaCobranca')} />
              </div>
              <div className="space-y-1.5">
                <Label>Multa por Atraso (%)</Label>
                <Input type="number" step="0.01" min={0} {...register('multaPercentual')} placeholder="2.00 (padrão)" />
              </div>
              <div className="space-y-1.5">
                <Label>Mora Diária (%)</Label>
                <Input type="number" step="0.0001" min={0} {...register('moraDiariaPercentual')} placeholder="0.0333 (padrão)" />
              </div>
              <div className="md:col-span-2">
                <Label className="mb-2 block">Canais de Cobrança</Label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" {...register('cobrarWhatsapp')} className="rounded" /> WhatsApp</label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" {...register('cobrarEmail')} className="rounded" /> E-mail</label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" {...register('cobrarPortal')} className="rounded" /> Portal do Cliente</label>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <div className="flex justify-end gap-3">
          <Link href={`/emprestimos/${id}`}><Button variant="outline" type="button">Cancelar</Button></Link>
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            <Save className="size-4" />{mutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </form>
    </div>
  )
}
