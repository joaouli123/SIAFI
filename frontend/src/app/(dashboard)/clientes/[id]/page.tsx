'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil, Phone, Mail, MapPin, FileText, FileDown, CreditCard, FolderOpen, ExternalLink, UserCheck, X, Plus, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { formatCPF, formatPhone, formatDate, formatCEP, formatCurrency, STATUS_LOAN } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/auth.context'
import { toast } from 'sonner'
import api from '@/lib/api'
import { PortalCard } from '@/components/portal/portal-card'
import { TratativasCard } from '@/components/clientes/tratativas-card'

interface Consultor {
  id: number
  nome: string
}

interface Client {
  id: number; nome: string; cpf: string; rg: string; dataNascimento: string
  email: string; whatsapp: string; telefone: string; endereco: string
  bairro: string; cidade: string; estado: string; cep: string
  active: boolean; observacoes: string; createdAt: string
  fotoPath?: string; rgPath?: string; comprovantePath?: string
  consultor?: { id: number; nome: string } | null
  loans: Array<{ id: number; principalAmount: string; totalReceivable: string; numeroParcelas: number; status: string; dataInicio: string }>
  meusAvalistas?: Array<{ id: number; nome: string; cpf: string; telefone: string; parentesco: string }>
  referencia1Nome?: string; referencia1Telefone?: string; referencia1Vinculo?: string
  referencia2Nome?: string; referencia2Telefone?: string; referencia2Vinculo?: string
}

interface DocumentUrls {
  fotoUrl?: string
  rgUrl?: string
  comprovanteUrl?: string
}

