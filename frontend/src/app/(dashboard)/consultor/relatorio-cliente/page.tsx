'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText, CheckCircle2, AlertTriangle, CalendarClock, Wallet, Printer, Search, Users,
} from 'lucide-react'
import api from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCPF, formatCurrency, formatDate } from '@/lib/utils'

interface ClienteOpt {
  id: number
  nome: string
  cpf?: string | null
  contratosAtivos: number
  parcelasAtrasadas: number
}

interface ParcelaRel {
  id: number
  numero: number
  valor: string
  dataVencimento: string
  dataPagamento: string | null
  status: string
  totalPago: string
  saldo: number
  multa: number
  mora: number
  totalDevido: number
  diasAtraso: number
}

interface ContratoRel {
  id: number
  status: string
  principalAmount: string
  totalReceivable: string
  numeroParcelas: number
  qtdQuitadasHistorico: number
  dataInicio: string
  metodoPagamento: string | null
  totalPago: number
  totalVencido: number
  totalAVencer: number
  pagas: ParcelaRel[]
  vencidas: ParcelaRel[]
  aVencer: ParcelaRel[]
}

interface RelatorioCliente {
  cliente: {
    id: number
    nome: string
    cpf: string | null
    whatsapp: string | null
    email: string | null
    cidade: string | null
    estado: string | null
    active: boolean
    consultor: { id: number; nome: string } | null
  }
  resumo: {
    totalContratos: number
    totalContratado: number
    totalPago: number
    totalVencido: number
    totalAVencer: number
    qtdPagas: number
    qtdVencidas: number
    qtdAVencer: number
    qtdQuitadasHistorico: number
  }
  contratos: ContratoRel[]
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  ativo: 'success',
  quitado: 'secondary',
  atrasado: 'destructive',
  cancelado: 'outline',
  aguardando_aceite: 'warning',
  aguardando_liberacao: 'warning',
}

