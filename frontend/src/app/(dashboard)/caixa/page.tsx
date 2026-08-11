'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Plus, RefreshCw, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, formatDateTimeLocal, hojeISODate } from '@/lib/utils'
import { toast } from 'sonner'
import api from '@/lib/api'

interface Transaction {
  id: number; tipo: 'entrada' | 'saida'; valor: number; descricao: string
  categoria: string; data: string; user?: { nome: string }
}
interface Saldo { entradas: number; saidas: number; saldo: number }

export default function CaixaPage() {
  const [showForm, setShowForm] = useState(false)
  const [tipo, setTipo] = useState('')
  const qc = useQueryClient()

  const { data: saldo, isLoading: loadSaldo } = useQuery({
    queryKey: ['transactions', 'saldo'],
    queryFn: () => api.get<Saldo>('/transactions/saldo').then((r) => r.data),
  })

  const { data: transactions, isLoading, refetch } = useQuery({
    queryKey: ['transactions', { tipo }],
    // /transactions responde paginado ({ data, meta, ... }); extrai o array (aceita array simples também)
    queryFn: () => api.get<{ data: Transaction[] } | Transaction[]>('/transactions', { params: { tipo: tipo || undefined, limit: 50 } })
      .then((r) => (Array.isArray(r.data) ? r.data : r.data.data)),
  })

  const [form, setForm] = useState({ tipo: 'entrada', valor: '', descricao: '', categoria: '', data: hojeISODate() })

  const createMut = useMutation({
    mutationFn: () => api.post('/transactions', { ...form, valor: Number(form.valor) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      setShowForm(false)
      setForm({ tipo: 'entrada', valor: '', descricao: '', categoria: '', data: hojeISODate() })
      toast.success(`Transação registrada com sucesso`)
    },
    onError: () => toast.error('Não foi possível registrar a transação. Tente novamente.'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Caixa</h1><p className="text-muted-foreground text-sm">Movimentação financeira</p></div>
        <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="size-4" />Nova Transação</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loadSaldo ? (
          Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-10 w-full" /></CardContent></Card>)
        ) : (
          <>
            <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
              <CardContent className="pt-4"><p className="text-xs text-muted-foreground">Entradas</p><p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(saldo?.entradas ?? 0)}</p></CardContent>
            </Card>
            <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
              <CardContent className="pt-4"><p className="text-xs text-muted-foreground">Saídas</p><p className="text-2xl font-bold text-red-700 dark:text-red-400">{formatCurrency(saldo?.saidas ?? 0)}</p></CardContent>
            </Card>
            <Card className={saldo && saldo.saldo >= 0 ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200' : 'bg-red-50 dark:bg-red-950/20 border-red-200'}>
              <CardContent className="pt-4"><p className="text-xs text-muted-foreground">Saldo do Mês</p><p className={`text-2xl font-bold ${saldo && saldo.saldo >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700'}`}>{formatCurrency(saldo?.saldo ?? 0)}</p></CardContent>
            </Card>
          </>
        )}
      </div>

      {showForm && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardHeader><CardTitle className="text-base">Nova Transação</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" min="0.01" value={form.valor} onChange={(e) => setForm(f => ({ ...f, valor: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm(f => ({ ...f, data: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Input placeholder="Ex: Aluguel, Salário..." value={form.categoria} onChange={(e) => setForm(f => ({ ...f, categoria: e.target.value }))} />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label>Descrição *</Label>
                <Textarea rows={2} placeholder="Descrição da transação..." value={form.descricao} onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.descricao || !form.valor}>
                {createMut.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex gap-3">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-40">
              <option value="">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="saida">Saídas</option>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2"><RefreshCw className="size-3.5" />Atualizar</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !transactions?.length ? (
            <div className="p-8 text-center"><DollarSign className="size-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground text-sm">Nenhuma transação encontrada.</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Categoria</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Usuário</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Data</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-border hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {t.tipo === 'entrada' ? <TrendingUp className="size-4 text-green-500 flex-shrink-0" /> : <TrendingDown className="size-4 text-red-500 flex-shrink-0" />}
                        <span className="font-medium">{t.descricao}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{t.categoria || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{t.user?.nome ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatDateTimeLocal(t.data)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${t.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                      {t.tipo === 'entrada' ? '+' : '-'}{formatCurrency(t.valor)}
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