async function baixarPdf(endpoint: string, filename: string) {
  const res = await api.get(endpoint, { responseType: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function ClienteDetalhePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showVincular, setShowVincular] = useState(false)
  const [selectedConsultorId, setSelectedConsultorId] = useState<string>('')

  const canManage = user?.role === 'admin' || user?.role === 'financeiro'
  // Observacoes/tratativas: o consultor tambem escreve, mas so na propria carteira
  // (o PATCH /clients/:id ja recusa cliente de outro consultor).
  const canEditObs = canManage || user?.role === 'consultor'

  const { data: client, isLoading, isError } = useQuery({
    queryKey: ['clients', id],
    queryFn: () => api.get<Client>(`/clients/${id}`).then((r) => r.data),
  })

  const [isEditingObs, setIsEditingObs] = useState(false)
  const [obsText, setObsText] = useState('')

  // Sync obsText when client loads
  useEffect(() => {
    if (client) {
      setObsText(client.observacoes || '')
    }
  }, [client])

  const obsMut = useMutation({
    mutationFn: (observacoes: string) => api.patch(`/clients/${id}`, { observacoes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients', id] })
      setIsEditingObs(false)
      toast.success('Observações atualizadas com sucesso')
    },
    onError: () => toast.error('Erro ao salvar observações'),
  })

  const { data: consultores } = useQuery<Consultor[]>({
    queryKey: ['consultores'],
    queryFn: () => api.get<Consultor[]>('/clients/consultores').then((r) => r.data),
    enabled: canManage && showVincular,
  })

  const vincularMut = useMutation({
    mutationFn: (consultorId: number | null) =>
      api.patch(`/clients/${id}/vincular-consultor`, { consultorId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients', id] })
      setShowVincular(false)
      setSelectedConsultorId('')
      toast.success('Consultor atualizado com sucesso')
    },
    onError: () => toast.error('Não foi possível vincular o consultor. Tente novamente.'),
  })

  const hasDocuments = !!(client?.fotoPath || client?.rgPath || client?.comprovantePath)

  const { data: docUrls } = useQuery<DocumentUrls>({
    queryKey: ['clients', id, 'document-urls'],
    queryFn: () => api.get<DocumentUrls>(`/clients/${id}/document-urls`).then((r) => r.data),
    enabled: hasDocuments,
    staleTime: 50 * 60 * 1000, // refresh before signed URL expires (1h)
  })

  if (isLoading) return (
    <div className="space-y-6 w-full">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  if (isError || !client) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Cliente não encontrado.</p>
      <Link href="/clientes"><Button variant="outline" className="mt-4">Voltar</Button></Link>
    </div>
  )

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{client.nome}</h1>
            <p className="text-muted-foreground text-sm">Cliente #{client.id} · Cadastrado em {formatDate(client.createdAt)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant={client.active ? 'success' : 'outline'}>{client.active ? 'Ativo' : 'Inativo'}</Badge>
          {canManage && (
            <Link href={`/clientes/${client.id}/editar`}>
              <Button size="sm" className="gap-2"><Pencil className="size-3.5" />Editar</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="size-4" />Dados Pessoais</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">CPF</span>
              <span className="font-medium">
                {client.cpf ? formatCPF(client.cpf) : <span className="italic text-muted-foreground">Não informado</span>}
              </span>
            </div>
            {client.rg && <div className="flex justify-between"><span className="text-muted-foreground">RG</span><span className="font-medium">{client.rg}</span></div>}
            {client.dataNascimento && <div className="flex justify-between"><span className="text-muted-foreground">Nascimento</span><span className="font-medium">{formatDate(client.dataNascimento)}</span></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Phone className="size-4" />Contatos</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {client.whatsapp && <div className="flex justify-between"><span className="text-muted-foreground">WhatsApp</span><span className="font-medium">{formatPhone(client.whatsapp)}</span></div>}
            {client.telefone && <div className="flex justify-between"><span className="text-muted-foreground">Telefone</span><span className="font-medium">{formatPhone(client.telefone)}</span></div>}
            {client.email && <div className="flex justify-between items-center"><span className="text-muted-foreground">E-mail</span><span className="font-medium flex items-center gap-1"><Mail className="size-3" />{client.email}</span></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><UserCheck className="size-4" />Consultor</CardTitle>
              {canManage && (
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => { setShowVincular(true); setSelectedConsultorId(client.consultor ? String(client.consultor.id) : '') }}>
                  <Pencil className="size-3" />
                  {client.consultor ? 'Alterar' : 'Vincular'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="text-sm">
            {client.consultor ? (
              <p className="font-medium">{client.consultor.nome}</p>
            ) : (
              <p className="text-muted-foreground">Nenhum consultor vinculado</p>
            )}
          </CardContent>
        </Card>

        {(client.endereco || client.cidade) && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="size-4" />Endereço</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {client.endereco && <p>{client.endereco}{client.bairro ? `, ${client.bairro}` : ''}</p>}
              {(client.cidade || client.estado) && <p>{[client.cidade, client.estado].filter(Boolean).join(' - ')}{client.cep ? ` · CEP ${formatCEP(client.cep)}` : ''}</p>}
            </CardContent>
          </Card>
        )}

        {client.meusAvalistas && client.meusAvalistas.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="size-4" />Avalistas</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {client.meusAvalistas.map((av, idx) => (
                  <div key={av.id || idx} className="rounded-lg border p-3 text-sm space-y-1.5 bg-muted/20">
                    <p className="font-semibold text-primary">Avalista #{idx + 1}: {av.nome}</p>
                    {av.cpf && <p><span className="text-muted-foreground">CPF:</span> {formatCPF(av.cpf)}</p>}
                    {av.telefone && <p><span className="text-muted-foreground">Telefone:</span> {formatPhone(av.telefone)}</p>}
                    {av.parentesco && <p><span className="text-muted-foreground">Parentesco/Vínculo:</span> {av.parentesco}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {(client.referencia1Nome || client.referencia2Nome) && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Phone className="size-4" />Referências de Contato</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {client.referencia1Nome && (
                  <div className="rounded-lg border p-3 text-sm space-y-1.5 bg-muted/20">
                    <p className="font-semibold text-primary">Referência 1: {client.referencia1Nome}</p>
                    {client.referencia1Telefone && <p><span className="text-muted-foreground">Telefone:</span> {formatPhone(client.referencia1Telefone)}</p>}
                    {client.referencia1Vinculo && <p><span className="text-muted-foreground">Vínculo:</span> {client.referencia1Vinculo}</p>}
                  </div>
                )}
                {client.referencia2Nome && (
                  <div className="rounded-lg border p-3 text-sm space-y-1.5 bg-muted/20">
                    <p className="font-semibold text-primary">Referência 2: {client.referencia2Nome}</p>
                    {client.referencia2Telefone && <p><span className="text-muted-foreground">Telefone:</span> {formatPhone(client.referencia2Telefone)}</p>}
                    {client.referencia2Vinculo && <p><span className="text-muted-foreground">Vínculo:</span> {client.referencia2Vinculo}</p>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {hasDocuments && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FolderOpen className="size-4" />Documentos</CardTitle></CardHeader>
            <CardContent>
              {docUrls ? (
                <div className="flex flex-wrap gap-3">
                  {docUrls.fotoUrl && (
                    <a
                      href={docUrls.fotoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                      Foto do Cliente
                    </a>
                  )}
                  {docUrls.rgUrl && (
                    <a
                      href={docUrls.rgUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                      RG
                    </a>
                  )}
                  {docUrls.comprovanteUrl && (
                    <a
                      href={docUrls.comprovanteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                      Comprovante de Endereço
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex gap-3">
                  {client.fotoPath && <Skeleton className="h-9 w-36" />}
                  {client.rgPath && <Skeleton className="h-9 w-20" />}
                  {client.comprovantePath && <Skeleton className="h-9 w-48" />}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <TratativasCard clientId={client.id} className="md:col-span-2" />

        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Observações</CardTitle>
              {canEditObs && !isEditingObs && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setIsEditingObs(true)}>
                  <Pencil className="size-3" /> Editar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditingObs ? (
              <div className="space-y-3">
                <Textarea 
                  value={obsText} 
                  onChange={(e) => setObsText(e.target.value)} 
                  rows={5} 
                  placeholder="Digite as observações sobre o cliente..."
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setIsEditingObs(false); setObsText(client.observacoes || '') }}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={() => obsMut.mutate(obsText)} disabled={obsMut.isPending}>
                    {obsMut.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {client.observacoes || <span className="italic opacity-50">Nenhuma observação registrada.</span>}
              </p>
            )}
          </CardContent>
        </Card>

        <PortalCard
          clientId={client.id}
          clienteNome={client.nome}
          clienteEmail={client.email ?? null}
        />
      </div>

      {showVincular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Vincular Consultor</h2>
              <button onClick={() => setShowVincular(false)}>
                <X className="size-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            <div className="space-y-1.5">
              <Label>Consultor</Label>
              <Select
                value={selectedConsultorId}
                onChange={(e) => setSelectedConsultorId(e.target.value)}
                className="w-full"
              >
                <option value="">Sem consultor</option>
                {consultores?.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.nome}</option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowVincular(false)}>Cancelar</Button>
              <Button
                size="sm"
                onClick={() => vincularMut.mutate(selectedConsultorId ? Number(selectedConsultorId) : null)}
                disabled={vincularMut.isPending}
              >
                {vincularMut.isPending ? 'Salvando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {client.loans && client.loans.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><CreditCard className="size-4" />Empréstimos de {client.nome}</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5"
                onClick={() => baixarPdf(`/export/clientes/${client.id}/extrato`, `extrato-${client.id}.pdf`)}>
                <FileDown className="size-3.5" />Extrato PDF
              </Button>
              {canManage && (
                <Link href={`/emprestimos/novo?clienteId=${client.id}`}>
                  <Button size="sm" variant="outline">Novo empréstimo</Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Contrato</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Capital</th>
                  <th className="text-center px-4 py-2 font-medium text-muted-foreground">Parcelas</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Início</th>
                  <th className="text-center px-4 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Ação</th>
                </tr>
              </thead>
              <tbody>
                {client.loans.map((loan, idx) => {
                  const st = STATUS_LOAN[loan.status] ?? { label: loan.status, variant: 'outline' as const }
                  return (
                    <tr key={loan.id} className="border-b border-border hover:bg-muted/20">
                      <td className="px-4 py-2">
                        <div>
                          <p className="font-medium">Contrato {idx + 1}</p>
                          <p className="text-xs text-muted-foreground">Empréstimo #{loan.id}</p>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(loan.principalAmount)}</td>
                      <td className="px-4 py-2 text-center text-muted-foreground">{loan.numeroParcelas}x</td>
                      <td className="px-4 py-2 text-muted-foreground">{formatDate(loan.dataInicio)}</td>
                      <td className="px-4 py-2 text-center"><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => baixarPdf(`/export/contratos/${loan.id}/pdf`, `contrato-${loan.id}.pdf`)}
                            className="inline-flex items-center gap-1 rounded-md px-2 h-7 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            <FileText className="size-3" />PDF
                          </button>
                          <Link href={`/emprestimos/${loan.id}`}>
                            <Button variant="ghost" size="sm">Ver</Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
