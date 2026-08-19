'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Phone, Mail, MapPin, CreditCard, AlertCircle, MessageSquare, Plus, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import api from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatCPF, formatPhone, formatDate, formatCurrency, STATUS_LOAN } from '@/lib/utils'

interface ClienteDetalhe {
  id: number
  nome: string
  cpf: string | null
  whatsapp: string | null
  email: string | null
  cidade: string | null
  estado: string | null
  portalAtivo: boolean
  active: boolean
  loans: Array<{
    id: number
    valor: number
    numeroParcelas: number
    status: string
    dataInicio: string
    installments: Array<{ id: number }>
  }>
  cobrancaContatos: Array<{
    id: number
    canal: string
    resultado: string
    prometeuPagarEm: string | null
    observacao: string | null
    createdAt: string
    installment: { numero: number; valor: number; dataVencimento: string } | null
  }>
}

interface Installment {
  id: number
  numero: number
  valor: number
  dataVencimento: string
  status: string
}

const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  ligacao: 'Ligação',
  presencial: 'Presencial',
}

const RESULTADO_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  prometeu_pagar: { label: 'Prometeu pagar', variant: 'default' },
  nao_atendeu: { label: 'Não atendeu', variant: 'secondary' },
  numero_incorreto: { label: 'Nº incorreto', variant: 'destructive' },
  outro: { label: 'Outro', variant: 'outline' },
}

const cobrancaSchema = z.object({
  installmentId: z.coerce.number().int().positive('Selecione a parcela'),
  canal: z.enum(['whatsapp', 'ligacao', 'presencial']),
  resultado: z.enum(['prometeu_pagar', 'nao_atendeu', 'numero_incorreto', 'outro']),
  prometeuPagarEm: z.string().optional(),
  observacao: z.string().max(300).optional(),
})

type CobrancaForm = z.infer<typeof cobrancaSchema>

