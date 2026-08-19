'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, Loader2, Send, MessageSquare, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import api from '@/lib/api'

const CATEGORIAS = [
  'Dúvida sobre operação do sistema',
  'Problema técnico',
  'Solicitação de acesso ou permissão',
  'Dúvida sobre pagamento ou caixa',
  'Solicitação de estorno',
  'Outro',
]

interface AdminUser { id: number; nome: string }

export default function NovoSuporteInternoPage() {
  const [categoria, setCategoria] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  const { data: admins } = useQuery<AdminUser[]>({
    queryKey: ['users-admins'],
    queryFn: () => api.get<AdminUser[]>('/users/admins').then(r => r.data),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!categoria) throw new Error('Selecione uma categoria.')
      if (mensagem.trim().length < 10) throw new Error('Mensagem muito curta (mínimo 10 caracteres).')

      const adminId = Array.isArray(admins) ? admins[0]?.id : undefined

      if (!adminId) throw new Error('Nenhum administrador disponível. Use o Comunicador Interno para enviar uma mensagem diretamente.')

      const { data: conversa } = await api.post<{ id: number }>('/mensagens/conversas', { targetUserId: adminId })
      const conteudo = `📋 SUPORTE — ${categoria}\n\n${mensagem.trim()}`
      await api.post(`/mensagens/conversas/${conversa.id}`, { conteudo })
    },
    onSuccess: () => setEnviado(true),
    onError: (err: any) => setError(err?.message ?? 'Erro ao enviar. Tente novamente.'),
  })

  const canSubmit = categoria && mensagem.trim().length >= 10 && !mutation.isPending

  if (enviado) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
        <CheckCircle2 className="size-14 text-green-600 mx-auto" />
        <h2 className="text-xl font-semibold text-foreground">Chamado enviado com sucesso</h2>
        <p className="text-sm text-muted-foreground">
          Sua mensagem foi enviada para o administrador via Comunicador Interno.
          Você receberá uma resposta em breve.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Link href="/ajuda">
            <Button variant="outline">Voltar à Ajuda</Button>
          </Link>
          <Link href="/mensagens">
            <Button>Ver mensagens</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/ajuda">
          <Button variant="outline" size="icon"><ArrowLeft className="size-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="size-6" />Abrir chamado de suporte
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sua mensagem será enviada para o administrador via Comunicador Interno.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo chamado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Categoria */}
          <div className="space-y-1.5">
            <Label htmlFor="categoria">Categoria *</Label>
            <Select id="categoria" value={categoria} onChange={e => { setCategoria(e.target.value); setError('') }}>
              <option value="">Selecione a categoria...</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>

          {/* Mensagem */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="mensagem">Mensagem *</Label>
              <span className={`text-xs ${mensagem.length > 900 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                {mensagem.length}/1000
              </span>
            </div>
            <Textarea
              id="mensagem"
              value={mensagem}
              onChange={e => { setMensagem(e.target.value.slice(0, 1000)); setError('') }}
              placeholder="Descreva detalhadamente sua dúvida ou problema..."
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">Mínimo 10 caracteres.</p>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Link href="/ajuda" className="flex-1">
              <Button variant="outline" className="w-full">Cancelar</Button>
            </Link>
            <Button
              className="flex-1 gap-2"
              disabled={!canSubmit}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending
                ? <><Loader2 className="size-4 animate-spin" />Enviando...</>
                : <><Send className="size-4" />Enviar chamado</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
