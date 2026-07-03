'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { AlertCircle, FileDown, RefreshCw, StickyNote } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useState } from 'react'
import { formatCurrency, formatDate, formatCPF, formatPhone } from '@/lib/utils'
import api from '@/lib/api'

interface Loan {
  id: number; valor: number; numeroParcelas: number; dataInicio: string; status: string
  observacoes?: string | null
  client: { id: number; nome: string; cpf: string; whatsapp: string; observacoes?: string | null }
  installments: Array<{ id: number; installmentAmount: number; totalPago: number; dataVencimento: string; status: string }>
}

function HoverObsPopover({ obs, title = 'Observações' }: { obs: string; title?: string }) {
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
        <p className="font-semibold mb-1 text-xs text-foreground uppercase tracking-wider">{title}</p>
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{obs}</p>
      </PopoverContent>
    </Popover>
  )
}

export default function InadimplentesPage() {
  const { data: installmentsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['installments', 'overdue'],
    queryFn: () => api.get<any>('/installments/overdue').then((r) => r.data),
  })

  const loansMap = new Map<number, Loan>()
  if (installmentsData && Array.isArray(installmentsData)) {
    for (const inst of installmentsData) {
      if (!inst.loan) continue; // safe check
      if (!loansMap.has(inst.loanId)) {
        loansMap.set(inst.loanId, {
          id: inst.loan.id,
          valor: inst.loan.principalAmount,
          numeroParcelas: inst.loan.numeroParcelas,
          dataInicio: inst.loan.dataInicio,
          status: inst.loan.status,
          observacoes: inst.loan.observacoes,
          client: inst.loan.client || { id: 0, nome: 'Cliente Desconhecido', cpf: '', whatsapp: '' },
          installments: []
        })
      }
      loansMap.get(inst.loanId)!.installments.push(inst)
    }
  }
  const loans = Array.from(loansMap.values())

  const calcSaldoDevedor = (installments: Loan['installments']) =>
    installments.reduce((s, i) => s + (Number(i.installmentAmount) - Number(i.totalPago)), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertCircle className="size-6 text-destructive" />Inadimplentes
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Clientes com parcelas em atraso</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={async () => {
            const res = await api.get('/export/inadimplentes/excel', { responseType: 'blob' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
            a.download = `inadimplentes-${new Date().toISOString().split('T')[0]}.xlsx`
            a.click()
            URL.revokeObjectURL(a.href)
          }}><FileDown className="size-3.5" />Excel</Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2"><RefreshCw className="size-3.5" />Atualizar</Button>
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</CardContent></Card>
      ) : isError ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button></CardContent></Card>
      ) : !loans?.length ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="size-8 text-green-600" />
            </div>
            <h3 className="font-semibold text-green-700">Nenhum inadimplente!</h3>
            <p className="text-muted-foreground text-sm mt-1">Todos os empréstimos estão em dia.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-red-50 dark:bg-red-950/20 border-red-200">
              <CardContent className="pt-4"><p className="text-xs text-muted-foreground">Contratos Inadimplentes</p><p className="text-2xl font-bold text-red-700">{loans.length}</p></CardContent>
            </Card>
            <Card className="bg-red-50 dark:bg-red-950/20 border-red-200">
              <CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total em Atraso</p><p className="text-2xl font-bold text-red-700">{formatCurrency(loans.reduce((s: number, l: Loan) => s + calcSaldoDevedor(l.installments ?? []), 0))}</p></CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4"><p className="text-xs text-muted-foreground">Clientes Únicos</p><p className="text-2xl font-bold">{new Set(loans.map((l: Loan) => l.client?.id)).size}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">WhatsApp</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Atraso</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo Devedor</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((loan: Loan) => {
                      const saldo = calcSaldoDevedor(loan.installments ?? [])
                      // Atraso: parcela em aberto vencida mais antiga
                      const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
                      const vencidas = (loan.installments ?? []).filter((i) => {
                        if (i.status === 'pago' || i.status === 'cancelado') return false
                        if (Number(i.installmentAmount) - Number(i.totalPago) <= 0) return false
                        const v = new Date(i.dataVencimento); v.setHours(0, 0, 0, 0)
                        return v < hoje
                      })
                      const maisAntiga = vencidas.length
                        ? vencidas.reduce((a, b) => (new Date(a.dataVencimento) < new Date(b.dataVencimento) ? a : b))
                        : null
                      const dias = maisAntiga
                        ? Math.floor((hoje.getTime() - new Date(maisAntiga.dataVencimento).setHours(0, 0, 0, 0)) / 86400000)
                        : 0
                      return (
                        <tr key={loan.id} className="border-b border-border hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <Link href={`/clientes/${loan.client?.id}`} className="hover:underline font-medium">
                                  {loan.client?.nome}
                                </Link>
                                {loan.client?.observacoes && (
                                  <HoverObsPopover obs={loan.client.observacoes} title="Observações do Cliente" />
                                )}
                              </div>
                              {loan.client?.cpf && (
                                <span className="text-xs text-muted-foreground font-mono">{formatCPF(loan.client.cpf)}</span>
                              )}
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] bg-muted px-1 py-0.5 rounded text-muted-foreground">Emp. #{loan.id}</span>
                                {loan.observacoes && (
                                  <HoverObsPopover obs={loan.observacoes} title="Observações do Empréstimo" />
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{loan.client?.whatsapp ? formatPhone(loan.client.whatsapp) : '—'}</td>
                          <td className="px-4 py-3">
                            {maisAntiga ? (
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-destructive">{formatDate(maisAntiga.dataVencimento)}</span>
                                <Badge variant="destructive" className="text-[10px]">{dias}d</Badge>
                                {vencidas.length > 1 && (
                                  <span className="text-[10px] text-muted-foreground">+{vencidas.length - 1}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-destructive">{formatCurrency(saldo)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Link href={`/emprestimos/${loan.id}`}>
                                <Button size="sm" variant="outline" className="h-7 text-xs">Ver</Button>
                              </Link>
                              <Link href={`/renegociacoes/nova?loanId=${loan.id}`}>
                                <Button size="sm" variant="outline" className="h-7 text-xs">Renegociar</Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
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
