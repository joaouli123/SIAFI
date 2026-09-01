'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { ArrowLeft, Calculator } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ContratoCombobox } from '@/components/ui/contrato-combobox'
import { formatCurrency } from '@/lib/utils'
import api from '@/lib/api'
import Decimal from 'decimal.js'

const TIPOS = [
  { value: 'prorrogacao',       label: 'Prorrogação' },
  { value: 'reducao_parcelas',  label: 'Redução de parcelas' },
  { value: 'aumento_prazo',     label: 'Aumento de prazo' },
  { value: 'reducao_juros',     label: 'Redução de juros' },
  { value: 'composicao_divida', label: 'Composição de dívida' },
  { value: 'outro',             label: 'Outro' },
]

const schema = z.object({
  loanId:               z.coerce.number().int().positive(),
  tipo:                 z.string().min(1),
  motivoCliente:        z.string().min(5, 'Informe o motivo com ao menos 5 caracteres'),
  dataPrevistaPagamento: z.string().optional(),
  // Campos do simulador (não são enviados ao backend)
  simPrincipal: z.coerce.number().optional(),
  simProfit:    z.coerce.number().optional(),
  simParcelas:  z.coerce.number().optional(),
  simDataInicio: z.string().optional(),
})

type FormData = z.infer<typeof schema>

function safeDecimal(v: unknown) {
  const d = new Decimal(v?.toString() || '0')
  return d.isNaN() ? new Decimal(0) : d
}

export default function NovoReparcelamentoPage() {
  const router = useRouter()
  const [simAtivo, setSimAtivo] = useState(false)


  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { simParcelas: 12 },
  })

  const mut = useMutation({
    mutationFn: (data: FormData) =>
      api.post('/reparcelamentos', {
        loanId:                data.loanId,
        tipo:                  data.tipo,
        motivoCliente:         data.motivoCliente,
        dataPrevistaPagamento: data.dataPrevistaPagamento || undefined,
      }),
    onSuccess: () => router.push('/reparcelamentos'),
  })

  // Simulador client-side
  const w = watch()
  const simResult = (() => {
    const p = safeDecimal(w.simPrincipal)
    const l = safeDecimal(w.simProfit)
    const n = safeDecimal(w.simParcelas)
    if (p.isZero() || n.isZero()) return null
    const total   = p.plus(l)
    const parcela = total.dividedBy(n).toDecimalPlaces(2)
    return { total, parcela }
  })()

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-4">
        <Link href="/reparcelamentos">
          <Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="size-4" />Voltar</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Solicitar Reparcelamento</h1>
          <p className="text-muted-foreground text-sm">Registre a solicitação do cliente para análise financeira</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(d => mut.mutate(d))} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados da Solicitação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empréstimo</Label>
              <ContratoCombobox
                value={watch('loanId') ? Number(watch('loanId')) : null}
                onSelect={(l) => setValue('loanId', (l?.id ?? 0) as any, { shouldValidate: true })}
              />
              {errors.loanId && <p className="text-xs text-destructive">{errors.loanId.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de Reparcelamento</Label>
              <Select {...register('tipo')}>
                <option value="">Selecione...</option>
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
              {errors.tipo && <p className="text-xs text-destructive">{errors.tipo.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Motivo do Cliente</Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Descreva o motivo informado pelo cliente..."
                {...register('motivoCliente')}
              />
              {errors.motivoCliente && <p className="text-xs text-destructive">{errors.motivoCliente.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Data Prevista de Pagamento (opcional)</Label>
              <Input type="date" {...register('dataPrevistaPagamento')} />
            </div>
          </CardContent>
        </Card>

        {/* Simulador */}
        <Card className="border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/20 dark:border-indigo-900">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                <Calculator className="size-4" />Simulador de Parcelas
              </CardTitle>
              <Button type="button" variant="ghost" size="sm"
                onClick={() => setSimAtivo(v => !v)}
                className="text-indigo-600 hover:text-indigo-800 text-xs">
                {simAtivo ? 'Ocultar' : 'Abrir simulador'}
              </Button>
            </div>
          </CardHeader>

          {simAtivo && (
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Simule os novos termos do contrato antes de registrar a solicitação.
                Os valores aqui <strong>não são enviados</strong> — servem apenas de referência.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-indigo-700 dark:text-indigo-400">Capital Emprestado (R$)</Label>
                  <Input type="number" step="0.01" min="0" placeholder="0,00"
                    {...register('simPrincipal')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-indigo-700 dark:text-indigo-400">Lucro Alvo (R$)</Label>
                  <Input type="number" step="0.01" min="0" placeholder="0,00"
                    {...register('simProfit')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-indigo-700 dark:text-indigo-400">Nº de Parcelas</Label>
                  <Input type="number" min="1" max="360" {...register('simParcelas')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-indigo-700 dark:text-indigo-400">Data da 1ª Parcela</Label>
                  <Input type="date" {...register('simDataInicio')} />
                </div>
              </div>

              {simResult && (
                <div className="rounded-lg border border-indigo-200 bg-white dark:bg-indigo-950/30 p-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total a receber</p>
                    <p className="text-lg font-bold text-indigo-700 dark:text-indigo-400">
                      {formatCurrency(simResult.total.toNumber())}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Valor por parcela</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                      {formatCurrency(simResult.parcela.toNumber())}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/reparcelamentos">
            <Button type="button" variant="outline">Cancelar</Button>
          </Link>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? 'Registrando...' : 'Registrar Solicitação'}
          </Button>
        </div>
      </form>
    </div>
  )
}
