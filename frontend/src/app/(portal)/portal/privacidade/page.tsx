'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, FileText, Send, ExternalLink } from 'lucide-react'
import { portalApi } from '@/lib/portal/portal-api'
import { usePortalAuth } from '@/contexts/portal-auth.context'
import { Select } from '@/components/ui/select'

const TIPOS_SOLICITACAO = [
  { value: 'acesso',                   label: 'Quero uma cópia de todos os meus dados' },
  { value: 'retificacao',              label: 'Preciso corrigir um dado incorreto' },
  { value: 'exclusao',                 label: 'Quero excluir minha conta e dados' },
  { value: 'portabilidade',            label: 'Quero exportar meus dados (JSON)' },
  { value: 'oposicao',                 label: 'Me oponho ao tratamento de um dado específico' },
  { value: 'revogacao_consentimento',  label: 'Quero revogar um consentimento dado' },
  { value: 'informacao',               label: 'Tenho uma dúvida sobre meus dados' },
] as const

const LABEL_TIPO: Record<string, string> = {
  termos_uso:              'Termos de Uso',
  politica_privacidade:    'Política de Privacidade',
  cookies_analiticos:      'Cookies Analíticos',
  marketing_whatsapp:      'Marketing via WhatsApp',
  marketing_email:         'Marketing via Email',
}

const LABEL_STATUS: Record<string, string> = {
  aberto:     'Aberta',
  em_analise: 'Em análise',
  concluido:  'Concluída',
  negado:     'Negada',
}

const STATUS_COLOR: Record<string, string> = {
  aberto:     'var(--portal-blue-600)',
  em_analise: 'var(--portal-amber-600)',
  concluido:  'var(--portal-green-600)',
  negado:     'var(--portal-red-600)',
}

