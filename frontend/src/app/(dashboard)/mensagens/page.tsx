'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, MessageSquare, Users, Plus, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'
import { useAuth } from '@/contexts/auth.context'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Participante { id: number; nome: string; role: string }
interface UltimaMsg    { id: number; conteudo: string; createdAt: string; remetenteId: number }
interface Conversa {
  id: number; titulo: string | null; tipo: string; naoLidas: number; arquivada: boolean
  updatedAt: string; createdAt: string; minhaultimaLeitura: string | null
  participantes: { userId: number; role: string; user: Participante }[]
  mensagens: UltimaMsg[]
}
interface Mensagem {
  id: number; conteudo: string; tipo: string; createdAt: string; remetenteId: number
  remetente: { id: number; nome: string; role: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  admin: 'Adm', financeiro: 'Fin', consultor: 'Con', caixa: 'Cx', cliente: 'CLI',
}

function Avatar({ nome, role }: { nome: string; role: string }) {
  const initials = nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  const colors: Record<string, string> = {
    admin: 'bg-purple-600', financeiro: 'bg-blue-600',
    consultor: 'bg-green-600', caixa: 'bg-orange-500', cliente: 'bg-slate-500',
  }
  return (
    <div className={`w-8 h-8 rounded-full ${colors[role] ?? 'bg-slate-500'} flex items-center justify-center shrink-0`}>
      <span className="text-white text-xs font-semibold">{initials}</span>
    </div>
  )
}

function conversaTitulo(conversa: Conversa, myId: number) {
  if (conversa.titulo) return conversa.titulo
  const outros = conversa.participantes.filter(p => p.userId !== myId)
  return outros.map(p => p.user.nome).join(', ') || 'Conversa'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MensagensPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [conversaSelecionada, setConversaSelecionada] = useState<number | null>(null)
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  const [showNovaConversa, setShowNovaConversa] = useState(false)
  const [targetUserId, setTargetUserId] = useState('')

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: conversas = [], isLoading: convLoading } = useQuery({
    queryKey: ['conversas'],
    queryFn: () => api.get<Conversa[]>('/mensagens/conversas').then(r => r.data),
    refetchInterval: 10_000,
  })

