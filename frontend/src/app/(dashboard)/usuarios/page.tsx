'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Plus, RefreshCw, UserCog, Pencil, UserX } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import api from '@/lib/api'

interface User {
  id: number; nome: string; username: string; role: string; active: boolean; createdAt: string; comissaoPercentual?: number | null
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador', financeiro: 'Financeiro', consultor: 'Consultor', caixa: 'Caixa', cliente: 'Cliente',
}
const ROLE_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'outline'> = {
  admin: 'default', financeiro: 'success', consultor: 'secondary', caixa: 'warning', cliente: 'outline',
}

export default function UsuariosPage() {
  const qc = useQueryClient()

  const { data: users, isLoading, isError, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users').then((r) => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  function handleDeactivate(id: number, nome: string) {
    if (confirm(`Desativar usuário "${nome}"?`)) deleteMut.mutate(id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><UserCog className="size-6" />Usuários</h1>
          <p className="text-muted-foreground text-sm mt-1">Operadores do sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2"><RefreshCw className="size-3.5" />Atualizar</Button>
          <Link href="/usuarios/novo"><Button className="gap-2"><Plus className="size-4" />Novo Usuário</Button></Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : isError ? (
            <div className="p-8 text-center text-muted-foreground"><Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button></div>
          ) : !users?.length ? (
            <div className="p-8 text-center"><UserCog className="size-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground text-sm">Nenhum usuário encontrado.</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Login</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Perfil</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Comissão</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Cadastro</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{u.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell font-mono text-xs">{u.username}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={ROLE_VARIANT[u.role] ?? 'outline'}>{ROLE_LABEL[u.role] ?? u.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell text-muted-foreground">
                      {(u.role === 'consultor' || u.role === 'admin') && u.comissaoPercentual != null ? `${Number(u.comissaoPercentual).toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={u.active ? 'success' : 'outline'}>{u.active ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link href={`/usuarios/${u.id}/editar`}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Pencil className="size-3.5" /></Button>
                        </Link>
                        {u.active && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDeactivate(u.id, u.nome)} disabled={deleteMut.isPending}>
                            <UserX className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
