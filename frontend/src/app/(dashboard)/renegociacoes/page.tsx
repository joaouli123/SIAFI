'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { RefreshCcw, Plus, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import api from '@/lib/api'

interface Renegociacao {
  id: number; valorTotal: number; numeroParcelas: number; taxaJuros: number
  dataInicio: string; observacoes: string; createdAt: string
  loan: { id: number; client: { id: number; nome: string; cpf: string } }
}

export default function RenegociacoesPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['renegociacoes'],
    queryFn: () => api.get<Renegociacao[]>('/renegociacoes').then((r) => r.data),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><RefreshCcw className="size-6" />Renegociações</h1>
          <p className="text-muted-foreground text-sm mt-1">Histórico de renegociações de dívida</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2"><RefreshCw className="size-3.5" />Atualizar</Button>
          <Link href="/renegociacoes/nova"><Button className="gap-2"><Plus className="size-4" />Nova Renegociação</Button></Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : isError ? (
            <div className="p-8 text-center text-muted-foreground"><Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button></div>
          ) : !data?.length ? (
            <div className="p-8 text-center"><RefreshCcw className="size-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground text-sm">Nenhuma renegociação registrada.</p></div>
          ) : (
            <div className="tabela-rolavel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Empréstimo</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor Total</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Parcelas</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Taxa</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/clientes/${r.loan?.client?.id}`} className="hover:underline">{r.loan?.client?.nome ?? '—'}</Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        <Link href={`/emprestimos/${r.loan?.id}`} className="hover:underline">#{r.loan?.id}</Link>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.valorTotal)}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground hidden lg:table-cell">{r.numeroParcelas}x</td>
                      <td className="px-4 py-3 text-center text-muted-foreground hidden lg:table-cell">{r.taxaJuros}% a.m.</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(r.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/emprestimos/${r.loan?.id}`}>
                          <Button size="sm" variant="outline" className="h-7 text-xs">Ver Emp.</Button>
                        </Link>
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
