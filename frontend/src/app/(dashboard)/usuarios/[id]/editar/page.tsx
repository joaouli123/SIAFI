'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/lib/api'

const schema = z.object({
  nome: z.string().min(3),
  username: z.string().min(3),
  password: z.string().min(8).optional().or(z.literal('')),
  role: z.enum(['admin', 'financeiro', 'consultor', 'caixa', 'cliente']),
  active: z.boolean(),
})
type FormData = z.infer<typeof schema>

export default function EditarUsuarioPage() {
  const { id } = useParams()
  const router = useRouter()
  const qc = useQueryClient()

  const { data: user, isLoading } = useQuery({
    queryKey: ['users', id],
    queryFn: () => api.get<any>(`/users`).then((r) => (r.data as any[]).find((u) => u.id === Number(id))),
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  })

  useEffect(() => {
    if (user) reset({ nome: user.nome, username: user.username, role: user.role, active: user.active, password: '' })
  }, [user, reset])

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload: any = { nome: data.nome, username: data.username, role: data.role, active: data.active }
      if (data.password) payload.password = data.password
      return api.patch(`/users/${id}`, payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); router.push('/usuarios') },
  })

  if (isLoading) return <div className="space-y-4 w-full"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-4">
        <Link href="/usuarios"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="size-4" />Voltar</Button></Link>
        <div><h1 className="text-2xl font-bold tracking-tight">Editar Usuário</h1><p className="text-muted-foreground text-sm">{user?.nome}</p></div>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
        {mutation.isError && (
          <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">Erro ao salvar alterações.</div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Usuário</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label>Nome completo *</Label><Input {...register('nome')} />{errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}</div>
            <div className="space-y-1.5"><Label>Username *</Label><Input {...register('username')} />{errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}</div>
            <div className="space-y-1.5">
              <Label>Nova Senha <span className="text-muted-foreground text-xs">(deixe em branco para manter)</span></Label>
              <Input type="password" {...register('password')} placeholder="••••••••" />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Perfil *</Label>
              <Select {...register('role')}>
                <option value="caixa">Caixa</option>
                <option value="consultor">Consultor</option>
                <option value="financeiro">Financeiro</option>
                <option value="admin">Administrador</option>
                <option value="cliente">Cliente</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select {...register('active', { setValueAs: (v) => v === 'true' })}>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-4">
          <Link href="/usuarios"><Button variant="outline" type="button">Cancelar</Button></Link>
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            <Save className="size-4" />{mutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </form>
    </div>
  )
}
