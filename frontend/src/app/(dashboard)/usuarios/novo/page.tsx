'use client'

import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Save, Users, Briefcase, Calculator, ShieldCheck, User,
  AlertTriangle, Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

const schema = z.object({
  nome:     z.string().min(3, 'Nome deve ter ao menos 3 caracteres'),
  username: z.string().min(3, 'Username deve ter ao menos 3 caracteres')
              .regex(/^[a-z0-9_.]+$/, 'Use apenas letras minúsculas, números, . e _'),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  role:     z.enum(['admin', 'financeiro', 'consultor', 'caixa', 'cliente']),
})
type FormData = z.infer<typeof schema>

const ROLES = [
  {
    value: 'caixa',
    label: 'Caixa',
    icon: Calculator,
    description: 'Registra pagamentos, libera capital e consulta clientes.',
    color: 'blue',
  },
  {
    value: 'consultor',
    label: 'Consultor',
    icon: Briefcase,
    description: 'Gerencia carteira de clientes, cria intenções e solicita reparcelamentos.',
    color: 'green',
    warning: 'Após criar, vincule os clientes a este consultor na lista de Clientes (botão "Vincular" na coluna Consultor) ou abrindo o cliente, no card Consultor.',
  },
  {
    value: 'financeiro',
    label: 'Financeiro',
    icon: Users,
    description: 'Acesso operacional completo: empréstimos, relatórios, liberações e análises.',
    color: 'purple',
  },
  {
    value: 'admin',
    label: 'Administrador',
    icon: ShieldCheck,
    description: 'Acesso total ao sistema, incluindo usuários, configurações e auditoria.',
    color: 'red',
    warning: 'O perfil Admin tem acesso irrestrito. Use apenas para gestores da empresa.',
  },
  {
    value: 'cliente',
    label: 'Cliente (Portal)',
    icon: User,
    description: 'Acesso somente ao portal do cliente: contratos, parcelas e suporte.',
    color: 'gray',
    warning: 'Clientes são normalmente ativados via portal ao aprovar uma intenção.',
  },
] as const

const colorClass: Record<string, string> = {
  blue:   'border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800',
  green:  'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800',
  purple: 'border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800',
  red:    'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800',
  gray:   'border-border bg-muted/30',
}

const iconColorClass: Record<string, string> = {
  blue:   'text-blue-600 bg-blue-100 dark:bg-blue-900/40',
  green:  'text-green-600 bg-green-100 dark:bg-green-900/40',
  purple: 'text-purple-600 bg-purple-100 dark:bg-purple-900/40',
  red:    'text-red-600 bg-red-100 dark:bg-red-900/40',
  gray:   'text-muted-foreground bg-muted',
}

export default function NovoUsuarioPage() {
  const router = useRouter()
  const qc = useQueryClient()

  const { register, handleSubmit, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { role: 'caixa' },
  })

  const selectedRole = useWatch({ control, name: 'role' })
  const roleInfo = ROLES.find(r => r.value === selectedRole)

  const mutation = useMutation({
    mutationFn: (data: FormData) => api.post('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      router.push('/usuarios')
    },
  })

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-4">
        <Link href="/usuarios">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="size-4" />Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novo Usuário</h1>
          <p className="text-muted-foreground text-sm">Criar operador do sistema</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-5">
        {mutation.isError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            Erro ao criar usuário. Username pode já estar em uso.
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Dados de Acesso</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome completo <span className="text-destructive">*</span></Label>
              <Input {...register('nome')} placeholder="Nome do operador" />
              {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Username (login) <span className="text-destructive">*</span></Label>
                <Input {...register('username')} placeholder="usuario.nome" />
                {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Senha <span className="text-destructive">*</span></Label>
                <Input type="password" {...register('password')} placeholder="Mínimo 8 caracteres" />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Perfil de Acesso</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select {...register('role')}>
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
            {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}

            {/* Descrição do perfil selecionado */}
            {roleInfo && (
              <div className={cn('rounded-lg border px-4 py-3 space-y-2', colorClass[roleInfo.color])}>
                <div className="flex items-center gap-2">
                  <div className={cn('rounded-md p-1.5', iconColorClass[roleInfo.color])}>
                    <roleInfo.icon className="size-4" />
                  </div>
                  <span className="text-sm font-semibold">{roleInfo.label}</span>
                </div>
                <p className="text-sm text-muted-foreground">{roleInfo.description}</p>
                {'warning' in roleInfo && roleInfo.warning && (
                  <div className="flex items-start gap-2 pt-1">
                    <Info className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">{roleInfo.warning}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/usuarios"><Button variant="outline" type="button">Cancelar</Button></Link>
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            <Save className="size-4" />{mutation.isPending ? 'Criando...' : 'Criar Usuário'}
          </Button>
        </div>
      </form>
    </div>
  )
}
