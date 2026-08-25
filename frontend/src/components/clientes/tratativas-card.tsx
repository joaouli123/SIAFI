'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Phone, MessageCircle, MapPin, Mail, Trash2, User } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/auth.context'
import { formatDateTime } from '@/lib/utils'

export interface Tratativa {
  id: number
  canal: string
  descricao: string
  createdAt: string
  user: { id: number; nome: string; role: string }
}

const CANAIS: Record<string, { label: string; icone: typeof Phone }> = {
  telefone: { label: 'Telefone', icone: Phone },
  whatsapp: { label: 'WhatsApp', icone: MessageCircle },
  visita: { label: 'Visita técnica', icone: MapPin },
  presencial: { label: 'Presencial', icone: User },
  email: { label: 'E-mail', icone: Mail },
  outro: { label: 'Outro', icone: ClipboardList },
}

export const LABEL_CANAL: Record<string, string> = Object.fromEntries(
  Object.entries(CANAIS).map(([valor, { label }]) => [valor, label]),
)

export function TratativasCard({ clientId, className }: { clientId: number; className?: string }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [canal, setCanal] = useState('telefone')
  const [descricao, setDescricao] = useState('')

  const { data: tratativas, isLoading } = useQuery<Tratativa[]>({
    queryKey: ['tratativas', clientId],
    queryFn: () => api.get(`/clients/${clientId}/tratativas`).then((r) => r.data),
  })

  const registrar = useMutation({
    mutationFn: () =>
      api.post(`/clients/${clientId}/tratativas`, { canal, descricao: descricao.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tratativas', clientId] })
      setDescricao('')
      toast.success('Tratativa registrada')
    },
    onError: () => toast.error('Não foi possível registrar a tratativa'),
  })

  const remover = useMutation({
    mutationFn: (id: number) => api.delete(`/clients/${clientId}/tratativas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tratativas', clientId] })
      toast.success('Tratativa removida')
    },
    onError: () => toast.error('Não foi possível remover a tratativa'),
  })

  const podeRemover = (t: Tratativa) =>
    t.user.id === user?.id || user?.role === 'admin' || user?.role === 'financeiro'

  const texto = descricao.trim()

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="size-4 text-muted-foreground" />
            Tratativas
            {!isLoading && (tratativas?.length ?? 0) > 0 && (
              <span className="font-normal text-sm text-muted-foreground">
                {tratativas?.length} registro(s)
              </span>
            )}
          </CardTitle>
          {tratativas?.[0] && (
            <span className="text-xs text-muted-foreground">
              Última: {formatDateTime(tratativas[0].createdAt)}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2 print:hidden">
          <div className="flex gap-2 flex-wrap">
            <Select
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              className="w-full sm:w-48"
            >
              {Object.entries(CANAIS).map(([valor, { label }]) => (
                <option key={valor} value={valor}>{label}</option>
              ))}
            </Select>
          </div>
          <Textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="O que foi tratado com o cliente? Ex.: ligação em 24/08, cliente pediu para reagendar a parcela 5 para o dia 30."
          />
          <div className="flex justify-between items-center gap-3">
            <span className="text-xs text-muted-foreground">
              O registro fica com seu nome e a data — não substitui os anteriores.
            </span>
            <Button
              size="sm"
              onClick={() => registrar.mutate()}
              disabled={texto.length < 3 || registrar.isPending}
            >
              {registrar.isPending ? 'Registrando...' : 'Registrar tratativa'}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : !tratativas?.length ? (
          <p className="text-sm text-muted-foreground py-2">
            Nenhuma tratativa registrada para este cliente.
          </p>
        ) : (
          <div className="space-y-2 max-h-[24rem] overflow-y-auto print:max-h-none print:overflow-visible">
            {tratativas.map((t) => {
              const { label, icone: Icone } = CANAIS[t.canal] ?? CANAIS.outro
              return (
                <div key={t.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Icone className="size-3" /> {label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {t.user.nome} · {formatDateTime(t.createdAt)}
                      </span>
                    </div>
                    {podeRemover(t) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive print:hidden"
                        disabled={remover.isPending}
                        onClick={() => {
                          if (confirm('Remover esta tratativa?')) remover.mutate(t.id)
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm mt-2 whitespace-pre-wrap">{t.descricao}</p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
