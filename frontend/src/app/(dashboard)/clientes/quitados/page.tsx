'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { CheckCircle, RefreshCw, Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate, formatCPF, formatPhone } from '@/lib/utils'
import api from '@/lib/api'

interface ClienteQuitado {
  id: number
  nome: string
  cpf: string | null
  whatsapp: string | null
  email: string | null
  consultor: { id: number; nome: string } | null
  contratosQuitados: number
  contratosAtivos: number
  capitalEmprestado: number
  totalQuitado: number
  ultimaQuitacao: string | null
}

export default function ClientesQuitadosPage() {
  const [busca, setBusca] = useState('')

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['clients', 'quitados'],
    queryFn: () => api.get<ClienteQuitado[]>('/clients/quitados').then((r) => r.data),
  })

  const clientes = useMemo(() => {
    const lista = data ?? []
    const termo = busca.trim().toLowerCase()
    if (!termo) return lista
    const somenteDigitos = termo.replace(/\D/g, '')
    return lista.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (somenteDigitos.length > 0 && (c.cpf ?? '').includes(somenteDigitos)),
    )
  }, [data, busca])

  const totalQuitado = clientes.reduce((s, c) => s + Number(c.totalQuitado), 0)
  const contratos = clientes.reduce((s, c) => s + c.contratosQuitados, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CheckCircle className="size-6 text-green-600" />
            Clientes Quitados
          </h1>
          <p className="text-sm text-muted-foreground">Clientes com pelo menos um contrato quitado</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Não foi possível carregar a lista.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum cliente com contrato quitado até o momento.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="bg-green-50 dark:bg-green-950/20 border-green-200">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Clientes Quitados</p>
                <p className="text-2xl font-bold text-green-700">{clientes.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Contratos Quitados</p>
                <p className="text-2xl font-bold">{contratos}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Recebido</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(totalQuitado)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome ou CPF..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="tabela-rolavel">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground hidden md:table-cell whitespace-nowrap">CPF</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground min-w-[240px]">Cliente</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">WhatsApp</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Consultor</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Última quitação</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total Quitado</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map((c) => (
                      <tr key={c.id} className="border-b border-border hover:bg-muted/20">
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs hidden md:table-cell">
                          {c.cpf ? formatCPF(c.cpf) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <Link href={`/clientes/${c.id}`} className="hover:underline font-medium">
                              {c.nome}
                            </Link>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] bg-muted px-1 py-0.5 rounded text-muted-foreground">
                                {c.contratosQuitados} quitado{c.contratosQuitados !== 1 ? 's' : ''}
                              </span>
                              {c.contratosAtivos > 0 && (
                                <Badge variant="outline" className="text-[10px]">
                                  {c.contratosAtivos} ativo{c.contratosAtivos !== 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                          {c.whatsapp ? formatPhone(c.whatsapp) : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                          {c.consultor?.nome ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          {c.ultimaQuitacao ? formatDate(c.ultimaQuitacao) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-700">
                          {formatCurrency(c.totalQuitado)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/clientes/${c.id}`}>
                            <Button size="sm" variant="outline" className="h-7 text-xs">Ver</Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {clientes.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Nenhum cliente encontrado para a busca.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
