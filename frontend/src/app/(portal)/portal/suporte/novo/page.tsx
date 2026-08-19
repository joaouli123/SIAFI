'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { portalApi } from '@/lib/portal/portal-api'
import { Select } from '@/components/ui/select'

const ASSUNTOS = [
  'Dúvida sobre parcela',
  'Problema com pagamento PIX',
  'Solicitação de renegociação',
  'Atualização de dados cadastrais',
  'Outro',
]

const schema = z.object({
  assunto: z.string().min(1, 'Selecione um assunto'),
  mensagem: z.string().min(10, 'Mensagem muito curta (mínimo 10 caracteres)').max(500, 'Máximo 500 caracteres'),
})

type FormData = z.infer<typeof schema>

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '8px',
  border: '1px solid var(--portal-gray-300)',
  background: 'var(--portal-white)',
  fontSize: '14px',
  fontFamily: 'var(--font-dm-sans, sans-serif)',
  color: 'var(--portal-gray-950)',
  appearance: 'none',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--portal-gray-800)',
  marginBottom: '6px',
  fontFamily: 'var(--font-dm-sans, sans-serif)',
}

export default function NovoTicketPage() {
  const router = useRouter()
  const qc = useQueryClient()

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  })

  const mensagemLen = (watch('mensagem') || '').length

  const mutation = useMutation({
    mutationFn: (data: FormData) => portalApi.createTicket(data.assunto, data.mensagem),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'suporte'] })
      router.push('/portal/suporte')
    },
  })

  async function onSubmit(data: FormData) {
    await mutation.mutateAsync(data)
  }

  return (
    <div className="portal-page" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/portal/suporte" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '8px', border: '1px solid var(--portal-gray-300)', background: 'var(--portal-white)', color: 'var(--portal-gray-600)' }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--portal-gray-950)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
          Novo chamado
        </h1>
      </div>

      {/* Formulário */}
      <div className="pcard" style={{ padding: '24px' }}>
        <p style={{ fontSize: '14px', color: 'var(--portal-gray-600)', fontFamily: 'var(--font-dm-sans, sans-serif)', marginBottom: '20px' }}>
          Descreva sua dúvida ou problema e nossa equipe responderá em breve.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Assunto */}
          <div>
            <label style={labelStyle}>Assunto *</label>
            <Select
              unstyled
              {...register('assunto')}
              style={{ ...inputStyle, paddingRight: '32px', cursor: 'pointer' }}
            >
              <option value="">Selecione o assunto...</option>
              {ASSUNTOS.map(a => <option key={a} value={a}>{a}</option>)}
            </Select>
            {errors.assunto && (
              <p style={{ fontSize: '12px', color: 'var(--portal-red-600)', marginTop: '4px', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                {errors.assunto.message}
              </p>
            )}
          </div>

          {/* Mensagem */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Mensagem *</label>
              <span style={{
                fontSize: '11px',
                color: mensagemLen > 480 ? 'var(--portal-amber-600)' : 'var(--portal-gray-600)',
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                fontWeight: mensagemLen > 480 ? 600 : 400,
              }}>
                {mensagemLen}/500
              </span>
            </div>
            <textarea
              {...register('mensagem')}
              rows={5}
              placeholder="Descreva detalhadamente sua dúvida ou problema..."
              style={{
                ...inputStyle,
                resize: 'vertical',
                minHeight: '120px',
              }}
            />
            {errors.mensagem && (
              <p style={{ fontSize: '12px', color: 'var(--portal-red-600)', marginTop: '4px', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                {errors.mensagem.message}
              </p>
            )}
          </div>

          {/* Erro de envio */}
          {mutation.isError && (
            <div style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'var(--portal-red-100)',
              border: '1px solid var(--portal-red-600)',
            }}>
              <p style={{ fontSize: '13px', color: 'var(--portal-red-600)', fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
                Erro ao enviar chamado. Por favor, tente novamente.
              </p>
            </div>
          )}

          {/* Botões */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <Link href="/portal/suporte" style={{ flex: 1, textDecoration: 'none' }}>
              <button type="button" style={{
                width: '100%',
                padding: '13px',
                borderRadius: '10px',
                border: '1px solid var(--portal-gray-300)',
                background: 'var(--portal-white)',
                color: 'var(--portal-gray-600)',
                fontSize: '14px',
                fontWeight: 500,
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                cursor: 'pointer',
              }}>
                Cancelar
              </button>
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || mutation.isPending}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '13px',
                borderRadius: '10px',
                border: 'none',
                background: isSubmitting || mutation.isPending ? 'var(--portal-gray-300)' : 'var(--portal-blue-600)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 700,
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                cursor: isSubmitting || mutation.isPending ? 'not-allowed' : 'pointer',
                transition: 'background 200ms ease',
              }}
            >
              {(isSubmitting || mutation.isPending)
                ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Enviando...</>
                : <><Send size={16} /> Enviar chamado</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
