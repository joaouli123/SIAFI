'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'
import api from '@/lib/api'

interface Notification {
  id: number; tipo: string; assunto: string; mensagem: string; status: string
  sentAt: string; createdAt: string
  client: { id: number; nome: string }
}
interface NotificationResponse { data: Notification[]; total: number; page: number; lastPage: number }

const TIPO_LABEL: Record<string, string> = { email: 'E-mail', whatsapp: 'WhatsApp', sms: 'SMS' }
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
  enviado: 'success', pendente: 'warning', erro: 'destructive',
}

export default function NotificacoesPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => api.get<NotificationResponse>('/notifications', { params: { page, limit: 30 } }).then((r) => r.data),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Bell className="size-6" />Notificações</h1>
          <p className="text-muted-foreground text-sm mt-1">Log de mensagens enviadas</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2"><RefreshCw className="size-3.5" />Atualizar</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : isError ? (
            <div className="p-8 text-center text-muted-foreground"><Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button></div>
          ) : !data?.data.length ? (
            <div className="p-8 text-center"><Bell className="size-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground text-sm">Nenhuma notificação registrada.</p></div>
          ) : (
            <div className="tabela-rolavel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Canal</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assunto</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((n) => (
                    <tr key={n.id} className="border-b border-border hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatDateTime(n.createdAt)}</td>
                      <td className="px-4 py-2.5 font-medium">{n.client?.nome ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-xs">{TIPO_LABEL[n.tipo] ?? n.tipo}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{n.assunto}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={STATUS_VARIANT[n.status] ?? 'outline'}>{n.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.lastPage > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">{data.total} notificações</p>
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
