'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Phone, Plus, X } from 'lucide-react'
import api from '@/lib/api'
import { useAuth } from '@/contexts/auth.context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ClienteCombobox } from '@/components/ui/cliente-combobox'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Cobranca {
  id: number
  canal: string
  resultado: string
  prometeuPagarEm: string | null
  observacao: string | null
  createdAt: string
  client: { nome: string }
  installment: { numero: number; installmentAmount: string; dataVencimento: string }
}

interface ClienteCarteira {
  id: number
  nome: string
  cpf?: string | null
}

interface Installment {
  id: number
  numero: number
  installmentAmount: string
  valorComEncargos?: string
  dataVencimento: string
  status: string
}

const criarSchema = z.object({
  clientId: z.coerce.number().int().positive('Selecione o cliente'),
  installmentId: z.coerce.number().int().positive('Selecione a parcela'),
  canal: z.enum(['whatsapp', 'ligacao', 'presencial']),
  resultado: z.enum(['prometeu_pagar', 'nao_atendeu', 'numero_incorreto', 'outro']),
  prometeuPagarEm: z.string().optional(),
  observacao: z.string().optional(),
})

type CriarForm = z.infer<typeof criarSchema>

const canalLabel: Record<string, string> = {
  whatsapp: 'WhatsApp',
  ligacao: 'Ligação',
  presencial: 'Presencial',
}

const resultadoConfig: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  prometeu_pagar: { label: 'Prometeu pagar', variant: 'default' },
  nao_atendeu: { label: 'Não atendeu', variant: 'secondary' },
  numero_incorreto: { label: 'Nº incorreto', variant: 'destructive' },
  outro: { label: 'Outro', variant: 'outline' },
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export default function CobrancasPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isConsultor = user?.role === 'consultor'

  const [showCriar, setShowCriar] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)

  const { data, isLoading } = useQuery<Cobranca[]>({
    queryKey: ['cobrancas'],
    queryFn: () => api.get('/consultor/cobrancas').then(r => r.data),
  })

  const { data: clientes } = useQuery<ClienteCarteira[]>({
    queryKey: ['consultor-carteira'],
    queryFn: () => api.get('/consultor/carteira').then(r => r.data),
    enabled: isConsultor,
  })

  const { data: parcelas } = useQuery<Installment[]>({
    queryKey: ['parcelas-atrasadas', selectedClientId],
    queryFn: () =>
      api.get('/installments/overdue', { params: { clientId: selectedClientId } })
        .then(r => r.data?.data ?? r.data),
    enabled: !!selectedClientId,
  })

  const criarForm = useForm<CriarForm>({
    resolver: zodResolver(criarSchema) as any,
    defaultValues: { canal: 'whatsapp', resultado: 'nao_atendeu' },
  })

  const criarMutation = useMutation({
    mutationFn: (dto: CriarForm) =>
      api.post('/consultor/cobrancas', {
        ...dto,
        prometeuPagarEm: dto.prometeuPagarEm || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobrancas'] })
      setShowCriar(false)
      criarForm.reset()
      setSelectedClientId(null)
    },
  })

  function handleClose() {
    setShowCriar(false)
    setSelectedClientId(null)
    criarForm.reset()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cobranças</h1>
          <p className="text-muted-foreground text-sm">Histórico de contatos de cobrança realizados.</p>
        </div>
        {isConsultor && (
          <Button onClick={() => setShowCriar(true)}>
            <Plus className="size-4 mr-2" />
            Registrar Cobrança
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : !data?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <Phone className="size-8 mb-2 opacity-40" />
            <p>Nenhuma cobrança registrada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map(c => {
            const res = resultadoConfig[c.resultado] ?? resultadoConfig.outro
            return (
              <Card key={c.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant={res.variant} className="text-xs">{res.label}</Badge>
                        <Badge variant="outline" className="text-xs">{canalLabel[c.canal] ?? c.canal}</Badge>
                        {c.prometeuPagarEm && (
                          <span className="text-xs text-muted-foreground">
                            Pagará em {formatDate(c.prometeuPagarEm)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium">{c.client.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Parcela {c.installment.numero} · {formatCurrency(c.installment.installmentAmount)} · venc. {formatDate(c.installment.dataVencimento)}
                      </p>
                      {c.observacao && (
                        <p className="text-sm text-slate-600 mt-1 italic">{c.observacao}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(c.createdAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal: Registrar Cobrança */}
      {showCriar && (
        <Modal title="Registrar Cobrança" onClose={handleClose}>
          <form
            onSubmit={criarForm.handleSubmit(dto => criarMutation.mutate(dto))}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <ClienteCombobox
                clientes={clientes ?? []}
                value={selectedClientId}
                onSelect={c => {
                  criarForm.setValue('clientId', (c?.id ?? 0) as any)
                  setSelectedClientId(c?.id ?? null)
                  criarForm.setValue('installmentId', 0 as any)
                }}
                placeholder="Digite o nome ou CPF do cliente..."
              />
              {criarForm.formState.errors.clientId && (
                <p className="text-xs text-destructive">{criarForm.formState.errors.clientId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Parcela em atraso</Label>
              <Select
                {...criarForm.register('installmentId')}
                disabled={!selectedClientId}
              >
                <option value="">
                  {selectedClientId ? 'Selecione a parcela' : 'Selecione o cliente primeiro'}
                </option>
                {parcelas?.map(p => (
                  <option key={p.id} value={p.id}>
                    Parcela {p.numero} · {formatCurrency(p.valorComEncargos ?? p.installmentAmount)} · venc. {formatDate(p.dataVencimento)}
                  </option>
                ))}
              </Select>
              {criarForm.formState.errors.installmentId && (
                <p className="text-xs text-destructive">{criarForm.formState.errors.installmentId.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Canal</Label>
                <Select {...criarForm.register('canal')}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="ligacao">Ligação</option>
                  <option value="presencial">Presencial</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Resultado</Label>
                <Select {...criarForm.register('resultado')}>
                  <option value="prometeu_pagar">Prometeu pagar</option>
                  <option value="nao_atendeu">Não atendeu</option>
                  <option value="numero_incorreto">Nº incorreto</option>
                  <option value="outro">Outro</option>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Prometeu pagar em (opcional)</Label>
              <Input type="date" {...criarForm.register('prometeuPagarEm')} />
            </div>

            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Textarea rows={2} placeholder="Detalhes do contato..." {...criarForm.register('observacao')} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button type="submit" disabled={criarMutation.isPending}>
                {criarMutation.isPending ? 'Salvando...' : 'Registrar'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
