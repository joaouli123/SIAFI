'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Printer, Receipt } from 'lucide-react'
import { portalClient } from '@/lib/portal/portal-client'
import { MoneyDisplay } from '@/components/portal/money-display'
import { SkeletonListItem } from '@/components/portal/skeleton-card'
import { mesAtualISO } from '@/lib/utils'

interface Pagamento {
  id: number
  valor: number
  dataPagamento: string
  metodoPagamento: string
  numeroParcela: number
  loanId: number
}

const METODOS: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', cartao: 'Cartão',
  transferencia: 'Transferência', cheque: 'Cheque', mercadopago: 'Mercado Pago',
}

const METODO_COLOR: Record<string, string> = {
  pix: 'var(--portal-blue-600)',
  dinheiro: 'var(--portal-green-600)',
  cartao: 'var(--portal-amber-600)',
}

function groupByMonth(pagamentos: Pagamento[]) {
  const groups: Record<string, Pagamento[]> = {}
  for (const p of pagamentos) {
    const key = p.dataPagamento.slice(0, 7)
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
}

function fmtMonthLabel(key: string) {
  const [year, month] = key.split('-')
  return new Date(Number(year), Number(month) - 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default function PagamentosPage() {
  const { data, isLoading } = useQuery<Pagamento[]>({
    queryKey: ['portal-pagamentos'],
    queryFn: () => portalClient.get('/portal/pagamentos').then(r => r.data),
    staleTime: 30_000,
  })

  const grupos = data ? groupByMonth(data) : []

  /* Resumo do mês atual */
  const mesAtual = mesAtualISO()
  const pagamentosMesAtual = data?.filter(p => p.dataPagamento.startsWith(mesAtual)) ?? []
  const totalMes = pagamentosMesAtual.reduce((s, p) => s + p.valor, 0)

  return (
    <div className="portal-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Título + imprimir */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
          Pagamentos
        </h1>
        {!isLoading && data && data.length > 0 && (
          <button
            onClick={() => window.print()}
            data-no-print
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--portal-gray-300)',
              background: 'var(--portal-white)',
              color: 'var(--portal-gray-600)',
              fontSize: '13px',
              fontFamily: 'var(--font-dm-sans, sans-serif)',
              cursor: 'pointer',
            }}
          >
            <Printer size={15} />
            Imprimir
          </button>
        )}
      </div>

      {/* Resumo do mês */}
      {!isLoading && pagamentosMesAtual.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="pcard" style={{ padding: '16px' }}>
            <MoneyDisplay value={totalMes} size="md" label="Total no mês" />
          </div>
          <div className="pcard" style={{ padding: '16px' }}>
            <p style={{ fontSize: '11px', color: 'var(--portal-gray-600)', fontFamily: 'var(--font-dm-sans, sans-serif)', marginBottom: '2px' }}>
              Pagamentos
            </p>
            <p style={{ fontSize: '20px', fontFamily: 'var(--font-dm-serif, serif)', color: 'var(--portal-gray-950)', lineHeight: 1.1 }}>
              {pagamentosMesAtual.length}
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="pcard" style={{ padding: '16px 20px' }}>
          {[1, 2, 3, 4].map(i => <SkeletonListItem key={i} />)}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !data?.length && (
        <div className="pcard" style={{
          padding: '48px 24px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}>
          <Receipt size={40} color="var(--portal-gray-300)" />
          <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--portal-gray-800)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
            Nenhum pagamento registrado ainda
          </p>
        </div>
      )}

      {/* Cabeçalho de impressão — oculto em tela */}
      <div className="print-header">
        <span className="print-header-logo">SIAFI — Lidera</span>
        <div className="print-header-info">
          <div>Extrato de Pagamentos</div>
          <div>Gerado em {new Date().toLocaleString('pt-BR')}</div>
        </div>
      </div>

      {/* Grupos por mês */}
      {grupos.map(([key, items]) => (
        <div key={key}>
          <p style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--portal-gray-600)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
            fontFamily: 'var(--font-dm-sans, sans-serif)',
          }}>
            {fmtMonthLabel(key)}
          </p>

          <div className="pcard" style={{ padding: 0, overflow: 'hidden' }}>
            {items.map((p, idx) => {
              const metodoLabel = METODOS[p.metodoPagamento] ?? p.metodoPagamento
              const metodoColor = METODO_COLOR[p.metodoPagamento] ?? 'var(--portal-gray-600)'
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderBottom: idx < items.length - 1 ? '1px solid var(--portal-gray-100)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'var(--portal-green-100)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <CheckCircle2 size={18} color="var(--portal-green-600)" />
                    </div>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                        Parcela {p.numeroParcela}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <p style={{ fontSize: '11px', color: 'var(--portal-gray-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                          {fmtDate(p.dataPagamento)}
                        </p>
                        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--portal-gray-300)', display: 'inline-block' }} />
                        <p style={{ fontSize: '11px', color: metodoColor, fontWeight: 600, fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                          {metodoLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                  <MoneyDisplay value={p.valor} size="sm" color="green" />
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Rodapé de impressão */}
      <div className="print-footer">
        SIAFI — Sistema Integrado de Apoio Financeiro · Lidera Tecnologia<br />
        Documento gerado em {new Date().toLocaleString('pt-BR')}
      </div>
    </div>
  )
}
