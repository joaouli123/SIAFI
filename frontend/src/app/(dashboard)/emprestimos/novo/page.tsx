'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Calculator, ChevronDown, ChevronRight, Plus, Trash2, Users, Percent } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { ClienteCombobox } from '@/components/ui/cliente-combobox'
import { formatCurrency, METODO_PAGAMENTO } from '@/lib/utils'
import api from '@/lib/api'
import Decimal from 'decimal.js'

function safeDecimal(val: unknown): Decimal {
  const d = new Decimal(val?.toString() || '0')
  return d.isNaN() ? new Decimal(0) : d
}

const schema = z.object({
  clientId: z.coerce.number().min(1, 'Selecione um cliente'),
  principalAmount: z.coerce.number().min(1, 'Capital deve ser maior que zero'),
  targetProfit: z.coerce.number().min(0, 'Lucro alvo não pode ser negativo'),
  numeroParcelas: z.coerce.number().min(1).max(360),
  valorParcela: z.coerce.number().optional(), // UI: cálculo reverso (não enviado ao backend)
  metodoPagamento: z.string().min(1),
  dataInicio: z.string().min(1, 'Data de início obrigatória'),
  dataPrimeiroVencimento: z.string().optional(),
  observacoes: z.string().optional(),
  // Configurações de cobrança
  diaVencimento: z.coerce.number().min(1).max(28).optional(),
  multaPercentual: z.coerce.number().min(0).max(100).optional(),
  moraDiariaPercentual: z.coerce.number().min(0).max(100).optional(),
  comissaoPercentual: z.coerce.number().min(0).max(100).optional(),
  comissaoValor: z.coerce.number().optional(), // UI: cálculo reverso (não enviado)
  descontoQuitacaoPercentual: z.coerce.number().min(0).max(100).optional(),
  diasAntecedenciaCobranca: z.coerce.number().min(1).max(60).optional(),
  cobrarWhatsapp: z.boolean().optional(),
  cobrarEmail: z.boolean().optional(),
  cobrarPortal: z.boolean().optional(),
  // Avalistas (podem referenciar um cliente existente)
  avalistas: z.array(z.object({
    clienteId: z.coerce.number().optional(),
    nome: z.string().optional(),
    cpf: z.string().optional(),
    telefone: z.string().optional(),
    parentesco: z.string().optional(),
  })).optional(),
  // Referências de contato
  referencia1Nome: z.string().optional(),
  referencia1Telefone: z.string().optional(),
  referencia1Vinculo: z.string().optional(),
  referencia2Nome: z.string().optional(),
  referencia2Telefone: z.string().optional(),
  referencia2Vinculo: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function NovoEmprestimoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const qc = useQueryClient()
  const preClienteId = searchParams.get('clienteId')
  const [showCobrancaConfig, setShowCobrancaConfig] = useState(false)

  const { data: clients } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => api.get<any>('/clients', { params: { limit: 500, status: 'active' } }).then((r) => r.data.data ?? r.data),
  })

  const { register, handleSubmit, watch, setValue, getValues, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      metodoPagamento: 'dinheiro',
      numeroParcelas: 12,
      dataInicio: new Date().toISOString().split('T')[0],
      clientId: preClienteId ? Number(preClienteId) : 0,
      targetProfit: 0,
      diasAntecedenciaCobranca: 10,
      cobrarWhatsapp: true,
      cobrarEmail: true,
      cobrarPortal: true,
      avalistas: [],
    },
  })

  const { fields: avalistaFields, append: addAvalista, remove: removeAvalista } = useFieldArray({
    control,
    name: 'avalistas',
  })

  // Cálculo bidirecional: Capital + Lucro ÷ Parcelas ⇄ Valor da Parcela.
  // Editar Lucro/Capital/Parcelas → recalcula Valor da Parcela.
  function recalcParcelaFromInputs() {
    const p = safeDecimal(getValues('principalAmount'))
    const l = safeDecimal(getValues('targetProfit'))
    const n = safeDecimal(getValues('numeroParcelas'))
    if (n.lte(0)) return
    setValue('valorParcela', p.plus(l).dividedBy(n).toDecimalPlaces(2).toNumber())
    recalcComissaoValorFromPct()
  }
  // Editar Valor da Parcela → recalcula Lucro Alvo = (parcela × n) − capital.
  function recalcLucroFromParcela() {
    const vp = safeDecimal(getValues('valorParcela'))
    const p  = safeDecimal(getValues('principalAmount'))
    const n  = safeDecimal(getValues('numeroParcelas'))
    const lucro = vp.times(n).minus(p)
    setValue('targetProfit', (lucro.isNegative() ? new Decimal(0) : lucro).toDecimalPlaces(2).toNumber())
    recalcComissaoValorFromPct()
  }

  // Comissão: bidirecional valor ⇄ % sobre o Lucro Alvo.
  function recalcComissaoValorFromPct() {
    const l = safeDecimal(getValues('targetProfit'))
    const pct = safeDecimal(getValues('comissaoPercentual'))
    setValue('comissaoValor', l.times(pct).dividedBy(100).toDecimalPlaces(2).toNumber())
  }
  function recalcComissaoPctFromValor() {
    const l = safeDecimal(getValues('targetProfit'))
    const val = safeDecimal(getValues('comissaoValor'))
    if (l.lte(0)) return
    const pct = val.dividedBy(l).times(100)
    setValue('comissaoPercentual', Decimal.min(pct, new Decimal(100)).toDecimalPlaces(2).toNumber())
  }

  useEffect(() => { if (preClienteId) setValue('clientId', Number(preClienteId)) }, [preClienteId, setValue])

  const principal   = safeDecimal(watch('principalAmount'))
  const lucro       = safeDecimal(watch('targetProfit'))
  const parcelas    = safeDecimal(watch('numeroParcelas'))
  const multaPct    = safeDecimal(watch('multaPercentual') ?? 2)
  const moraDiaPct  = safeDecimal(watch('moraDiariaPercentual') ?? 0.0333)

  const total   = principal.plus(lucro)
  const parcela = parcelas.isZero() ? new Decimal(0) : total.dividedBy(parcelas)
  const parcelaCapital = parcelas.isZero() ? new Decimal(0) : principal.dividedBy(parcelas)
  const parcelaLucro   = parcelas.isZero() ? new Decimal(0) : lucro.dividedBy(parcelas)

  const comissaoPct        = safeDecimal(watch('comissaoPercentual'))
  const comissaoTotal      = lucro.times(comissaoPct).dividedBy(100)
  const comissaoPorParcela = parcelas.isZero() ? new Decimal(0) : comissaoTotal.dividedBy(parcelas)
  const lucroEmpresaTotal  = lucro.minus(comissaoTotal)

  // Guard: show '—' if simulation values are incoherent
  const simOk = total.equals(principal.plus(lucro)) && !parcela.isNaN()

  // Preview de encargos em 30 dias (sobre valor da parcela)
  const parcelaBase  = parcela.isZero() ? new Decimal(0) : parcela
  const multaValor   = parcelaBase.times(multaPct.dividedBy(100))
  const moraValor30d = parcelaBase.times(moraDiaPct.dividedBy(100)).times(30)
  const totalEncargos30d = parcelaBase.plus(multaValor).plus(moraValor30d)

  const displayPrincipal      = principal.toFixed(2)
  const displayLucro          = lucro.toFixed(2)
  const displayTotal          = total.toFixed(2)
  const displayParcela        = parcela.toDecimalPlaces(2, Decimal.ROUND_DOWN).toFixed(2)
  const displayNumeroParcelas = parcelas.toNumber()

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const { valorParcela, comissaoValor, ...rest } = data // auxiliares de UI
      const payload = {
        ...rest,
        dataPrimeiroVencimento: data.dataPrimeiroVencimento || undefined,
        avalistas: (data.avalistas ?? [])
          .filter((a) => a.nome && a.nome.trim())
          .map((a) => ({
            ...a,
            clienteId: a.clienteId && a.clienteId > 0 ? a.clienteId : undefined,
          })),
      }
      return api.post('/loans', payload)
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['loans'] })
      router.push(`/emprestimos/${res.data.id}`)
    },
  })

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/emprestimos"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="size-4" />Voltar</Button></Link>
        <div><h1 className="text-2xl font-bold tracking-tight">Novo Empréstimo</h1><p className="text-muted-foreground text-sm">Cadastrar contrato de empréstimo</p></div>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        {mutation.isError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Erro ao criar empréstimo. Verifique os dados.
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Empréstimo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label>Cliente *</Label>
              <ClienteCombobox
                clientes={clients ?? []}
                value={watch('clientId')}
                onSelect={(c) => setValue('clientId', c?.id ?? 0, { shouldValidate: true })}
                placeholder="Buscar cliente por nome ou CPF..."
              />
              {errors.clientId && <p className="text-xs text-destructive">{errors.clientId.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Capital Emprestado (R$) *</Label>
              <Input type="number" step="0.01" min="0" {...register('principalAmount', { onChange: recalcParcelaFromInputs })} placeholder="0,00" />
              <p className="text-xs text-muted-foreground">Valor entregue ao cliente</p>
              {errors.principalAmount && <p className="text-xs text-destructive">{errors.principalAmount.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Lucro Alvo (R$) *</Label>
              <Input type="number" step="0.01" min="0" {...register('targetProfit', { onChange: recalcParcelaFromInputs })} placeholder="0,00" />
              <p className="text-xs text-muted-foreground">Acréscimo financeiro esperado</p>
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
              <Label>Forma de Pagamento *</Label>
              <Select {...register('metodoPagamento')}>
                {Object.entries(METODO_PAGAMENTO).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Data de Início do Contrato *</Label>
              <Input type="date" {...register('dataInicio')} />
              <p className="text-xs text-muted-foreground">Assinatura / saída do capital</p>
              {errors.dataInicio && <p className="text-xs text-destructive">{errors.dataInicio.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Data do 1º Vencimento</Label>
              <Input type="date" {...register('dataPrimeiroVencimento')} />
              <p className="text-xs text-muted-foreground">Vencimento da 1ª parcela (se vazio: 1 mês após o início)</p>
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea {...register('observacoes')} placeholder="Informações adicionais..." rows={3} />
            </div>
          </CardContent>
        </Card>

        {!principal.isZero() && simOk && (
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <Calculator className="size-4" />Simulação
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Capital</p>
                <p className="font-bold text-lg">{formatCurrency(Number(displayPrincipal))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Lucro Alvo</p>
                <p className="font-bold text-lg text-orange-600">{formatCurrency(Number(displayLucro))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total a Receber</p>
                <p className="font-bold text-lg text-blue-700 dark:text-blue-400">{formatCurrency(Number(displayTotal))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor da Parcela</p>
                <p className="font-bold text-lg">
                  {displayNumeroParcelas > 0 ? `${displayNumeroParcelas}x de ${formatCurrency(Number(displayParcela))}` : '—'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Percent className="size-4" />Comissão do Consultor</CardTitle>
            <p className="text-xs text-muted-foreground">Parte do lucro destinada ao consultor — informe % OU valor (o outro se ajusta)</p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Comissão (% do lucro)</Label>
              <Input type="number" step="0.01" min={0} max={100} {...register('comissaoPercentual', { onChange: recalcComissaoValorFromPct })} placeholder="ex: 30" />
            </div>
            <div className="space-y-1.5">
              <Label>Comissão (R$ total)</Label>
              <Input type="number" step="0.01" min={0} {...register('comissaoValor', { onChange: recalcComissaoPctFromValor })} placeholder="0,00" />
            </div>
            {comissaoPct.greaterThan(0) && lucro.greaterThan(0) && (
              <div className="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">% do lucro</p><p className="font-bold">{comissaoPct.toFixed(2)}%</p></div>
                <div><p className="text-xs text-muted-foreground">Comissão total</p><p className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(comissaoTotal.toNumber())}</p></div>
                <div><p className="text-xs text-muted-foreground">~ por parcela</p><p className="font-bold">{formatCurrency(comissaoPorParcela.toNumber())}</p></div>
                <div><p className="text-xs text-muted-foreground">Lucro da empresa</p><p className="font-bold text-blue-700 dark:text-blue-400">{formatCurrency(lucroEmpresaTotal.toNumber())}</p></div>
              </div>
            )}
            <div className="md:col-span-2 space-y-1.5 border-t pt-3">
              <Label>Desconto p/ quitação total do contrato (% do lucro a vencer)</Label>
              <Input type="number" step="0.01" min={0} max={100} {...register('descontoQuitacaoPercentual')} placeholder="ex: 10 — opcional" className="md:w-1/2" />
              <p className="text-xs text-muted-foreground">Aplicado quando o cliente quita o contrato inteiro de uma vez (abate parte do lucro a vencer).</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><Users className="size-4" />Avalistas</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => addAvalista({ clienteId: undefined, nome: '', cpf: '', telefone: '', parentesco: '' })}
            >
              <Plus className="size-4" />Adicionar
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {avalistaFields.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum avalista. Opcional — pode adicionar um cliente já cadastrado ou uma pessoa avulsa.</p>
            )}
            {avalistaFields.map((field, i) => {
              return (
                <div key={field.id} className="rounded-lg border p-3 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Avalista {i + 1}</span>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => removeAvalista(i)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2 space-y-1.5">
                      <Label>Cliente existente (opcional)</Label>
                      <ClienteCombobox
                        clientes={clients ?? []}
                        value={watch(`avalistas.${i}.clienteId`)}
                        excludeId={watch('clientId') || undefined}
                        avulsoLabel="— Pessoa avulsa (preencher manualmente) —"
                        placeholder="Buscar cliente por nome ou CPF..."
                        onSelect={(c) => {
                          setValue(`avalistas.${i}.clienteId`, c?.id ?? undefined)
                          if (c) {
                            setValue(`avalistas.${i}.nome`, c.nome)
                            setValue(`avalistas.${i}.cpf`, c.cpf ?? '')
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">Busque um cliente (nome/CPF) ou deixe vazio e preencha manualmente. O próprio cliente do contrato não aparece.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nome *</Label>
                      <Input {...register(`avalistas.${i}.nome`)} placeholder="Nome completo" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>CPF</Label>
                      <Input {...register(`avalistas.${i}.cpf`)} placeholder="000.000.000-00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Telefone</Label>
                      <Input {...register(`avalistas.${i}.telefone`)} placeholder="(00) 00000-0000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Vínculo / Parentesco</Label>
                      <Input {...register(`avalistas.${i}.parentesco`)} placeholder="ex: irmão, sócio" />
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Referências de Contato</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Referência 1 — Nome</Label>
                <Input {...register('referencia1Nome')} placeholder="Nome" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input {...register('referencia1Telefone')} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Vínculo</Label>
                <Input {...register('referencia1Vinculo')} placeholder="ex: vizinho" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Referência 2 — Nome</Label>
                <Input {...register('referencia2Nome')} placeholder="Nome" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input {...register('referencia2Telefone')} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Vínculo</Label>
                <Input {...register('referencia2Vinculo')} placeholder="ex: colega" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowCobrancaConfig(v => !v)}>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Configurações de Cobrança</span>
              {showCobrancaConfig ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </CardTitle>
            {!showCobrancaConfig && (
              <p className="text-xs text-muted-foreground">Personalize multa, mora e canais — usa os padrões do sistema se não preenchido</p>
            )}
          </CardHeader>
          {showCobrancaConfig && (
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Dia Fixo de Vencimento (1–28)</Label>
                <Input type="number" min={1} max={28} {...register('diaVencimento')} placeholder="ex: 5" />
                <p className="text-xs text-muted-foreground">Todas as parcelas vencerão neste dia (ignorado se a Data do 1º Vencimento for informada)</p>
              </div>

              <div className="space-y-1.5">
                <Label>Antecedência de Cobrança (dias)</Label>
                <Input type="number" min={1} max={60} {...register('diasAntecedenciaCobranca')} placeholder="10" />
                <p className="text-xs text-muted-foreground">Dias antes do vencimento para enviar aviso</p>
              </div>

              <div className="space-y-1.5">
                <Label>Multa por Atraso (%)</Label>
                <Input type="number" step="0.01" min={0} {...register('multaPercentual')} placeholder="2.00 (padrão)" />
                <p className="text-xs text-muted-foreground">% sobre o valor da parcela — aplicada uma vez no D+1</p>
              </div>

              <div className="space-y-1.5">
                <Label>Mora Diária (%)</Label>
                <Input type="number" step="0.0001" min={0} {...register('moraDiariaPercentual')} placeholder="0.0333 (padrão)" />
                <p className="text-xs text-muted-foreground">% ao dia sobre o saldo devedor</p>
              </div>

              <div className="md:col-span-2">
                <Label className="mb-2 block">Canais de Cobrança</Label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" {...register('cobrarWhatsapp')} className="rounded" /> WhatsApp
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" {...register('cobrarEmail')} className="rounded" /> E-mail
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" {...register('cobrarPortal')} className="rounded" /> Portal do Cliente
                  </label>
                </div>
              </div>

              {!parcelaBase.isZero() && (
                <div className="md:col-span-2 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-4">
                  <p className="text-sm font-medium text-orange-800 dark:text-orange-300 mb-2">Prévia de encargos — 30 dias em atraso (por parcela)</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Parcela base</p><p className="font-bold">{formatCurrency(parcelaBase.toNumber())}</p></div>
                    <div><p className="text-xs text-muted-foreground">Multa ({multaPct.toFixed(2)}%)</p><p className="font-bold text-orange-600">+{formatCurrency(multaValor.toNumber())}</p></div>
                    <div><p className="text-xs text-muted-foreground">Mora 30d ({moraDiaPct.toFixed(4)}%/d)</p><p className="font-bold text-orange-600">+{formatCurrency(moraValor30d.toNumber())}</p></div>
                    <div><p className="text-xs text-muted-foreground">Total c/ encargos</p><p className="font-bold text-red-600">{formatCurrency(totalEncargos30d.toNumber())}</p></div>
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/emprestimos"><Button variant="outline" type="button">Cancelar</Button></Link>
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            <Save className="size-4" />{mutation.isPending ? 'Criando...' : 'Criar Empréstimo'}
          </Button>
        </div>
      </form>
    </div>
  )
}
