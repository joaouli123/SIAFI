'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import {
  QrCode, RefreshCw, Copy, Check, ExternalLink, Send,
  AlertTriangle, Clock, CircleCheck, XCircle, ChevronDown,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ClienteCombobox } from '@/components/ui/cliente-combobox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import api from '@/lib/api'
import { useAuth } from '@/contexts/auth.context'

const schema = z.object({ installmentId: z.coerce.number().min(1) })
type FormData = z.infer<typeof schema>

interface Charge {
  id: number
  tipo: string
  qrCode: string | null
  qrImage: string | null
  barcodeContent: string | null
  boletoUrl: string | null
  amount: number
  valorEncargos: number | null
  status: string
  expiresAt: string | null
  createdAt: string
  installment?: { id: number; status: string; totalPago: number }
}

function ChargeStatusBadge({ status, expiresAt }: { status: string; expiresAt: string | null }) {
  const expired = expiresAt && new Date(expiresAt) < new Date() && status === 'pendente'

  if (status === 'pago') return <Badge className="bg-green-100 text-green-700 border-green-200"><CircleCheck className="size-3 mr-1" />Pago</Badge>
  if (status === 'cancelado') return <Badge variant="destructive"><XCircle className="size-3 mr-1" />Cancelado</Badge>
  if (status === 'expirado' || expired) return <Badge className="bg-orange-100 text-orange-700 border-orange-200"><AlertTriangle className="size-3 mr-1" />Expirado</Badge>
  return <Badge className="bg-blue-100 text-blue-700 border-blue-200"><Clock className="size-3 mr-1" />Aguardando</Badge>
}