function maskCpf(cpf: string | null | undefined) {
  if (!cpf) return 'Não informado'
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return '***.***.***-**'
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export default function PrivacidadePage() {
  const { user } = usePortalAuth()
  const [tipo, setTipo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [enviado, setEnviado] = useState(false)

  const { data: meusDados } = useQuery({
    queryKey: ['portal', 'meus-dados'],
    queryFn: portalApi.getMeusDados,
  })

  const { data: consentimentos } = useQuery<any[]>({
    queryKey: ['portal', 'consentimentos'],
    queryFn: portalApi.listarConsentimentos,
  })

  const { data: solicitacoes } = useQuery<any[]>({
    queryKey: ['portal', 'solicitacoes-titular'],
    queryFn: portalApi.listarSolicitacoesTitular,
  })

  const criarMut = useMutation({
    mutationFn: () => portalApi.criarSolicitacaoTitular({ tipo, descricao }),
    onSuccess: () => { setEnviado(true); setTipo(''); setDescricao('') },
  })

  const dados = meusDados?.titular?.dados_pessoais

  const cardStyle = {
    background: 'var(--portal-white)',
    borderRadius: '12px',
    border: '1px solid var(--portal-gray-200)',
    padding: '16px',
    marginBottom: '16px',
  }

  const labelStyle = {
    fontSize: '11px',
    color: 'var(--portal-gray-500)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    fontFamily: 'var(--font-dm-sans, sans-serif)',
  }

  const valueStyle = {
    fontSize: '14px',
    color: 'var(--portal-gray-900)',
    fontFamily: 'var(--font-dm-sans, sans-serif)',
  }

  return (
    <div className="portal-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/portal/perfil" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '8px', border: '1px solid var(--portal-gray-300)', background: 'var(--portal-white)', color: 'var(--portal-gray-600)' }}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
            Privacidade e Dados
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--portal-gray-500)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
            Seus dados pessoais e direitos LGPD
          </p>
        </div>
      </div>

      {/* Seus dados */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <ShieldCheck size={16} color="var(--portal-blue-600)" />
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--portal-gray-900)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
            Seus dados
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {[
            { label: 'Nome', value: dados?.nome ?? user?.nome ?? '—' },
            { label: 'Email', value: dados?.email ?? user?.email ?? '—' },
            { label: 'WhatsApp', value: dados?.whatsapp ?? '—' },
            { label: 'Contratos', value: `${meusDados?.titular?.contratos?.length ?? 0} contrato(s)` },
            { label: 'Termos aceitos em', value: dados?.termosAceitosEm ? new Date(dados.termosAceitosEm).toLocaleDateString('pt-BR') : 'Não registrado' },
            { label: 'Política aceita em', value: dados?.politicaAceitaEm ? new Date(dados.politicaAceitaEm).toLocaleDateString('pt-BR') : 'Não registrado' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={labelStyle}>{label}</p>
              <p style={valueStyle}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Consentimentos */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <FileText size={16} color="var(--portal-blue-600)" />
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--portal-gray-900)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
            Seus consentimentos
          </span>
        </div>
        {!consentimentos?.length ? (
          <p style={{ fontSize: '13px', color: 'var(--portal-gray-500)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
            Nenhum consentimento registrado.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {consentimentos.map((c: any) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '6px', background: 'var(--portal-gray-100)' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--portal-gray-900)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                    {LABEL_TIPO[c.tipo] ?? c.tipo}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--portal-gray-500)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                    v{c.versao} · {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: c.aceito ? '#dcfce7' : '#fee2e2',
                  color: c.aceito ? '#16a34a' : '#dc2626',
                  fontFamily: 'var(--font-dm-sans, sans-serif)',
                }}>
                  {c.aceito ? 'Aceito' : 'Revogado'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Solicitações anteriores */}
      {!!solicitacoes?.length && (
        <div style={cardStyle}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--portal-gray-900)', marginBottom: '12px', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
            Solicitações anteriores
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {solicitacoes.map((s: any) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '6px', background: 'var(--portal-gray-100)' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--portal-gray-900)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                    #{s.id} · {TIPOS_SOLICITACAO.find(t => t.value === s.tipo)?.label ?? s.tipo}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--portal-gray-500)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                    {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: STATUS_COLOR[s.status] ?? 'var(--portal-gray-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                  {LABEL_STATUS[s.status] ?? s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulário de solicitação */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Send size={16} color="var(--portal-blue-600)" />
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--portal-gray-900)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
            Exercer meus direitos
          </span>
        </div>

        {enviado ? (
          <div style={{ textAlign: 'center', padding: '16px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#16a34a', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
              ✓ Solicitação enviada com sucesso!
            </p>
            <p style={{ fontSize: '12px', color: '#15803d', marginTop: '4px', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
              Responderemos em até 15 dias úteis pelo email cadastrado.
            </p>
            <button
              onClick={() => setEnviado(false)}
              style={{ marginTop: '10px', fontSize: '12px', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--font-dm-sans, sans-serif)' }}
            >
              Enviar outra solicitação
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ ...labelStyle, display: 'block', marginBottom: '6px' }}>Tipo de solicitação</label>
              <Select
                unstyled
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 32px 10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--portal-gray-300)',
                  fontSize: '13px',
                  color: 'var(--portal-gray-900)',
                  background: 'var(--portal-white)',
                  fontFamily: 'var(--font-dm-sans, sans-serif)',
                  outline: 'none',
                }}
              >
                <option value="">Selecione...</option>
                {TIPOS_SOLICITACAO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>

            <div>
              <label style={{ ...labelStyle, display: 'block', marginBottom: '6px' }}>Descrição</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva sua solicitação com detalhes..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--portal-gray-300)',
                  fontSize: '13px',
                  color: 'var(--portal-gray-900)',
                  background: 'var(--portal-white)',
                  fontFamily: 'var(--font-dm-sans, sans-serif)',
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
            </div>

            <button
              onClick={() => criarMut.mutate()}
              disabled={!tipo || !descricao.trim() || criarMut.isPending}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                background: tipo && descricao.trim() ? 'var(--portal-blue-600)' : 'var(--portal-gray-300)',
                color: tipo && descricao.trim() ? '#fff' : 'var(--portal-gray-500)',
                fontSize: '14px',
                fontWeight: 600,
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                cursor: tipo && descricao.trim() && !criarMut.isPending ? 'pointer' : 'not-allowed',
              }}
            >
              {criarMut.isPending ? 'Enviando...' : 'Enviar solicitação'}
            </button>
          </div>
        )}
      </div>

      {/* Links legais */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[
          { href: '/politica-de-privacidade', label: 'Política de Privacidade completa' },
          { href: '/termos-de-uso', label: 'Termos de Uso' },
          { href: '/politica-de-cookies', label: 'Política de Cookies' },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            target="_blank"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid var(--portal-gray-200)',
              background: 'var(--portal-white)',
              color: 'var(--portal-blue-600)',
              textDecoration: 'none',
              fontSize: '13px',
              fontFamily: 'var(--font-dm-sans, sans-serif)',
            }}
          >
            <ExternalLink size={14} />
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}
