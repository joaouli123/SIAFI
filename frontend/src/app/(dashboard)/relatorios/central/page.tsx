'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, FileText, FileSpreadsheet, FileCode2, FileType, Globe, FileDown, Loader2, Package,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ClienteCombobox } from '@/components/ui/cliente-combobox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/lib/api'
import { hojeISODate, primeiroDiaMesISO } from '@/lib/utils'

interface RelMeta {
  key: string; nome: string; descricao: string; grupo: string; persona: string; params: string[]
}
interface Catalogo { relatorios: RelMeta[]; formatos: string[] }

const FORMAT_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  pdf:  { label: 'PDF',   icon: FileText,        cls: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200' },
  xlsx: { label: 'Excel', icon: FileSpreadsheet, cls: 'text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30 border-green-200' },
  csv:  { label: 'CSV',   icon: FileDown,        cls: 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-blue-200' },
  xml:  { label: 'XML',   icon: FileCode2,       cls: 'text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 border-orange-200' },
  txt:  { label: 'TXT',   icon: FileType,        cls: 'text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-200' },
  html: { label: 'HTML',  icon: Globe,           cls: 'text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30 border-purple-200' },
}

export default function CentralRelatoriosPage() {
  const [startDate, setStartDate] = useState(primeiroDiaMesISO())
  const [endDate, setEndDate] = useState(hojeISODate())
  const [status, setStatus] = useState('')
  const [clientId, setClientId] = useState('')
  const [zipFmt, setZipFmt] = useState('xlsx')
  const [zipBusy, setZipBusy] = useState(false)
  const [busy, setBusy] = useState<string | null>(null) // `${key}:${formato}`

  const { data, isLoading } = useQuery<Catalogo>({
    queryKey: ['reports', 'catalogo'],
    queryFn: () => api.get('/reports/catalogo').then(r => r.data),
    staleTime: 5 * 60_000,
  })

  function filenameFrom(headers: any, fallback: string): string {
    const cd = headers?.['content-disposition'] as string | undefined
    const m = cd?.match(/filename="?([^"]+)"?/)
    return m?.[1] ?? fallback
  }

  async function gerar(rel: RelMeta, formato: string) {
    const id = `${rel.key}:${formato}`
    setBusy(id)
    try {
      const params: Record<string, string> = { formato }
      if (rel.params.includes('periodo')) { params.startDate = startDate; params.endDate = endDate }
      if (rel.params.includes('status') && status) params.status = status
      if (rel.params.includes('cliente')) params.clientId = clientId
      const res = await api.get(`/reports/gerar/${rel.key}`, { params, responseType: 'blob' })
      const blob = new Blob([res.data as BlobPart], { type: String(res.headers['content-type'] || 'application/octet-stream') })
      const url = URL.createObjectURL(blob)
      if (formato === 'pdf' || formato === 'html') {
        window.open(url, '_blank')
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = filenameFrom(res.headers, `${rel.key}.${formato}`)
        document.body.appendChild(a); a.click(); a.remove()
      }
      setTimeout(() => URL.revokeObjectURL(url), 15_000)
    } catch {
      toast.error('Não foi possível gerar o relatório.')
    } finally {
      setBusy(null)
    }
  }

  async function baixarZip() {
    setZipBusy(true)
    try {
      const res = await api.get('/reports/zip', {
        params: { formato: zipFmt, startDate, endDate, status: status || undefined },
        responseType: 'blob',
      })
      const blob = new Blob([res.data as BlobPart], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filenameFrom(res.headers, `relatorios-${zipFmt}.zip`)
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 15_000)
    } catch {
      toast.error('Não foi possível gerar o pacote ZIP.')
    } finally {
      setZipBusy(false)
    }
  }

  const grupos = Array.from(new Set((data?.relatorios ?? []).map(r => r.grupo)))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/relatorios"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="size-4" />Voltar</Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Central de Relatórios</h1>
          <p className="text-muted-foreground text-sm">Gere e exporte relatórios em PDF, Excel, CSV, XML, TXT e HTML</p>
        </div>
      </div>

      {/* Filtros globais (aplicados aos relatórios que usam período/status) */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Período — De</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status (carteira)</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
              <option value="">Todos (exceto cancelado)</option>
              <option value="ativo">Ativo</option>
              <option value="quitado">Quitado</option>
              <option value="inadimplente">Inadimplente</option>
              <option value="aguardando_aceite">Aguardando aceite</option>
              <option value="aguardando_liberacao">Aguardando liberação</option>
              <option value="cancelado">Cancelado</option>
            </Select>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Baixar tudo em</Label>
              <Select value={zipFmt} onChange={(e) => setZipFmt(e.target.value)} className="w-28">
                <option value="pdf">PDF</option>
                <option value="xlsx">Excel</option>
                <option value="csv">CSV</option>
                <option value="xml">XML</option>
                <option value="txt">TXT</option>
                <option value="html">HTML</option>
              </Select>
            </div>
            <Button onClick={baixarZip} disabled={zipBusy} className="gap-2">
              {zipBusy ? <Loader2 className="size-4 animate-spin" /> : <Package className="size-4" />}
              {zipBusy ? 'Gerando...' : 'Baixar ZIP'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground w-full">PDF e HTML abrem em nova aba · demais formatos baixam o arquivo · o ZIP reúne todos os relatórios (exceto os que exigem cliente)</p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        grupos.map((grupo) => (
          <Card key={grupo}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{grupo}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {data!.relatorios.filter(r => r.grupo === grupo).map((rel) => (
                  <div key={rel.key} className="flex flex-col lg:flex-row lg:items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{rel.nome}</p>
                        <Badge variant="outline" className="text-[10px]">{rel.persona}</Badge>
                        {rel.params.includes('periodo') && <Badge variant="outline" className="text-[10px] text-blue-600">período</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{rel.descricao}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
                      {rel.params.includes('cliente') && (
                        <div className="w-full sm:w-52">
                          <ClienteCombobox
                            buscaRemota
                            value={clientId ? Number(clientId) : null}
                            placeholder="Buscar cliente..."
                            onSelect={(c) => setClientId(c ? String(c.id) : '')}
                          />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {(data!.formatos).map((fmt) => {
                          const meta = FORMAT_META[fmt]
                          if (!meta) return null
                          const Icon = meta.icon
                          const loading = busy === `${rel.key}:${fmt}`
                          const needCliente = rel.params.includes('cliente') && !clientId
                          return (
                            <Button
                              key={fmt}
                              variant="outline"
                              size="sm"
                              disabled={!!busy || needCliente}
                              onClick={() => gerar(rel, fmt)}
                              className={`h-8 gap-1 text-xs ${meta.cls}`}
                              title={needCliente ? 'Selecione um cliente' : `Gerar ${meta.label}`}
                            >
                              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
                              {meta.label}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
