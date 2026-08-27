'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { AlertCircle, FileDown, RefreshCw, Search, StickyNote, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useMemo, useState } from 'react'
import { formatCurrency, formatDateLocal, formatCPF, formatPhone, hojeISODate } from '@/lib/utils'
import api from '@/lib/api'

interface Loan {
  id: number; valor: number; numeroParcelas: number; dataInicio: string; status: string
  observacoes?: string | null
  client: { id: number; nome: string; cpf: string; whatsapp: string; observacoes?: string | null; quantidadeEmprestimos?: number }
  installments: Array<{ id: number; installmentAmount: number; totalPago: number; dataVencimento: string; status: string; moraAcumulada?: number; multaAplicada?: number }>
}

// Dia exibido na coluna Atraso. As datas chegam ao meio-dia UTC e formatDateLocal
// as le em UTC; comparar o mesmo dia em ISO evita filtrar com um dia de diferenca.
function diaISO(data: string): string {
  const d = new Date(data)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

// Busca sem acento: 42 dos 518 clientes tem acento no nome, entao digitar
// "conceicao" precisa achar "Conceicao".
const semAcento = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

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

  const [fSearch, setFSearch] = useState('')
  const [fStart, setFStart] = useState('')
  const [fEnd, setFEnd] = useState('')
  const temFiltro = !!(fSearch.trim() || fStart || fEnd)

  // Saldo devedor em atraso = saldo (installmentAmount - pago) + encargos (multa + mora),
  // idêntico ao exibido em /parcelas.
  const calcSaldoDevedor = (installments: Loan['installments']) =>
    installments.reduce(
      (s, i) =>
        s +
        Math.max(0, Number(i.installmentAmount) - Number(i.totalPago)) +
        Number(i.moraAcumulada ?? 0) +
        Number(i.multaAplicada ?? 0),
      0,
    )

  // Uma linha por contrato, ja com o atraso mais antigo resolvido: e por ele que a
  // tela conta os dias e por ele que o filtro de periodo passa a decidir.
  const linhas = useMemo(() => {
    const loansMap = new Map<number, Loan>()
    if (installmentsData && Array.isArray(installmentsData)) {
      for (const inst of installmentsData) {
        if (!inst.loan) continue
        if (!loansMap.has(inst.loanId)) {
          loansMap.set(inst.loanId, {
            id: inst.loan.id,
            valor: inst.loan.principalAmount,
            numeroParcelas: inst.loan.numeroParcelas,
            dataInicio: inst.loan.dataInicio,
            status: inst.loan.status,
            observacoes: inst.loan.observacoes,
            client: inst.loan.client || { id: 0, nome: 'Cliente Desconhecido', cpf: '', whatsapp: '' },
            installments: [],
          })
        }
        loansMap.get(inst.loanId)!.installments.push(inst)
      }
    }

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    return Array.from(loansMap.values()).map((loan) => {
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
      return {
        loan,
        saldo: calcSaldoDevedor(loan.installments ?? []),
        qtdVencidas: vencidas.length,
        maisAntiga,
        dias,
      }
    })
  }, [installmentsData])

  const linhasFiltradas = useMemo(() => {
    const termo = semAcento(fSearch.trim())
    const digitos = termo.replace(/\D/g, '')
    return linhas.filter((l) => {
      if (termo) {
        const nome = semAcento(l.loan.client?.nome ?? '')
        const cpf = (l.loan.client?.cpf ?? '').replace(/\D/g, '')
        const fone = (l.loan.client?.whatsapp ?? '').replace(/\D/g, '')
        const achou = nome.includes(termo) || (!!digitos && (cpf.includes(digitos) || fone.includes(digitos)))
        if (!achou) return false
      }
      if (fStart || fEnd) {
        const dia = l.maisAntiga ? diaISO(l.maisAntiga.dataVencimento) : ''
        if (!dia) return false
        if (fStart && dia < fStart) return false
        if (fEnd && dia > fEnd) return false
      }
      return true
    })
  }, [linhas, fSearch, fStart, fEnd])

  const totalEmAtraso = linhasFiltradas.reduce((s, l) => s + l.saldo, 0)
  const clientesUnicos = new Set(linhasFiltradas.map((l) => l.loan.client?.id)).size

  const limparFiltros = () => { setFSearch(''); setFStart(''); setFEnd('') }

  const baixarExcel = async () => {
    // A planilha sai com os mesmos filtros da tela: exportar a carteira inteira
    // depois de filtrar um cliente so gera conferencia manual do outro lado.
    const res = await api.get('/export/inadimplentes/excel', {
      params: {
        search: fSearch.trim() || undefined,
        startDate: fStart || undefined,
        endDate: fEnd || undefined,
      },
      responseType: 'blob',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `inadimplentes-${hojeISODate()}.xlsx`
    a.click()
    URL.revokeObjectURL(a.href)
  }

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
          <Button variant="outline" size="sm" className="gap-2" onClick={baixarExcel}><FileDown className="size-3.5" />Excel</Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2"><RefreshCw className="size-3.5" />Atualizar</Button>
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</CardContent></Card>
      ) : isError ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button></CardContent></Card>
      ) : !linhas.length ? (
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
          <div className="bg-card border border-border/40 rounded-xl p-3 shadow-sm flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1 w-full min-w-[200px]">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Buscar por cliente, CPF ou WhatsApp..." value={fSearch} onChange={(e) => setFSearch(e.target.value)} />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <div className="flex items-center gap-1.5 bg-background rounded-lg border px-2 h-9">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Atraso:</span>
                <Input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} className="w-[125px] h-7 border-0 p-1 bg-transparent text-sm shadow-none focus-visible:ring-0" />
                <span className="text-muted-foreground text-xs">até</span>
                <Input type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)} className="w-[125px] h-7 border-0 p-1 bg-transparent text-sm shadow-none focus-visible:ring-0" />
              </div>

              {temFiltro && (
                <Button variant="ghost" size="sm" onClick={limparFiltros} className="h-9 gap-1.5 text-muted-foreground hover:text-destructive" title="Limpar filtros">
                  <X className="size-4" />Limpar
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-red-50 dark:bg-red-950/20 border-red-200">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Contratos Inadimplentes</p>
                <p className="text-2xl font-bold text-red-700">
                  {linhasFiltradas.length}
                  {temFiltro && <span className="text-sm font-normal text-muted-foreground"> de {linhas.length}</span>}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 dark:bg-red-950/20 border-red-200">
              <CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total em Atraso</p><p className="text-2xl font-bold text-red-700">{formatCurrency(totalEmAtraso)}</p></CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4"><p className="text-xs text-muted-foreground">Clientes Únicos</p><p className="text-2xl font-bold">{clientesUnicos}</p></CardContent>
            </Card>
          </div>

          {!linhasFiltradas.length ? (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Search className="size-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold">Nenhum inadimplente neste filtro</h3>
                <p className="text-muted-foreground text-sm mt-1">Ajuste o nome ou o período do atraso.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={limparFiltros}>Limpar filtros</Button>
              </CardContent>
            </Card>
          ) : (
          <Card>
            <CardContent className="p-0">
              <div className="tabela-rolavel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground hidden md:table-cell whitespace-nowrap">CPF</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground min-w-[240px]">Cliente</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">WhatsApp</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Atraso</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo Devedor</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Obs</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map(({ loan, saldo, qtdVencidas, maisAntiga, dias }) => {
                    return (
                      <tr key={loan.id} className="border-b border-border hover:bg-muted/20">
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs hidden md:table-cell">
                          {loan.client?.cpf ? formatCPF(loan.client.cpf) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <Link href={`/clientes/${loan.client?.id}`} className="hover:underline font-medium">
                                {loan.client?.nome}
                              </Link>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] bg-muted px-1 py-0.5 rounded text-muted-foreground">
                                {loan.client?.quantidadeEmprestimos ?? 1} empréstimo{(loan.client?.quantidadeEmprestimos ?? 1) !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{loan.client?.whatsapp ? formatPhone(loan.client.whatsapp) : '—'}</td>
                        <td className="px-4 py-3">
                          {maisAntiga ? (
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-destructive">{formatDateLocal(maisAntiga.dataVencimento)}</span>
                              <Badge variant="destructive" className="text-[10px]">{dias}d</Badge>
                                {qtdVencidas > 1 && (
                                  <span className="text-[10px] text-muted-foreground">+{qtdVencidas - 1}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-destructive">{formatCurrency(saldo)}</td>
                          <td className="px-4 py-3 text-center">
                            {(loan.client?.observacoes || loan.observacoes) ? (
                              <HoverObsPopover obs={`${loan.client?.observacoes || ''}\n${loan.observacoes || ''}`.trim()} title="Observações" />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
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
          )}
        </>
      )}
    </div>
  )
}
