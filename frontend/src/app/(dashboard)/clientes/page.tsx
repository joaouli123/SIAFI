'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Plus, Search, RefreshCw, Eye, Pencil, Trash2, Users, UserCheck, X, StickyNote, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { formatCPF, formatPhone, formatDate, hojeISODate } from '@/lib/utils'
import { useAuth } from '@/contexts/auth.context'
import api from '@/lib/api'

interface Consultor {
  id: number
  nome: string
}

interface Client {
  id: number
  nome: string
  cpf: string | null
  whatsapp: string | null
  email: string | null
  cidade: string | null
  estado: string | null
  active: boolean
  createdAt: string
  portalAtivo: boolean
  supabaseId: string | null
  consultor?: { id: number; nome: string } | null
  observacoes?: string | null
}

interface ClientsResponse {
  data: Client[]
  total: number
  page: number
  lastPage: number
}

function HoverObsPopover({ obs }: { obs: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-amber-500 hover:text-amber-600 cursor-pointer p-0.5"
        aria-label="Ver observação"
      >
        <StickyNote className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="font-semibold mb-1 text-xs text-foreground uppercase tracking-wider">Observações do Cliente</p>
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{obs}</p>
      </PopoverContent>
    </Popover>
  )
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function ClientesPage() {
  const { user } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState('')
  const [consultorFilter, setConsultorFilter] = useState('')
  const [page, setPage] = useState(1)
  const [vincularClient, setVincularClient] = useState<Client | null>(null)
  const [selectedConsultorId, setSelectedConsultorId] = useState<string>('')
  const [baixando, setBaixando] = useState(false)
  const qc = useQueryClient()

  const search = useDebounce(searchInput, 400)
  useEffect(() => { setPage(1) }, [search, status, consultorFilter])

  const canManage = user?.role === 'admin' || user?.role === 'financeiro'
  // Caixa nao tem a rota de exportacao (403); consultor exporta a propria carteira.
  const canExport = user?.role !== 'caixa'

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['clients', { search, status, consultorFilter, page }],
    queryFn: () =>
      api.get<ClientsResponse>('/clients', {
        params: {
          search: search || undefined,
          status: status || undefined,
          consultorId: consultorFilter || undefined,
          page,
          limit: 20,
        },
      }).then((r) => r.data),
  })

  const { data: consultores } = useQuery<Consultor[]>({
    queryKey: ['consultores'],
    queryFn: () => api.get<Consultor[]>('/clients/consultores').then((r) => r.data),
    enabled: canManage,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/clients/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success(`Cliente desativado com sucesso`)
    },
    onError: () => toast.error('Não foi possível desativar o cliente. Tente novamente.'),
  })

  const vincularMut = useMutation({
    mutationFn: ({ id, consultorId }: { id: number; consultorId: number | null }) =>
      api.patch(`/clients/${id}/vincular-consultor`, { consultorId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      setVincularClient(null)
      setSelectedConsultorId('')
      toast.success('Consultor vinculado com sucesso')
    },
    onError: () => toast.error('Não foi possível vincular o consultor. Tente novamente.'),
  })

  const baixarExcel = async () => {
    // A planilha sai com os mesmos filtros da tela — e o caso de uso e justamente
    // filtrar um consultor e imprimir a lista de clientes dele.
    setBaixando(true)
    try {
      const res = await api.get('/export/clientes/excel', {
        params: {
          search: search || undefined,
          status: status || undefined,
          consultorId: consultorFilter || undefined,
        },
        responseType: 'blob',
      })
      const nomeConsultor = consultores?.find((c) => String(c.id) === consultorFilter)?.nome
      const sufixo = nomeConsultor ? `-${nomeConsultor.replace(/\s+/g, '-').toLowerCase()}` : ''
      const a = document.createElement('a')
      a.href = URL.createObjectURL(
        new Blob([res.data as BlobPart], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      )
      a.download = `clientes${sufixo}-${hojeISODate()}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      toast.error('Nao foi possivel gerar a planilha. Tente novamente.')
    } finally {
      setBaixando(false)
    }
  }

  function handleDelete(id: number, nome: string) {
    if (confirm(`Desativar cliente "${nome}"?`)) deleteMut.mutate(id)
  }

  function handleVincular() {
    if (!vincularClient) return
    const consultorId = selectedConsultorId ? Number(selectedConsultorId) : null
    vincularMut.mutate({ id: vincularClient.id, consultorId })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de clientes cadastrados</p>
        </div>
        {canManage && (
          <Link href="/clientes/novo">
            <Button className="gap-2"><Plus className="size-4" />Novo Cliente</Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CPF ou WhatsApp..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
              <option value="">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </Select>
            {canManage && (
              <Select value={consultorFilter} onChange={(e) => setConsultorFilter(e.target.value)} className="w-48">
                <option value="">Consultor: Todos</option>
                {consultores?.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.nome}</option>
                ))}
              </Select>
            )}
            {canExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={baixarExcel}
                disabled={baixando || !data?.total}
                className="gap-2"
                title="Gerar planilha da lista de clientes (respeita os filtros da tela)"
              >
                <FileDown className="size-3.5" />{baixando ? 'Gerando...' : 'Excel'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="size-3.5" />Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>Erro ao carregar clientes.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">Tentar novamente</Button>
            </div>
          ) : !data?.data.length ? (
            <div className="p-8 text-center">
              <Users className="size-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm font-medium">
                {searchInput || status || consultorFilter ? 'Nenhum resultado para o filtro aplicado.' : 'Nenhum cliente cadastrado ainda.'}
              </p>
              {(searchInput || status || consultorFilter) ? (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearchInput(''); setStatus(''); setConsultorFilter('') }}>
                  Limpar filtros
                </Button>
              ) : canManage ? (
                <Link href="/clientes/novo">
                  <Button size="sm" className="mt-3 gap-1"><Plus className="size-3.5" />Novo cliente</Button>
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="tabela-rolavel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell whitespace-nowrap">CPF</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground min-w-[240px]">Nome</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">WhatsApp</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Consultor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Cadastro</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Portal</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Obs</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((c) => (
                    <tr key={c.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {c.cpf
                          ? formatCPF(c.cpf)
                          : <Badge variant="outline" className="text-xs font-normal">Não informado</Badge>}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{c.nome}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {c.whatsapp ? formatPhone(c.whatsapp) : <span className="text-xs text-muted-foreground italic">Sem WhatsApp</span>}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {c.consultor ? (
                          <span className="text-sm">{c.consultor.nome}</span>
                        ) : canManage ? (
                          <button
                              onClick={() => { setVincularClient(c); setSelectedConsultorId('') }}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <UserCheck className="size-3" />Vincular
                          </button>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">Sem consultor</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3 text-center hidden xl:table-cell">
                        {c.portalAtivo
                          ? <Badge variant="success">Ativo</Badge>
                          : c.supabaseId
                            ? <Badge variant="secondary">Desativado</Badge>
                            : <span className="text-muted-foreground text-xs italic">Inativo</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={c.active ? 'success' : 'outline'}>
                          {c.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.observacoes ? (
                          <HoverObsPopover obs={c.observacoes} />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/clientes/${c.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="size-3.5" /></Button>
                          </Link>
                          {canManage && (
                            <Link href={`/clientes/${c.id}/editar`}>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Pencil className="size-3.5" /></Button>
                            </Link>
                          )}
                          {canManage && (
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(c.id, c.nome)}
                              disabled={deleteMut.isPending}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                {data.total} cliente{data.total !== 1 ? 's' : ''}
                {status === 'active' ? ' ativos' : status === 'inactive' ? ' inativos' : ''}
              </p>
              {data.lastPage > 1 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                  <span className="flex items-center text-sm text-muted-foreground px-2">{page} / {data.lastPage}</span>
                  <Button variant="outline" size="sm" disabled={page === data.lastPage} onClick={() => setPage((p) => p + 1)}>Próximo</Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {vincularClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Vincular Consultor</h2>
              <button onClick={() => setVincularClient(null)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Cliente: <span className="font-medium text-foreground">{vincularClient.nome}</span>
            </p>
            <div className="space-y-1.5">
              <Label>Consultor</Label>
              <Select value={selectedConsultorId} onChange={(e) => setSelectedConsultorId(e.target.value)} className="w-full">
                <option value="">Sem consultor</option>
                {consultores?.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.nome}</option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setVincularClient(null)}>Cancelar</Button>
              <Button size="sm" onClick={handleVincular} disabled={vincularMut.isPending}>
                {vincularMut.isPending ? 'Salvando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
