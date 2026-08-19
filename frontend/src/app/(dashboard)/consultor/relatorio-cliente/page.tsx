'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText, CheckCircle2, AlertTriangle, CalendarClock, Wallet, Printer,
} from 'lucide-react'
import api from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ClienteCombobox } from '@/components/ui/cliente-combobox'
import { formatCurrency, formatDate } from '@/lib/utils'

interface ClienteOpt {
  id: number
  nome: string
  cpf?: string | null
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

  const { data: clientes, isLoading: loadingClientes } = useQuery<ClienteOpt[]>({
    queryKey: ['consultor-clientes-relatorio'],
    queryFn: () => api.get('/consultor/clientes').then((r) => r.data),
  })

  const { data, isLoading } = useQuery<RelatorioCliente>({
    queryKey: ['relatorio-cliente', clientId],
    queryFn: () => api.get(`/consultor/relatorio-cliente/${clientId}`).then((r) => r.data),
    enabled: !!clientId,
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

      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="max-w-lg">
            <p className="text-sm font-medium mb-1.5">Cliente</p>
            {loadingClientes ? (
              <Skeleton className="h-9" />
            ) : (
              <ClienteCombobox
                clientes={clientes ?? []}
                value={clientId}
                onSelect={(c) => setClientId(c?.id ?? null)}
                placeholder="Digite o nome ou CPF do cliente..."
              />
            )}
          </div>
        </CardContent>
      </Card>

      {!clientId ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-muted-foreground">
            <FileText className="size-8 mb-2 opacity-40" />
            <p>Selecione um cliente para ver o relatório.</p>
          </CardContent>
        </Card>
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
              sub={`${data.resumo.qtdPagas} parcela(s) paga(s)`}
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
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
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