function ExpiresIn({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null
  const exp = new Date(expiresAt)
  const now = new Date()
  if (exp < now) return <p className="text-xs text-orange-600">Expirou em {formatDateTime(expiresAt)}</p>
  const diffMs = exp.getTime() - now.getTime()
  const diffH  = Math.floor(diffMs / 3_600_000)
  const diffM  = Math.floor((diffMs % 3_600_000) / 60_000)
  return (
    <p className="text-xs text-muted-foreground">
      Válido até {formatDateTime(expiresAt)}
      {diffH < 24 && <span className="text-amber-600 font-medium"> ({diffH}h{diffM}m restantes)</span>}
    </p>
  )
}

export default function PixPage() {
  const qc         = useQueryClient()
  const searchParams = useSearchParams()
  const preParcelaId = searchParams.get('parcelaId')
  const { user }   = useAuth()
  const isAdminOrFinanceiro = ['admin', 'financeiro'].includes(user?.role ?? '')

  const [copiedId, setCopiedId]       = useState<number | null>(null)
  const [clienteId, setClienteId]     = useState('')
  const [loanId, setLoanId]           = useState('')
  const [tipoGerar, setTipoGerar]     = useState<'pix' | 'boleto'>('pix')
  const [expHours, setExpHours]       = useState(24)
  const [expDays, setExpDays]         = useState(3)
  const [showHistory, setShowHistory] = useState(false)
  const [pagamentoConfirmado, setPagamentoConfirmado] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // A busca de cliente virou server-side no combobox; aqui basta o selecionado,
  // que precisa trazer o whatsapp para o envio da cobranca.
  const { data: selectedClient } = useQuery<any>({
    queryKey: ['client-pix', clienteId],
    queryFn:  () => api.get<any>(`/clients/${clienteId}`).then(r => r.data),
    enabled:  !!clienteId,
  })

  const { data: loans } = useQuery({
    queryKey: ['loans-by-client-pix', clienteId],
    queryFn:  () => api.get<any>('/loans', { params: { clientId: clienteId, status: 'ativo', limit: 50 } }).then(r => r.data.data ?? r.data),
    enabled:  !!clienteId,
  })

  const { data: installments } = useQuery({
    queryKey: ['installments-by-loan-pix', loanId],
    queryFn: () =>
      api.get<any>(`/loans/${loanId}`).then(r =>
        (r.data.installments ?? []).filter((i: any) => i.status !== 'pago' && i.status !== 'cancelado')
      ),
    enabled: !!loanId,
  })

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { installmentId: preParcelaId ? Number(preParcelaId) : 0 },
  })

  const installmentId = watch('installmentId')

  const { data: charges, isLoading: loadingCharges, refetch: refetchCharges } = useQuery({
    queryKey: ['pix-charges', installmentId],
    queryFn:  () => api.get<Charge[]>(`/pix/installment/${installmentId}`).then(r => r.data),
    enabled:  !!installmentId && installmentId > 0,
  })

  const latestActive = charges?.find(
    c => c.status === 'pendente' && (!c.expiresAt || new Date(c.expiresAt) > new Date())
  )
  const latestCharge = charges?.[0]

  // Polling a cada 5s enquanto há PIX pendente ativo
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    setPagamentoConfirmado(false)

    if (latestActive?.tipo === 'pix' && latestActive.status === 'pendente') {
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await api.get<Charge>(`/pix/${latestActive.id}/status`)
          if (data.status === 'pago' || (data as any).mpStatus === 'approved') {
            clearInterval(pollRef.current!)
            pollRef.current = null
            setPagamentoConfirmado(true)
            refetchCharges()
            // Invalidar queries relacionadas para manter consistência
            qc.invalidateQueries({ queryKey: ['installments-by-loan-pix', loanId] })
            qc.invalidateQueries({ queryKey: ['loan', loanId] })
            qc.invalidateQueries({ queryKey: ['loans-by-client-pix', clienteId] })
            qc.invalidateQueries({ queryKey: ['pagamentos'] })
            qc.invalidateQueries({ queryKey: ['payments'] })
          }
        } catch { /* ignore */ }
      }, 5_000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [latestActive?.id, latestActive?.status])

  const generateMut = useMutation({
    mutationFn: (data: FormData) =>
      api.post('/pix/generate', {
        installmentId: data.installmentId,
        tipo:          tipoGerar,
        expirationHours: tipoGerar === 'pix'    ? expHours : undefined,
        expirationDays:  tipoGerar === 'boleto' ? expDays  : undefined,
      }),
    onSuccess: () => {
      setPagamentoConfirmado(false)
      qc.invalidateQueries({ queryKey: ['pix-charges', installmentId] })
    },
  })

  const reissueMut = useMutation({
    mutationFn: (chargeId: number) => api.post(`/pix/${chargeId}/reissue`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['pix-charges', installmentId] }),
  })

  function copyText(text: string, id: number) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2500)
  }

  function sendWhatsApp(charge: Charge, clienteNome: string, whatsapp: string | undefined) {
    const phone = whatsapp?.replace(/\D/g, '')
    if (!phone) return
    const valor = formatCurrency(Number(charge.amount) + Number(charge.valorEncargos ?? 0))
    let msg = ''
    if (charge.tipo === 'pix' && charge.qrCode) {
      msg = `Olá ${clienteNome}! Segue o PIX Copia e Cola para pagamento de ${valor}:\n\n${charge.qrCode}\n\nVálido até ${charge.expiresAt ? formatDateTime(charge.expiresAt) : 'breve'}.`
    } else if (charge.tipo === 'boleto' && charge.barcodeContent) {
      msg = `Olá ${clienteNome}! Segue o código de barras do boleto para pagamento de ${valor}:\n\n${charge.barcodeContent}\n\nVencimento: ${charge.expiresAt ? formatDate(charge.expiresAt) : ''}.`
    }
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const selectedInst   = (installments as any[])?.find((i: any) => i.id === Number(installmentId))
  const isOverdue      = selectedInst && new Date(selectedInst.dataVencimento) < new Date()

  // Verificar se há QR Code ativo (não expirado) para a parcela selecionada
  const temQrAtivo = !!latestActive

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <QrCode className="size-6" />Cobranças PIX / Boleto
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gere QR Code PIX, Copia e Cola ou boleto por parcela. Reemita com encargos após vencimento.
        </p>
      </div>

      {/* Seleção */}
      <Card>
        <CardHeader><CardTitle className="text-base">Selecionar Parcela</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!preParcelaId && (
            <>
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <ClienteCombobox
                  buscaRemota
                  value={clienteId ? Number(clienteId) : null}
                  placeholder="Buscar cliente por nome ou CPF..."
                  onSelect={c => { setClienteId(c ? String(c.id) : ''); setLoanId(''); setValue('installmentId', 0); setPagamentoConfirmado(false) }}
                />
              </div>

              {clienteId && (
                <div className="space-y-1.5">
                  <Label>Empréstimo ativo</Label>
                  <Select value={loanId} onChange={e => { setLoanId(e.target.value); setValue('installmentId', 0); setPagamentoConfirmado(false) }}>
                    <option value="">Selecione o empréstimo...</option>
                    {((loans ?? []) as any[]).map((l: any) => (
                      <option key={l.id} value={l.id}>#{l.id} — {formatCurrency(l.valor)} — {l.numeroParcelas}x</option>
                    ))}
                  </Select>
                </div>
              )}

              {loanId && (
                <div className="space-y-1.5">
                  <Label>Parcela</Label>
                  <Select {...register('installmentId', { valueAsNumber: true })} onChange={e => { setValue('installmentId', Number(e.target.value)); setPagamentoConfirmado(false) }}>
                    <option value="">Selecione a parcela...</option>
                    {((installments ?? []) as any[]).map((i: any) => {
                      const saldo    = Number(i.installmentAmount ?? i.valor) - Number(i.totalPago)
                      const atrasada = new Date(i.dataVencimento) < new Date()
                      return (
                        <option key={i.id} value={i.id}>
                          {atrasada ? '⚠️ ' : ''}P{i.numero} — Venc. {formatDate(i.dataVencimento)} — {formatCurrency(saldo)}{atrasada ? ' (atrasada)' : ''}
                        </option>
                      )
                    })}
                  </Select>
                  {errors.installmentId && <p className="text-xs text-destructive">{errors.installmentId.message}</p>}
                </div>
              )}
            </>
          )}

          {installmentId > 0 && selectedInst && (
            <div className={`rounded-lg px-4 py-3 text-sm ${isOverdue ? 'bg-orange-50 border border-orange-200' : 'bg-muted/50'}`}>
              <p className="font-medium">
                {isOverdue && <AlertTriangle className="size-4 inline mr-1 text-orange-600" />}
                Parcela #{selectedInst.numero} — {formatCurrency(Number(selectedInst.installmentAmount ?? selectedInst.valor) - Number(selectedInst.totalPago))}
              </p>
              <p className="text-muted-foreground text-xs">
                Vencimento: {formatDate(selectedInst.dataVencimento)}
                {isOverdue && ` • ${Math.floor((Date.now() - new Date(selectedInst.dataVencimento).getTime()) / 86_400_000)} dias em atraso`}
              </p>
              {isOverdue && !isAdminOrFinanceiro && (
                <p className="text-orange-600 text-xs mt-1 font-medium">
                  Parcela vencida. Apenas financeiro ou admin pode gerar novo QR Code.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmação de pagamento */}
      {pagamentoConfirmado && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="size-12 text-green-600" />
            <div>
              <p className="font-semibold text-green-800 text-lg">Pagamento confirmado!</p>
              <p className="text-green-700 text-sm mt-1">
                O pagamento foi registrado com sucesso. Parcelas e empréstimo atualizados.
              </p>
            </div>
            {loanId && (
              <Button
                variant="outline"
                size="sm"
                className="border-green-300 text-green-700 hover:bg-green-100"
                onClick={() => window.location.href = `/emprestimos/${loanId}`}
              >
                Ver parcelas do contrato
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gerar cobrança — bloqueado se QR ativo já existe */}
      {installmentId > 0 && !pagamentoConfirmado && (
        <Card>
          <CardHeader><CardTitle className="text-base">Gerar Cobrança</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {temQrAtivo && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-800 flex items-start gap-2">
                <Clock className="size-4 mt-0.5 shrink-0" />
                <span>
                  Já existe um QR Code ativo para esta parcela.{' '}
                  <button
                    className="underline font-medium"
                    onClick={() => document.getElementById('qr-ativo')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Ver abaixo
                  </button>
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant={tipoGerar === 'pix' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTipoGerar('pix')}
                className={tipoGerar === 'pix' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
              >
                <QrCode className="size-4 mr-2" />PIX
              </Button>
              <Button
                variant={tipoGerar === 'boleto' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTipoGerar('boleto')}
                className={tipoGerar === 'boleto' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
              >
                Boleto Bancário
              </Button>
            </div>

            {tipoGerar === 'pix' && (
              <div className="flex items-center gap-3">
                <Label className="whitespace-nowrap text-sm">Validade</Label>
                <Select value={String(expHours)} onChange={e => setExpHours(Number(e.target.value))} className="w-40">
                  <option value="1">1 hora</option>
                  <option value="6">6 horas</option>
                  <option value="12">12 horas</option>
                  <option value="24">24 horas</option>
                  <option value="48">48 horas</option>
                  <option value="72">72 horas</option>
                </Select>
                {selectedInst && (
                  <p className="text-xs text-muted-foreground">
                    Expira no menor prazo entre a validade selecionada e o vencimento da parcela.
                  </p>
                )}
              </div>
            )}

            {tipoGerar === 'boleto' && (
              <div className="flex items-center gap-3">
                <Label className="whitespace-nowrap text-sm">Prazo de pagamento</Label>
                <Select value={String(expDays)} onChange={e => setExpDays(Number(e.target.value))} className="w-40">
                  <option value="3">3 dias</option>
                  <option value="5">5 dias</option>
                  <option value="7">7 dias</option>
                  <option value="10">10 dias</option>
                  <option value="15">15 dias</option>
                  <option value="30">30 dias</option>
                </Select>
              </div>
            )}

            {generateMut.isError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {(generateMut.error as any)?.response?.data?.message ?? 'Erro ao gerar cobrança'}
              </div>
            )}

            <Button
              onClick={handleSubmit(d => generateMut.mutate(d))}
              disabled={generateMut.isPending || (isOverdue && !isAdminOrFinanceiro)}
              title={isOverdue && !isAdminOrFinanceiro ? 'Parcela vencida. Apenas financeiro ou admin pode gerar QR Code.' : undefined}
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              <QrCode className="size-4" />
              {generateMut.isPending
                ? 'Gerando...'
                : temQrAtivo
                  ? `Reemitir ${tipoGerar === 'pix' ? 'QR Code PIX' : 'Boleto'}`
                  : `Gerar ${tipoGerar === 'pix' ? 'QR Code PIX' : 'Boleto'}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cobrança ativa */}
      {loadingCharges ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : latestCharge ? (
        <Card id="qr-ativo" className={latestActive ? 'border-blue-200' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">
                {latestCharge.tipo === 'pix' ? 'PIX' : 'Boleto'} #{latestCharge.id}
              </CardTitle>
              <ChargeStatusBadge status={latestCharge.status} expiresAt={latestCharge.expiresAt} />
            </div>
            <div className="flex gap-2">
              {(latestCharge.status === 'expirado' ||
                latestCharge.status === 'cancelado' ||
                (latestCharge.status === 'pendente' && latestCharge.expiresAt && new Date(latestCharge.expiresAt) < new Date())
              ) && isAdminOrFinanceiro && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-1 text-xs"
                  disabled={reissueMut.isPending}
                  onClick={() => {
                    if (confirm('Reemitir com encargos de mora e multa calculados automaticamente?'))
                      reissueMut.mutate(latestCharge.id)
                  }}
                >
                  <RefreshCw className="size-3" />
                  Reemitir{isOverdue ? ' com Encargos' : ''}
                </Button>
              )}
              {latestCharge.status === 'pendente' && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Verificar status no Mercado Pago"
                  onClick={() => api.get(`/pix/${latestCharge.id}/status`).then(() => refetchCharges())}
                >
                  <RefreshCw className="size-3" />
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Polling indicator */}
            {latestActive && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block size-2 rounded-full bg-blue-400 animate-pulse" />
                Aguardando confirmação de pagamento...
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor principal</span>
              <span className="font-semibold">{formatCurrency(Number(latestCharge.amount))}</span>
            </div>
            {latestCharge.valorEncargos && Number(latestCharge.valorEncargos) > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-orange-600">Encargos (mora + multa)</span>
                  <span className="font-semibold text-orange-600">+ {formatCurrency(Number(latestCharge.valorEncargos))}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="font-medium">Total</span>
                  <span className="font-bold">{formatCurrency(Number(latestCharge.amount) + Number(latestCharge.valorEncargos))}</span>
                </div>
              </>
            )}

            <ExpiresIn expiresAt={latestCharge.expiresAt} />

            {/* PIX QR Code */}
            {latestCharge.tipo === 'pix' && latestCharge.qrImage && (
              <div className="flex flex-col items-center gap-3 pt-2">
                <img
                  src={`data:image/png;base64,${latestCharge.qrImage}`}
                  alt="QR Code PIX"
                  className="w-48 h-48 rounded-lg border"
                />
              </div>
            )}

            {/* PIX Copia e Cola */}
            {latestCharge.tipo === 'pix' && latestCharge.qrCode && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Copia e Cola</Label>
                <div className="flex gap-2">
                  <Input readOnly value={latestCharge.qrCode} className="text-xs font-mono" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => copyText(latestCharge.qrCode!, latestCharge.id)}
                  >
                    {copiedId === latestCharge.id ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>
            )}

            {/* Boleto */}
            {latestCharge.tipo === 'boleto' && latestCharge.barcodeContent && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Linha Digitável</Label>
                <div className="flex gap-2">
                  <Input readOnly value={latestCharge.barcodeContent} className="text-xs font-mono" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => copyText(latestCharge.barcodeContent!, latestCharge.id)}
                  >
                    {copiedId === latestCharge.id ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>
            )}

            {latestCharge.tipo === 'boleto' && latestCharge.boletoUrl && (
              <a
                href={latestCharge.boletoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
              >
                <ExternalLink className="size-4" />Abrir PDF do Boleto
              </a>
            )}

            {/* Enviar WhatsApp */}
            {latestActive && selectedClient?.whatsapp && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => sendWhatsApp(latestCharge, selectedClient.nome, selectedClient.whatsapp)}
              >
                <Send className="size-4" />Enviar por WhatsApp para {selectedClient.nome}
              </Button>
            )}

            <p className="text-xs text-muted-foreground text-center">Gerado em {formatDateTime(latestCharge.createdAt)}</p>
          </CardContent>
        </Card>
      ) : installmentId > 0 && !loadingCharges ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nenhuma cobrança gerada para esta parcela ainda.
          </CardContent>
        </Card>
      ) : null}

      {/* Histórico */}
      {charges && charges.length > 1 && (
        <div>
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={`size-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            Histórico de cobranças ({charges.length - 1} anterior{charges.length > 2 ? 'es' : ''})
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {charges.slice(1).map(c => (
                <div key={c.id} className="rounded-lg border px-4 py-3 text-sm flex items-center justify-between">
                  <div>
                    <span className="font-medium capitalize">{c.tipo} #{c.id}</span>
                    <span className="text-muted-foreground ml-2">
                      {formatCurrency(Number(c.amount))}{c.valorEncargos ? ` + ${formatCurrency(Number(c.valorEncargos))} encargos` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ChargeStatusBadge status={c.status} expiresAt={c.expiresAt} />
                    <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
