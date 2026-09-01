'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, RefreshCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ContratoCombobox } from '@/components/ui/contrato-combobox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, formatDate, hojeISODate } from '@/lib/utils'
import * as React from 'react'
import api from '@/lib/api'

const schema = z.object({
  loanId: z.coerce.number().min(1, 'Selecione um empréstimo'),
  numeroParcelas: z.coerce.number().min(1).max(360),
  taxaJuros: z.coerce.number().min(0).max(100),
  dataInicio: z.string().min(1),
  observacoes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function NovaRenegociacaoPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const searchParams = useSearchParams()
  const preLoanId = searchParams.get('loanId')

  const [contrato, setContrato] = useState<any>(null)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      taxaJuros: 5,
      numeroParcelas: 12,
      dataInicio: hojeISODate(),
      loanId: preLoanId ? Number(preLoanId) : 0,
    },
  })

  const loanId = watch('loanId')
  const selectedLoan = contrato?.id === Number(loanId) ? contrato : null

  useEffect(() => { if (preLoanId) setValue('loanId', Number(preLoanId)) }, [preLoanId, setValue])

  const mutation = useMutation({
    mutationFn: (data: FormData) => api.post('/renegociacoes', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renegociacoes'] })
      qc.invalidateQueries({ queryKey: ['loans'] })
      qc.invalidateQueries({ queryKey: ['installments'] })
      router.push('/renegociacoes')
    },
  })

  const { data: installmentsData } = useQuery({
    queryKey: ['installments', 'loan', loanId],
    queryFn: () => api.get<any>('/installments', { params: { loanId: Number(loanId), limit: 200 } }).then(r => r.data.data ?? r.data),
    enabled: !!loanId && Number(loanId) > 0,
  })

  const dividaTotal = React.useMemo(() => {
    if (!installmentsData || !Array.isArray(installmentsData)) return 0
    const hojeD = new Date(); hojeD.setHours(0,0,0,0)
    return installmentsData.reduce((sum: number, inst: any) => {
      if (inst.status === 'pago' || inst.status === 'cancelado') return sum
      const originalSaldo = Math.max(0, Number(inst.installmentAmount || 0) - Number(inst.totalPago || 0))
      const vencD = new Date(inst.dataVencimento); vencD.setHours(0,0,0,0)
      const isOverdue = inst.status === 'atrasado' || (originalSaldo > 0 && vencD < hojeD)
      const encargos = isOverdue ? Number(inst.moraAcumulada || 0) + Number(inst.multaAplicada || 0) : 0
      return sum + originalSaldo + encargos
    }, 0)
  }, [installmentsData])

  const taxaJuros = watch('taxaJuros') || 0
  const simulationTerms = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24]

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-4">
        <Link href="/renegociacoes"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="size-4" />Voltar</Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><RefreshCcw className="size-5" />Nova Renegociação</h1>
          <p className="text-muted-foreground text-sm">Renegociar parcelas em atraso</p>
        </div>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        {mutation.isError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Erro ao criar renegociação. Verifique se o empréstimo tem parcelas pendentes/atrasadas.
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Selecionar Empréstimo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empréstimo *</Label>
              <ContratoCombobox
                value={loanId ? Number(loanId) : null}
                onSelect={(l) => { setContrato(l); setValue('loanId', l?.id ?? 0, { shouldValidate: true }) }}
              />
              {errors.loanId && <p className="text-xs text-destructive">{errors.loanId.message}</p>}
            </div>

            {selectedLoan && (
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1">
                <p className="font-medium">{selectedLoan.client?.nome}</p>
                <p className="text-muted-foreground">Contratado: {formatCurrency(Number(selectedLoan.principalAmount))} · {selectedLoan.numeroParcelas}x · Início: {formatDate(selectedLoan.dataInicio)}</p>
                <p className="font-bold text-destructive mt-1 text-base">Dívida Atual: {formatCurrency(dividaTotal)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Condições da Renegociação</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Novas Parcelas *</Label>
              <Input type="number" min="1" max="360" {...register('numeroParcelas')} />
              {errors.numeroParcelas && <p className="text-xs text-destructive">{errors.numeroParcelas.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Nova Taxa de Juros (% a.m.) *</Label>
              <Input type="number" step="0.01" min="0" max="100" {...register('taxaJuros')} />
              {errors.taxaJuros && <p className="text-xs text-destructive">{errors.taxaJuros.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Data de Início *</Label>
              <Input type="date" {...register('dataInicio')} />
              {errors.dataInicio && <p className="text-xs text-destructive">{errors.dataInicio.message}</p>}
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea {...register('observacoes')} placeholder="Motivo e condições da renegociação..." rows={3} />
            </div>
          </CardContent>
        </Card>

        {dividaTotal > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Simulação de Cenários</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">Tire um print desta tabela para enviar ao cliente as opções de renegociação baseadas na dívida de <strong>{formatCurrency(dividaTotal)}</strong> e taxa de <strong>{taxaJuros}% a.m.</strong></p>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="w-24 text-center">Parcelas</TableHead>
                      <TableHead className="text-right">Valor da Parcela</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Total a Pagar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {simulationTerms.map(n => {
                      const totalComJuros = dividaTotal * (1 + (taxaJuros / 100) * n)
                      const valorParcela = totalComJuros / n
                      return (
                        <TableRow key={n}>
                          <TableCell className="text-center font-medium">{n}x</TableCell>
                          <TableCell className="text-right font-bold text-primary">{formatCurrency(valorParcela)}</TableCell>
                          <TableCell className="text-right text-muted-foreground hidden sm:table-cell">{formatCurrency(totalComJuros)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          Atenção: As parcelas pendentes e em atraso serão canceladas e substituídas pelas novas condições negociadas.
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/renegociacoes"><Button variant="outline" type="button">Cancelar</Button></Link>
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            <Save className="size-4" />{mutation.isPending ? 'Processando...' : 'Confirmar Renegociação'}
          </Button>
        </div>
      </form>
    </div>
  )
}
