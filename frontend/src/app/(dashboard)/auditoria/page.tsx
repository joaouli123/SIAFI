'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Shield, RefreshCw, Search, ChevronDown, ChevronRight, Mail, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'
import api from '@/lib/api'

interface AuditLog {
  id: number
  acao: string
  entidade: string
  entidadeId: number
  dados: any
  dadosAntes: any
  dadosDepois: any
  contexto: any
  ip: string
  createdAt: string
  user?: { nome: string }
}
interface AuditResponse { data: AuditLog[]; total: number; page: number; lastPage: number }

function acaoBadge(acao: string) {
  const a = acao.toUpperCase()
  if (a.includes('FALHOU') || a.includes('ERRO') || a.includes('BLOQUEADO') || a.includes('NEGADO'))
    return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700"><XCircle className="size-3" />{acao}</span>
  if (a.includes('ENVIADO') || a.includes('ATIVADO') || a.includes('APROVADO') || a.includes('CONFIRMADO') || a.includes('EXECUTADO') || a.includes('LIBERADO'))
    return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700"><CheckCircle className="size-3" />{acao}</span>
  if (a.includes('IGNORADO') || a.includes('AVISO') || a.includes('PENDENTE'))
    return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700"><AlertTriangle className="size-3" />{acao}</span>
  if (a.includes('EMAIL'))
    return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700"><Mail className="size-3" />{acao}</span>
  return <Badge variant="outline" className="text-xs font-mono">{acao}</Badge>
}

function entidadeBadge(entidade: string, entidadeId?: number) {
  const COLORS: Record<string, string> = {
    client: 'bg-blue-100 text-blue-700',
    clients: 'bg-blue-100 text-blue-700',
    loan: 'bg-purple-100 text-purple-700',
    loans: 'bg-purple-100 text-purple-700',
    payment: 'bg-green-100 text-green-700',
    payments: 'bg-green-100 text-green-700',
    transaction: 'bg-orange-100 text-orange-700',
    user: 'bg-slate-100 text-slate-700',
    email: 'bg-sky-100 text-sky-700',
    queue: 'bg-violet-100 text-violet-700',
  }
  const cls = COLORS[entidade] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {entidade}{entidadeId ? ` #${entidadeId}` : ''}
    </span>
  )
}

function ExpandedDetail({ log }: { log: AuditLog }) {
  const sections: { label: string; data: any }[] = []
  if (log.contexto && Object.keys(log.contexto).length) sections.push({ label: 'Contexto', data: log.contexto })
  if (log.dadosDepois && Object.keys(log.dadosDepois).length) sections.push({ label: 'Dados Depois', data: log.dadosDepois })
  if (log.dadosAntes && Object.keys(log.dadosAntes).length) sections.push({ label: 'Dados Antes', data: log.dadosAntes })
  if (log.dados && Object.keys(log.dados).length) sections.push({ label: 'Dados', data: log.dados })

  if (!sections.length) return <p className="text-xs text-muted-foreground italic">Sem detalhes adicionais</p>

  return (
    <div className="flex flex-wrap gap-4">
      {sections.map(({ label, data }) => (
        <div key={label} className="min-w-[220px]">
          <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
          <div className="bg-muted/40 rounded-lg p-3 text-xs font-mono space-y-1">
            {Object.entries(data).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">{k}:</span>
                <span className={`break-all ${k.toLowerCase().includes('erro') || k.toLowerCase().includes('error') ? 'text-red-600 font-semibold' : ''}`}>
                  {v === null ? 'null' : v === true ? 'true' : v === false ? 'false' : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AuditRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false)
  const hasDetails = !!(
    (log.contexto && Object.keys(log.contexto).length) ||
    (log.dadosDepois && Object.keys(log.dadosDepois).length) ||
    (log.dadosAntes && Object.keys(log.dadosAntes).length) ||
    (log.dados && Object.keys(log.dados).length)
  )

  return (
    <>
      <tr
        className={`border-b border-border transition-colors ${hasDetails ? 'cursor-pointer hover:bg-muted/20' : ''} ${open ? 'bg-muted/10' : ''}`}
        onClick={() => hasDetails && setOpen((o) => !o)}
      >
        <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
        <td className="px-4 py-2.5 font-medium text-sm">{log.user?.nome ?? 'Sistema'}</td>
        <td className="px-4 py-2.5">{acaoBadge(log.acao)}</td>
        <td className="px-4 py-2.5">{entidadeBadge(log.entidade, log.entidadeId)}</td>
        <td className="px-4 py-2.5 text-muted-foreground text-xs hidden xl:table-cell">{log.ip ?? '—'}</td>
        <td className="px-4 py-2.5 text-center w-8">
          {hasDetails && (
            open
              ? <ChevronDown className="size-3.5 text-muted-foreground" />
              : <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/5 border-b border-border">
          <td colSpan={6} className="px-6 py-4">
            <ExpandedDetail log={log} />
          </td>
        </tr>
      )}
    </>
  )
}

const ACOES_RAPIDAS = [
  'EMAIL_ENVIADO', 'EMAIL_FALHOU', 'EMAIL_IGNORADO',
  'PORTAL_ATIVADO', 'PORTAL_SENHA_REENVIADA',
  'LOGIN', 'LOGOUT',
]

export default function AuditoriaPage() {
  const [page, setPage] = useState(1)
  const [entidade, setEntidade] = useState('')
  const [acao, setAcao] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit', { page, entidade, acao }],
    queryFn: () => api.get<AuditResponse>('/audit', {
      params: { page, limit: 30, entidade: entidade || undefined, acao: acao || undefined },
    }).then((r) => r.data),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Shield className="size-6" />Auditoria</h1>
          <p className="text-muted-foreground text-sm mt-1">Registro de ações do sistema — clique em uma linha para ver detalhes</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2"><RefreshCw className="size-3.5" />Atualizar</Button>
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por ação (EMAIL_ENVIADO, LOGIN...)"
                value={acao}
                onChange={(e) => { setAcao(e.target.value.toUpperCase()); setPage(1) }}
                className="pl-9 font-mono text-sm"
              />
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por entidade (client, email, loan...)"
                value={entidade}
                onChange={(e) => { setEntidade(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ACOES_RAPIDAS.map((a) => (
              <button
                key={a}
                onClick={() => { setAcao(acao === a ? '' : a); setPage(1) }}
                className={`text-xs px-2 py-1 rounded-full border font-mono transition-colors ${
                  acao === a
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : isError ? (
            <div className="p-8 text-center text-muted-foreground"><p>Erro ao carregar logs.</p><Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">Tentar novamente</Button></div>
          ) : !data?.data.length ? (
            <div className="p-8 text-center"><Shield className="size-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground text-sm">Nenhum registro encontrado.</p></div>
          ) : (
            <div className="tabela-rolavel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Data/Hora</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuário</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ação</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Entidade</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">IP</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((log) => <AuditRow key={log.id} log={log} />)}
                </tbody>
              </table>
            </div>
          )}

          {data && data.lastPage > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">{data.total} registro{data.total !== 1 ? 's' : ''}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <span className="flex items-center text-sm text-muted-foreground px-2">{page} / {data.lastPage}</span>
                <Button variant="outline" size="sm" disabled={page === data.lastPage} onClick={() => setPage((p) => p + 1)}>Próximo</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
