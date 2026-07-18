'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { MessageSquare, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'
import api from '@/lib/api'

interface Ticket {
  id: number; assunto: string; mensagem: string; status: string; resposta: string; createdAt: string
  client: { id: number; nome: string }
}

export default function SuportePage() {
  const { data: tickets, isLoading, isError, refetch } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => api.get<Ticket[]>('/support/tickets').then((r) => r.data).catch(() => [] as Ticket[]),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><MessageSquare className="size-6" />Suporte</h1>
          <p className="text-muted-foreground text-sm mt-1">Tickets de atendimento dos clientes</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2"><RefreshCw className="size-3.5" />Atualizar</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : isError || !tickets?.length ? (
            <div className="p-8 text-center">
              <MessageSquare className="size-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">Nenhum ticket de suporte aberto.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assunto</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Data</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id} className="border-b border-border hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground">#{t.id}</td>
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/clientes/${t.client?.id}`} className="hover:underline">{t.client?.nome ?? '—'}</Link>
                      </td>
                      <td className="px-4 py-3">{t.assunto}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">{formatDateTime(t.createdAt)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={t.status === 'aberto' ? 'warning' : 'success'}>
                          {t.status === 'aberto' ? 'Aberto' : 'Fechado'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