export default function ConsultorClienteDetalhePage() {
  const { clientId } = useParams()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data: cliente, isLoading } = useQuery<ClienteDetalhe>({
    queryKey: ['consultor-cliente', clientId],
    queryFn: () => api.get(`/consultor/carteira/${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })

  const { data: parcelasAtrasadas } = useQuery<Installment[]>({
    queryKey: ['parcelas-atrasadas', clientId],
    queryFn: () =>
      api.get('/installments/overdue', { params: { clientId: Number(clientId) } })
        .then(r => r.data?.data ?? r.data),
    enabled: showForm && !!clientId,
  })

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<CobrancaForm>({
    resolver: zodResolver(cobrancaSchema) as any,
    defaultValues: { canal: 'whatsapp', resultado: 'nao_atendeu' },
  })

  const resultado = watch('resultado')

  const mutation = useMutation({
    mutationFn: (data: CobrancaForm) =>
      api.post('/consultor/cobrancas', {
        clientId: Number(clientId),
        installmentId: data.installmentId,
        canal: data.canal,
        resultado: data.resultado,
        prometeuPagarEm: data.prometeuPagarEm || undefined,
        observacao: data.observacao || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultor-cliente', clientId] })
      qc.invalidateQueries({ queryKey: ['cobrancas'] })
      reset()
      setShowForm(false)
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4 w-full">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Cliente não encontrado na sua carteira.</p>
        <Link href="/consultor/carteira">
          <Button variant="outline" className="mt-4">Voltar</Button>
        </Link>
      </div>
    )
  }

  const emprestimosAtivos = cliente.loans.filter(l => l.status === 'ativo' || l.status === 'inadimplente')
  const totalAtrasadas = cliente.loans.reduce((acc, l) => acc + l.installments.length, 0)

  return (
    <div className="space-y-5 w-full">
      <div className="flex items-center gap-3">
        <Link href="/consultor/carteira">
          <button className="text-muted-foreground hover:text-foreground" aria-label="Voltar">
            <ArrowLeft className="size-5" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{cliente.nome}</h1>
          {cliente.cpf && <p className="text-xs text-muted-foreground">{formatCPF(cliente.cpf)}</p>}
        </div>
        {totalAtrasadas > 0 && (
          <Badge variant="destructive">{totalAtrasadas} atrasada{totalAtrasadas !== 1 ? 's' : ''}</Badge>
        )}
      </div>

      {/* Contato */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Informações de contato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {cliente.whatsapp && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-3.5 shrink-0" />
              <span>{formatPhone(cliente.whatsapp)}</span>
            </div>
          )}
          {cliente.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="size-3.5 shrink-0" />
              <span className="truncate">{cliente.email}</span>
            </div>
          )}
          {(cliente.cidade || cliente.estado) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span>{[cliente.cidade, cliente.estado].filter(Boolean).join(' - ')}</span>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">Portal do cliente:</span>
            <Badge variant={cliente.portalAtivo ? 'success' : 'outline'} className="text-xs">
              {cliente.portalAtivo ? 'Ativo' : 'Desativado'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Empréstimos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="size-4" />
            Empréstimos ativos ({emprestimosAtivos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!emprestimosAtivos.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum empréstimo ativo.</p>
          ) : (
            <div className="divide-y">
              {emprestimosAtivos.map(loan => {
                const st = STATUS_LOAN[loan.status] ?? { label: loan.status, variant: 'outline' as const }
                return (
                  <div key={loan.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{formatCurrency(loan.valor)}</p>
                      <p className="text-xs text-muted-foreground">
                        {loan.numeroParcelas}x · Início {formatDate(loan.dataInicio)}
                      </p>
                      {loan.installments.length > 0 && (
                        <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
                          <AlertCircle className="size-3" />
                          {loan.installments.length} parcela{loan.installments.length !== 1 ? 's' : ''} em atraso
                        </p>
                      )}
                    </div>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cobranças */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="size-4" />
              Histórico de cobranças
            </CardTitle>
            {!showForm && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowForm(true)}>
                <Plus className="size-3.5" />Registrar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showForm && (
            <form onSubmit={handleSubmit(d => mutation.mutateAsync(d))} className="space-y-3 p-3 rounded-lg border bg-muted/20">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium">Novo contato de cobrança</p>
                <button type="button" onClick={() => { setShowForm(false); reset() }}
                  className="text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Parcela em atraso *</Label>
                <Select {...register('installmentId')}>
                  <option value="">Selecione a parcela</option>
                  {parcelasAtrasadas?.map(p => (
                    <option key={p.id} value={p.id}>
                      Parcela {p.numero} · {formatCurrency(p.valor)} · venc. {formatDate(p.dataVencimento)}
                    </option>
                  ))}
                </Select>
                {errors.installmentId && <p className="text-xs text-destructive">{errors.installmentId.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Canal *</Label>
                  <Select {...register('canal')}>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="ligacao">Ligação</option>
                    <option value="presencial">Presencial</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Resultado *</Label>
                  <Select {...register('resultado')}>
                    <option value="prometeu_pagar">Prometeu pagar</option>
                    <option value="nao_atendeu">Não atendeu</option>
                    <option value="numero_incorreto">Nº incorreto</option>
                    <option value="outro">Outro</option>
                  </Select>
                </div>
              </div>

              {resultado === 'prometeu_pagar' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Prometeu pagar em</Label>
                  <Input type="date" className="h-9 text-sm" {...register('prometeuPagarEm')} />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Observação (opcional)</Label>
                <Textarea rows={2} placeholder="Detalhes do contato..." {...register('observacao')} />
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="flex-1"
                  onClick={() => { setShowForm(false); reset() }}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" className="flex-1" disabled={isSubmitting || mutation.isPending}>
                  {mutation.isPending ? 'Salvando...' : 'Registrar'}
                </Button>
              </div>
            </form>
          )}

          {!cliente.cobrancaContatos.length && !showForm ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma cobrança registrada.</p>
          ) : (
            <div className="divide-y">
              {cliente.cobrancaContatos.map(c => {
                const res = RESULTADO_CONFIG[c.resultado] ?? RESULTADO_CONFIG.outro
                return (
                  <div key={c.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={res.variant} className="text-xs">{res.label}</Badge>
                        <Badge variant="outline" className="text-xs">{CANAL_LABEL[c.canal] ?? c.canal}</Badge>
                        {c.prometeuPagarEm && (
                          <span className="text-xs text-amber-700">Pagará em {formatDate(c.prometeuPagarEm)}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDate(c.createdAt)}</span>
                    </div>
                    {c.installment && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Parcela #{c.installment.numero} — {formatCurrency(c.installment.valor)} · Venc. {formatDate(c.installment.dataVencimento)}
                      </p>
                    )}
                    {c.observacao && (
                      <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{c.observacao}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