  const { data: mensagens = [], isLoading: msgLoading } = useQuery({
    queryKey: ['mensagens', conversaSelecionada],
    queryFn: () => conversaSelecionada
      ? api.get<Mensagem[]>(`/mensagens/conversas/${conversaSelecionada}`).then(r => r.data)
      : Promise.resolve([]),
    enabled: !!conversaSelecionada,
    refetchInterval: false,
  })

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-minimal'],
    queryFn: () => api.get<{ id: number; nome: string; role: string }[]>('/users/internos').then(r => r.data),
    enabled: showNovaConversa,
  })

  // ── Mutations ────────────────────────────────────────────────────────────

  const enviarMut = useMutation({
    mutationFn: ({ id, conteudo }: { id: number; conteudo: string }) =>
      api.post(`/mensagens/conversas/${id}`, { conteudo }),
    onSuccess: (res) => {
      const nova = (res as any).data as Mensagem
      qc.setQueryData<Mensagem[]>(['mensagens', conversaSelecionada], old =>
        old ? [...old, nova] : [nova]
      )
      qc.invalidateQueries({ queryKey: ['conversas'] })
      setTexto('')
    },
  })

  const criarConvMut = useMutation({
    mutationFn: (tId: number) => api.post<Conversa>('/mensagens/conversas', { targetUserId: tId }),
    onSuccess: (res) => {
      const conv = (res as any).data as Conversa
      qc.invalidateQueries({ queryKey: ['conversas'] })
      setConversaSelecionada(conv.id)
      setShowNovaConversa(false)
      setTargetUserId('')
    },
  })

  // ── Supabase Realtime ─────────────────────────────────────────────────────

  const addMsgFromRealtime = useCallback((_msg: unknown) => {
    qc.invalidateQueries({ queryKey: ['conversas'] })
  }, [qc])

  useEffect(() => {
    if (!conversaSelecionada) return

    const supabase = getSupabaseBrowserClient()
    const channel  = supabase.channel(`mensagens-${conversaSelecionada}`)
      .on(
        'postgres_changes' as any,
        {
          event:  'INSERT',
          schema: 'public',
          table:  'mensagens',
          filter: `conversa_id=eq.${conversaSelecionada}`,
        },
        (payload: any) => {
          const row = payload.new
          if (row.remetente_id === user?.id) return // já adicionado localmente
          // Buscar dados completos via invalidate (o remetente vem no include)
          qc.invalidateQueries({ queryKey: ['mensagens', conversaSelecionada] })
          qc.invalidateQueries({ queryKey: ['conversas'] })
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [conversaSelecionada, user?.id, qc, addMsgFromRealtime])

  // ── Scroll to bottom on new messages ──────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  // ─── Render ───────────────────────────────────────────────────────────────

  const conversasFiltradas = conversas.filter(c =>
    !busca || conversaTitulo(c, user?.id ?? 0).toLowerCase().includes(busca.toLowerCase())
  )

  const convAtual = conversas.find(c => c.id === conversaSelecionada) ?? null

  function enviar() {
    if (!texto.trim() || !conversaSelecionada) return
    enviarMut.mutate({ id: conversaSelecionada, conteudo: texto.trim() })
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-0 border border-border rounded-xl overflow-hidden">

      {/* ── Painel esquerdo: lista de conversas ────────────────────────── */}
      <div className={cn(
        'w-80 shrink-0 flex flex-col border-r border-border',
        conversaSelecionada ? 'hidden md:flex' : 'flex',
      )}>
        {/* Header */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Mensagens</h2>
            <Button size="icon-sm" variant="ghost" onClick={() => setShowNovaConversa(v => !v)}
              className="size-7">
              <Plus className="size-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-xs"
              placeholder="Buscar conversa..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>

          {/* Nova conversa */}
          {showNovaConversa && (
            <div className="flex gap-2">
              <Select className="flex-1" value={targetUserId} onChange={e => setTargetUserId(e.target.value)}>
                <option value="">Selecionar usuário...</option>
                {allUsers.filter(u => u.id !== user?.id).map(u => (
                  <option key={u.id} value={u.id}>{u.nome} ({ROLE_LABEL[u.role] ?? u.role})</option>
                ))}
              </Select>
              <Button size="sm" className="h-8 text-xs px-2"
                disabled={!targetUserId || criarConvMut.isPending}
                onClick={() => criarConvMut.mutate(Number(targetUserId))}>
                Iniciar
              </Button>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {convLoading ? (
            <div className="p-3 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : conversasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground">
              <MessageSquare className="size-8 opacity-30" />
              <p className="text-xs">Nenhuma conversa</p>
            </div>
          ) : (
            conversasFiltradas.map(conv => {
              const titulo    = conversaTitulo(conv, user?.id ?? 0)
              const ultimaMsg = conv.mensagens[0]
              const ativa     = conv.id === conversaSelecionada
              return (
                <button
                  key={conv.id}
                  onClick={() => setConversaSelecionada(conv.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors flex items-start gap-2.5',
                    ativa ? 'bg-primary/10' : 'hover:bg-muted/40',
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-muted border flex items-center justify-center shrink-0 mt-0.5">
                    <Users className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium truncate">{titulo}</span>
                      {conv.naoLidas > 0 && (
                        <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center px-1 font-semibold">
                          {conv.naoLidas > 9 ? '9+' : conv.naoLidas}
                        </span>
                      )}
                    </div>
                    {ultimaMsg && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {ultimaMsg.remetenteId === user?.id ? 'Você: ' : ''}{ultimaMsg.conteudo}
                      </p>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Painel direito: thread de mensagens ────────────────────────── */}
      {!conversaSelecionada ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <MessageSquare className="size-12 opacity-20" />
          <p className="text-sm">Selecione uma conversa para começar</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header da conversa */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-3">
            <button
              className="md:hidden text-muted-foreground hover:text-foreground mr-1"
              onClick={() => setConversaSelecionada(null)}
            >
              ←
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {convAtual ? conversaTitulo(convAtual, user?.id ?? 0) : ''}
              </p>
              {convAtual && (
                <p className="text-xs text-muted-foreground">
                  {convAtual.participantes.length} participante{convAtual.participantes.length !== 1 ? 's' : ''}
                  {convAtual.tipo !== 'direto' && convAtual.titulo && (
                    <span className="ml-2 capitalize text-muted-foreground/70">{convAtual.tipo}</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-3/4" />)}</div>
            ) : mensagens.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground">
                <MessageSquare className="size-8 opacity-20" />
                <p className="text-xs">Nenhuma mensagem ainda. Comece a conversa!</p>
              </div>
            ) : (
              mensagens.map(msg => {
                const isMine = msg.remetenteId === user?.id
                return (
                  <div key={msg.id} className={cn('flex gap-2.5', isMine ? 'flex-row-reverse' : 'flex-row')}>
                    {!isMine && <Avatar nome={msg.remetente.nome} role={msg.remetente.role} />}
                    <div className={cn('max-w-[70%] space-y-0.5', isMine ? 'items-end' : 'items-start', 'flex flex-col')}>
                      {!isMine && (
                        <p className="text-[10px] text-muted-foreground ml-1">
                          {msg.remetente.nome}
                          <span className="ml-1 opacity-60">{ROLE_LABEL[msg.remetente.role] ?? ''}</span>
                        </p>
                      )}
                      <div className={cn(
                        'rounded-2xl px-3 py-2 text-sm wrap-break-word',
                        isMine
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'bg-muted rounded-tl-sm',
                      )}>
                        {msg.conteudo}
                      </div>
                      <p className={cn('text-[10px] text-muted-foreground', isMine ? 'text-right' : 'text-left')}>
                        {formatDateTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input de envio */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Input
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder="Digite uma mensagem..."
                className="flex-1"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                maxLength={4000}
              />
              <Button
                size="sm"
                onClick={enviar}
                disabled={!texto.trim() || enviarMut.isPending}
                className="gap-1.5 px-3">
                <Send className="size-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Enter para enviar</p>
          </div>
        </div>
      )}
    </div>
  )
}