function Kpi({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Wallet
  label: string
  value: string
  sub?: string
  tone: 'blue' | 'green' | 'red' | 'amber'
}) {
  const tones = {
    blue: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40',
    green: 'text-green-600 bg-green-50 dark:bg-green-950/40',
    red: 'text-red-600 bg-red-50 dark:bg-red-950/40',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
  }
  return (
    <Card>
      <CardContent className="pt-5 pb-5 flex items-center gap-3">
        <div className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function TabelaParcelas({
  titulo, icone: Icone, parcelas, tone, mostrarPagamento, mostrarAtraso,
}: {
  titulo: string
  icone: typeof Wallet
  parcelas: ParcelaRel[]
  tone: string
  mostrarPagamento?: boolean
  mostrarAtraso?: boolean
}) {
  if (!parcelas.length) {
    return (
      <div className="rounded-lg border p-4">
        <p className={`text-sm font-medium flex items-center gap-2 ${tone}`}>
          <Icone className="size-4" /> {titulo}
        </p>
        <p className="text-xs text-muted-foreground mt-2">Nenhuma parcela nesta situação.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="px-4 py-2.5 border-b bg-muted/40 flex items-center justify-between">
        <p className={`text-sm font-medium flex items-center gap-2 ${tone}`}>
          <Icone className="size-4" /> {titulo}
        </p>
        <Badge variant="outline">{parcelas.length}</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/20 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Parcela</th>
              <th className="text-left px-4 py-2 font-medium">Vencimento</th>
              {mostrarPagamento && <th className="text-left px-4 py-2 font-medium">Pagamento</th>}
              <th className="text-right px-4 py-2 font-medium">Valor</th>
              <th className="text-right px-4 py-2 font-medium">Pago</th>
              {mostrarAtraso && <th className="text-right px-4 py-2 font-medium">Multa/Mora</th>}
              {mostrarAtraso && <th className="text-right px-4 py-2 font-medium">Atraso</th>}
              <th className="text-right px-4 py-2 font-medium">
                {mostrarPagamento ? 'Total pago' : 'Total devido'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {parcelas.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{p.numero}</td>
                <td className="px-4 py-2">{formatDate(p.dataVencimento)}</td>
                {mostrarPagamento && (
                  <td className="px-4 py-2">{p.dataPagamento ? formatDate(p.dataPagamento) : '—'}</td>
                )}
                <td className="px-4 py-2 text-right">{formatCurrency(p.valor)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(p.totalPago)}</td>
                {mostrarAtraso && (
                  <td className="px-4 py-2 text-right text-red-600">
                    {formatCurrency(p.multa + p.mora)}
                  </td>
                )}
                {mostrarAtraso && (
                  <td className="px-4 py-2 text-right">{p.diasAtraso > 0 ? `${p.diasAtraso}d` : '—'}</td>
                )}
                <td className="px-4 py-2 text-right font-semibold">
                  {formatCurrency(mostrarPagamento ? p.totalPago : p.totalDevido)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function RelatorioClientePage() {
  const [clientId, setClientId] = useState<number | null>(null)
  const [busca, setBusca] = useState('')

  const { data: clientes, isLoading: loadingClientes } = useQuery<ClienteOpt[]>({
    queryKey: ['consultor-clientes-relatorio'],
    queryFn: () => api.get('/consultor/clientes').then((r) => r.data),
  })

  const { data, isLoading } = useQuery<RelatorioCliente>({
    queryKey: ['relatorio-cliente', clientId],
    queryFn: () => api.get(`/consultor/relatorio-cliente/${clientId}`).then((r) => r.data),
    enabled: !!clientId,
  })

  const q = busca.trim().toLowerCase()
  const qd = q.replace(/\D/g, '')
  const clientesFiltrados = (clientes ?? []).filter((c) => {
    if (!q) return true
    if (c.nome.toLowerCase().includes(q)) return true
    const cpf = c.cpf ?? ''
    return cpf.includes(busca.trim()) || (qd.length > 0 && cpf.replace(/\D/g, '').includes(qd))
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Relatório do Cliente</h1>
          <p className="text-muted-foreground text-sm">
            Contratos do cliente com parcelas pagas, vencidas e a vencer.
          </p>
        </div>
        {data && (
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4 mr-2" />
            Imprimir
          </Button>
        )}
      </div>

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              Sua carteira
              {!loadingClientes && (
                <span className="font-normal text-sm text-muted-foreground">
                  {clientes?.length ?? 0} cliente(s)
                </span>
              )}
            </CardTitle>
            {(clientes?.length ?? 0) > 0 && (
              <div className="relative w-full sm:w-72">
                <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Filtrar por nome ou CPF..."
                  className="w-full h-9 pl-8 pr-3 rounded-md border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingClientes ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : (clientes?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
              <Users className="size-8 mb-2 opacity-40" />
              <p className="font-medium text-foreground">Nenhum cliente vinculado à sua carteira</p>
              <p className="text-sm mt-1">
                Peça ao financeiro para vincular os clientes ao seu usuário.
              </p>
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Nenhum cliente encontrado para “{busca.trim()}”.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[26rem] overflow-y-auto">
              {clientesFiltrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClientId(c.id === clientId ? null : c.id)}
                  className={`text-left rounded-lg border p-3 transition hover:bg-muted/60 ${
                    c.id === clientId ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''
                  }`}
                >
                  <p className="font-medium text-sm truncate">{c.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.cpf ? formatCPF(c.cpf) : 'CPF não informado'}
                  </p>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {c.parcelasAtrasadas > 0 ? (
                      <Badge variant="destructive" className="text-[10px]">
                        {c.parcelasAtrasadas} em atraso
                      </Badge>
                    ) : c.contratosAtivos > 0 ? (
                      <Badge variant="secondary" className="text-[10px]">Em dia</Badge>
                    ) : null}
                    {c.contratosAtivos > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {c.contratosAtivos} contrato(s)
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!clientId ? (
        (clientes?.length ?? 0) > 0 ? (
          <Card className="print:hidden">
            <CardContent className="flex flex-col items-center py-14 text-muted-foreground">
              <FileText className="size-8 mb-2 opacity-40" />
              <p>Selecione um cliente acima para ver o relatório.</p>
            </CardContent>
          </Card>
        ) : null
      ) : isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : !data ? null : (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h2 className="text-lg font-semibold">{data.cliente.nome}</h2>
                <Badge variant={data.cliente.active ? 'success' : 'outline'}>
                  {data.cliente.active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {data.cliente.cpf && <span>CPF: {data.cliente.cpf}</span>}
                {data.cliente.whatsapp && <span>WhatsApp: {data.cliente.whatsapp}</span>}
                {data.cliente.email && <span>E-mail: {data.cliente.email}</span>}
                {(data.cliente.cidade || data.cliente.estado) && (
                  <span>
                    Cidade: {data.cliente.cidade ?? '—'}
                    {data.cliente.estado ? `/${data.cliente.estado}` : ''}
                  </span>
                )}
                {data.cliente.consultor && <span>Consultor: {data.cliente.consultor.nome}</span>}
                <span>Contratos: {data.resumo.totalContratos}</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={Wallet} tone="blue" label="Total contratado"
              value={formatCurrency(data.resumo.totalContratado)}
              sub={`${data.resumo.totalContratos} contrato(s)`}
            />
            <Kpi
              icon={CheckCircle2} tone="green" label="Total pago"
              value={formatCurrency(data.resumo.totalPago)}
              sub={
                data.resumo.qtdQuitadasHistorico > 0
                  ? `${data.resumo.qtdPagas + data.resumo.qtdQuitadasHistorico} parcela(s) quitada(s) · ${data.resumo.qtdQuitadasHistorico} antes do sistema`
                  : `${data.resumo.qtdPagas} parcela(s) paga(s)`
              }
            />
            <Kpi
              icon={AlertTriangle} tone="red" label="Vencido (com encargos)"
              value={formatCurrency(data.resumo.totalVencido)}
              sub={`${data.resumo.qtdVencidas} parcela(s) vencida(s)`}
            />
            <Kpi
              icon={CalendarClock} tone="amber" label="A vencer"
              value={formatCurrency(data.resumo.totalAVencer)}
              sub={`${data.resumo.qtdAVencer} parcela(s) a vencer`}
            />
          </div>

          {!data.contratos.length ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
                <FileText className="size-8 mb-2 opacity-40" />
                <p>Este cliente não possui contratos.</p>
              </CardContent>
            </Card>
          ) : (
            data.contratos.map((ct) => (
              <Card key={ct.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base">
                      Contrato #{ct.id} · {ct.numeroParcelas}x · início {formatDate(ct.dataInicio)}
                    </CardTitle>
                    <Badge variant={statusVariant[ct.status] ?? 'outline'}>
                      {ct.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-x-5 gap-y-1 flex-wrap mt-1">
                    <span>Capital: {formatCurrency(ct.principalAmount)}</span>
                    <span>Total do contrato: {formatCurrency(ct.totalReceivable)}</span>
                    <span className="text-green-600">Pago: {formatCurrency(ct.totalPago)}</span>
                    <span className="text-red-600">Vencido: {formatCurrency(ct.totalVencido)}</span>
                    <span className="text-amber-600">A vencer: {formatCurrency(ct.totalAVencer)}</span>
                    <span>
                      Quitadas: {ct.pagas.length + ct.qtdQuitadasHistorico} de {ct.numeroParcelas}
                      {' · '}Em aberto: {ct.vencidas.length + ct.aVencer.length}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {ct.qtdQuitadasHistorico > 0 && (
                    <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                      <span className="font-medium text-green-600">
                        {ct.qtdQuitadasHistorico} parcela(s) quitada(s) antes da migração
                      </span>{' '}
                      — pagas no sistema anterior, sem baixa individual registrada aqui. Contam no
                      total do contrato ({ct.numeroParcelas} parcelas), mas não aparecem na tabela
                      abaixo.
                    </div>
                  )}
                  <TabelaParcelas
                    titulo="Parcelas pagas" icone={CheckCircle2} parcelas={ct.pagas}
                    tone="text-green-600" mostrarPagamento
                  />
                  <TabelaParcelas
                    titulo="Parcelas vencidas" icone={AlertTriangle} parcelas={ct.vencidas}
                    tone="text-red-600" mostrarAtraso
                  />
                  <TabelaParcelas
                    titulo="Parcelas a vencer" icone={CalendarClock} parcelas={ct.aVencer}
                    tone="text-amber-600"
                  />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
