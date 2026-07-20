'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileSignature, CheckCircle2, Clock, AlertTriangle, QrCode, Lock } from 'lucide-react'
import { portalClient } from '@/lib/portal/portal-client'
import { MoneyDisplay } from '@/components/portal/money-display'
import { LoanStatusBadge, InstallmentStatusBadge } from '@/components/portal/status-badges'
import { ProgressBar } from '@/components/portal/progress-bar'
import { SkeletonContractCard, SkeletonLine } from '@/components/portal/skeleton-card'

interface Parcela {
  id: number
  numero: number
  valor: number
  saldoDevedor?: number
  moraAcumulada?: number
  multaAplicada?: number
  valorComEncargos?: number
  dataVencimento: string
  status: string
  dataPagamento: string | null
}

interface ContratoDetalhe {
  id: number
  valor: number
  numeroParcelas: number
  dataInicio: string
  status: string
  metodoPagamento: string
  aceiteExpiraEm: string | null
  totalParcelado: number
  totalPago: number
  saldoRestante: number
  parcelas: Parcela[]
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('pt-BR')
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState('')

  useEffect(() => {
    function calc() {
      const ms = new Date(expiresAt).getTime() - Date.now()
      if (ms <= 0) { setLeft('Expirado'); return }
      const d = Math.floor(ms / 86_400_000)
      const h = Math.floor((ms % 86_400_000) / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      setLeft(d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m} minutos`)
    }
    calc()
    const iv = setInterval(calc, 60_000)
    return () => clearInterval(iv)
  }, [expiresAt])

  return <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '13px', color: 'var(--portal-amber-600)', fontWeight: 500 }}>{left}</span>
}

export default function ContratoDetalhePage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [aceiteConfirmado, setAceiteConfirmado] = useState(false)
  const [aceiteFeito, setAceiteFeito] = useState(false)

  const { data, isLoading } = useQuery<ContratoDetalhe>({
    queryKey: ['portal-contrato', id],
    queryFn: () => portalClient.get(`/portal/contratos/${id}`).then(r => r.data),
    staleTime: 60_000,
  })

  const aceitarMutation = useMutation({
    mutationFn: () => portalClient.patch(`/portal/contratos/${id}/aceitar`),
    onSuccess: () => {
      setAceiteFeito(true)
      queryClient.invalidateQueries({ queryKey: ['portal-contrato', id] })
      queryClient.invalidateQueries({ queryKey: ['portal-home'] })
      queryClient.invalidateQueries({ queryKey: ['portal-contratos'] })
    },
  })

  if (isLoading) {
    return (
      <div className="portal-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <SkeletonLine width="32px" height="32px" />
          <SkeletonLine width="160px" height="22px" />
        </div>
        <SkeletonContractCard />
        <SkeletonContractCard />
      </div>
    )
  }

  if (!data) return null

  const pctPago = data.totalParcelado > 0 ? Math.round((data.totalPago / data.totalParcelado) * 100) : 0
  const isAguardandoAceite = data.status === 'aguardando_aceite'
  const prazoExpirado = data.aceiteExpiraEm ? new Date(data.aceiteExpiraEm) < new Date() : false

  return (
    <div className="portal-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Back + título */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/portal/contratos" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '8px', border: '1px solid var(--portal-gray-300)', background: 'var(--portal-white)', color: 'var(--portal-gray-600)' }}>
          <ArrowLeft size={18} />
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
            Contrato #{data.id}
          </h1>
        </div>
        <LoanStatusBadge status={data.status} />
      </div>

      {/* ── Bloco de aceite ────────────────────────────── */}
      {isAguardandoAceite && !aceiteFeito && (
        <div style={{
          background: prazoExpirado ? 'var(--portal-red-100)' : 'var(--portal-amber-100)',
          border: `2px solid ${prazoExpirado ? 'var(--portal-red-600)' : 'var(--portal-amber-600)'}`,
          borderRadius: 'var(--portal-radius-card)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: 'var(--portal-shadow-card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSignature size={20} color={prazoExpirado ? 'var(--portal-red-600)' : 'var(--portal-amber-600)'} />
            <p style={{ fontWeight: 700, fontSize: '15px', color: prazoExpirado ? 'var(--portal-red-600)' : 'var(--portal-amber-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
              {prazoExpirado ? 'Prazo de aceite expirado' : 'Assine seu contrato'}
            </p>
          </div>

          {data.aceiteExpiraEm && !prazoExpirado && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} color="var(--portal-amber-600)" />
              <span style={{ fontSize: '13px', color: 'var(--portal-amber-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                Expira em: <Countdown expiresAt={data.aceiteExpiraEm} />
              </span>
            </div>
          )}

          {/* Resumo */}
          <div style={{ background: 'var(--portal-white)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
              Resumo da proposta
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--portal-gray-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>Capital liberado</p>
                <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-serif, serif)' }}>{fmtCurrency(data.valor)}</p>
              </div>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--portal-gray-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>Total a pagar</p>
                <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-serif, serif)' }}>{fmtCurrency(data.totalParcelado)}</p>
              </div>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--portal-gray-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>Parcelas</p>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>{data.numeroParcelas}× de {fmtCurrency(data.totalParcelado / data.numeroParcelas)}</p>
              </div>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--portal-gray-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>Início previsto</p>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>{fmtDate(data.dataInicio)}</p>
              </div>
            </div>
          </div>

          {prazoExpirado ? (
            <p style={{ fontSize: '13px', color: 'var(--portal-red-600)', textAlign: 'center', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
              O prazo expirou. Entre em contato com seu consultor para renovar a proposta.
            </p>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={aceiteConfirmado}
                  onChange={e => setAceiteConfirmado(e.target.checked)}
                  style={{ marginTop: '2px', width: '16px', height: '16px', flexShrink: 0 }}
                />
                <span style={{ fontSize: '13px', color: 'var(--portal-gray-800)', fontFamily: 'var(--font-dm-sans, sans-serif)', lineHeight: 1.5 }}>
                  Li e concordo com os termos desta proposta. Estou ciente do valor, das parcelas e das condições descritas acima.
                </span>
              </label>

              {aceitarMutation.isError && (
                <p style={{ fontSize: '13px', color: 'var(--portal-red-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                  Erro ao registrar aceite. Tente novamente.
                </p>
              )}

              <button
                disabled={!aceiteConfirmado || aceitarMutation.isPending}
                onClick={() => aceitarMutation.mutate()}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: aceiteConfirmado ? 'var(--portal-green-600)' : 'var(--portal-gray-300)',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-dm-sans, sans-serif)',
                  cursor: aceiteConfirmado ? 'pointer' : 'not-allowed',
                  transition: 'background 200ms ease',
                }}
              >
                {aceitarMutation.isPending ? 'Registrando...' : 'Assinar e aceitar proposta'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Aceite registrado */}
      {aceiteFeito && (
        <div style={{
          background: 'var(--portal-green-100)',
          border: '2px solid var(--portal-green-400)',
          borderRadius: 'var(--portal-radius-card)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <CheckCircle2 size={24} color="var(--portal-green-600)" style={{ flexShrink: 0 }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--portal-green-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
              Proposta aceita com sucesso!
            </p>
            <p style={{ fontSize: '12px', color: 'var(--portal-green-600)', fontFamily: 'var(--font-dm-sans, sans-serif)', marginTop: '2px' }}>
              Aguarde a confirmação da liberação do capital.
            </p>
          </div>
        </div>
      )}

      {/* ── Resumo financeiro ──────────────────────────── */}
      <div className="pcard" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Valor destaque */}
        <div>
          <p style={{ fontSize: '11px', color: 'var(--portal-gray-600)', fontFamily: 'var(--font-dm-sans, sans-serif)', marginBottom: '4px' }}>
            Valor emprestado
          </p>
          <MoneyDisplay value={data.valor} size="xl" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--portal-gray-100)' }}>
          <MoneyDisplay value={data.totalParcelado} size="sm" label="Total a pagar" />
          <MoneyDisplay value={data.totalPago} size="sm" color="green" label="Total pago" />
          <MoneyDisplay value={data.saldoRestante} size="sm" color="amber" label="Saldo" />
        </div>

        {/* Progresso */}
        {!isAguardandoAceite && (
          <ProgressBar
            value={pctPago}
            color="green"
            animated
            label={`${pctPago}% pago · ${data.parcelas.filter(p => p.status === 'pago').length} de ${data.numeroParcelas} parcelas`}
          />
        )}
      </div>

      {/* ── Tabela de parcelas ────────────────────────── */}
      <div className="pcard" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--portal-gray-100)' }}>
          <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
            {isAguardandoAceite ? 'Parcelas previstas' : 'Parcelas'}
          </p>
        </div>

        {data.parcelas.map((p, idx) => {
          const isPagaravel = (p.status === 'pendente' || p.status === 'atrasado' || p.status === 'parcialmente_pago') && !isAguardandoAceite
          const isPrevista = isAguardandoAceite || p.status === 'cancelado'
          const totalParcela = p.valorComEncargos
            ?? ((p.saldoDevedor ?? p.valor) + (p.moraAcumulada ?? 0) + (p.multaAplicada ?? 0))

          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: idx < data.parcelas.length - 1 ? '1px solid var(--portal-gray-100)' : 'none',
                background: p.status === 'atrasado' ? 'rgba(220,38,38,.03)' : 'transparent',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                    #{p.numero}
                  </p>
                  {isPrevista ? (
                    <Lock size={11} color="var(--portal-gray-300)" />
                  ) : (
                    <InstallmentStatusBadge status={p.status} />
                  )}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--portal-gray-600)', marginTop: '2px', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                  {p.dataPagamento
                    ? `Pago em ${fmtDate(p.dataPagamento)}`
                    : `Vence ${fmtDate(p.dataVencimento)}`}
                </p>
                {p.status === 'atrasado' && ((p.moraAcumulada ?? 0) + (p.multaAplicada ?? 0)) > 0 && (
                  <p style={{ fontSize: '11px', color: 'var(--portal-red-600)', marginTop: '2px', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                    + {fmtCurrency((p.moraAcumulada ?? 0) + (p.multaAplicada ?? 0))} em multa/mora
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-serif, serif)' }}>
                    {fmtCurrency(isPagaravel && (p.saldoDevedor || p.moraAcumulada || p.multaAplicada) ? totalParcela : p.valor)}
                  </p>
                </div>
                {isPagaravel && (
                  <Link href={`/portal/pagamentos/pix/${p.id}`} style={{ textDecoration: 'none' }}>
                    <button style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '7px 12px',
                      borderRadius: '7px',
                      border: 'none',
                      background: p.status === 'atrasado' ? 'var(--portal-red-600)' : 'var(--portal-blue-600)',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-dm-sans, sans-serif)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}>
                      <QrCode size={12} />
                      PIX
                    </button>
                  </Link>
                )}
                {isPrevista && !isPagaravel && (
                  <span style={{ fontSize: '11px', color: 'var(--portal-gray-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                    Prevista
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── CTA sticky ───────────────────────────────── */}
      {data.status === 'ativo' && data.parcelas.find(p => p.status === 'pendente' || p.status === 'atrasado') && (() => {
        const prox = data.parcelas.find(p => p.status === 'pendente' || p.status === 'atrasado')
        if (!prox) return null
        return (
          <Link href={`/portal/pagamentos/pix/${prox.id}`} style={{ textDecoration: 'none' }}>
            <button style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '16px',
              borderRadius: '12px',
              border: 'none',
              background: 'var(--portal-blue-600)',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              fontFamily: 'var(--font-dm-sans, sans-serif)',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(27,79,216,.3)',
            }}>
              <QrCode size={20} />
              Pagar próxima parcela com PIX
            </button>
          </Link>
        )
      })()}
    </div>
  )
}
