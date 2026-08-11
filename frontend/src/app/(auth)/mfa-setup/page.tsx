'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck, Smartphone, QrCode, KeyRound, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth.context'
import { mfaChallengeAndVerify, mfaEnroll, type EnrollResult } from '@/lib/supabase/mfa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const STEPS = [
  {
    icon: Smartphone,
    title: 'Baixe o Google Authenticator',
    description: (
      <span>
        Instale o app no seu celular:{' '}
        <a
          href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          Android (Play Store)
        </a>{' '}
        ou{' '}
        <a
          href="https://apps.apple.com/app/google-authenticator/id388497605"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          iPhone (App Store)
        </a>
        .
      </span>
    ),
  },
  {
    icon: QrCode,
    title: 'Escaneie o QR Code',
    description: (
      <span>
        Abra o Google Authenticator, toque em{' '}
        <strong className="text-foreground">+</strong> (canto inferior direito) e escolha{' '}
        <strong className="text-foreground">"Ler código QR"</strong>. Aponte a câmera para o
        código abaixo.
      </span>
    ),
  },
  {
    icon: KeyRound,
    title: 'Sem câmera? Use a chave manual',
    description: (
      <span>
        No app, escolha <strong className="text-foreground">"Inserir chave de configuração"</strong>,
        digite o nome <strong className="text-foreground">SIAFI</strong> e cole a chave exibida
        abaixo. Tipo: <strong className="text-foreground">Baseado em tempo</strong>.
      </span>
    ),
  },
  {
    icon: CheckCircle2,
    title: 'Digite o código e confirme',
    description: (
      <span>
        O app mostrará um código de 6 dígitos que muda a cada 30 segundos. Digite-o no campo
        abaixo e clique em <strong className="text-foreground">"Ativar MFA"</strong>.
      </span>
    ),
  },
]

export default function MfaSetupPage() {
  const { completeMfa } = useAuth()
  const router = useRouter()
  const [enrollment, setEnrollment] = useState<EnrollResult | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    mfaEnroll()
      .then((result) => {
        setEnrollment(result)
        setLoading(false)
        setTimeout(() => inputRef.current?.focus(), 50)
      })
      .catch((err) => {
        setError(err?.message ?? 'Erro ao iniciar configuração do MFA.')
        setLoading(false)
      })
  }, [])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!enrollment || code.length !== 6) return
    setError(null)
    setSubmitting(true)
    try {
      const { access_token } = await mfaChallengeAndVerify(enrollment.id, code)
      setDone(true)
      await completeMfa(access_token)
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err?.message ?? 'Código inválido. Verifique o app e tente novamente.')
      setCode('')
      setTimeout(() => inputRef.current?.focus(), 50)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-blue-600" />
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex items-center justify-center">
        <div className="text-center space-y-2">
          <ShieldCheck className="size-10 text-green-600 mx-auto" />
          <p className="font-medium">MFA ativado com sucesso!</p>
          <p className="text-sm text-muted-foreground">Redirecionando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg space-y-4">
      {/* Manual do Google Authenticator */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
        <CardHeader className="pb-3 pt-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-blue-600" />
            <CardTitle className="text-base text-blue-800 dark:text-blue-300">
              Como configurar o Google Authenticator
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <div key={i} className="flex gap-3">
                <div className="shrink-0 flex items-start gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
                    {i + 1}
                  </span>
                  <Icon className="size-4 text-blue-600 mt-0.5" />
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-foreground">{step.title}</p>
                  <p className="text-muted-foreground mt-0.5">{step.description}</p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* QR Code + verificação */}
      <Card className="shadow-lg">
        <CardHeader className="pb-4 text-center">
          <CardTitle className="text-xl font-bold">Escanear QR Code</CardTitle>
          <p className="text-sm text-muted-foreground">
            Após escanear, insira o código de 6 dígitos para confirmar.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && !enrollment && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {enrollment && (
            <>
              <div className="flex justify-center">
                {enrollment.totp.qr_code.startsWith('data:image') ? (
                  <img
                    src={enrollment.totp.qr_code}
                    alt="QR Code MFA"
                    width={200}
                    height={200}
                    className="rounded-lg border bg-white p-2"
                  />
                ) : (
                  <div
                    className="rounded-lg border bg-white p-2 flex items-center justify-center [&>svg]:size-[200px]"
                    dangerouslySetInnerHTML={{ __html: enrollment.totp.qr_code }}
                  />
                )}
              </div>

              <div className="rounded-lg bg-slate-50 dark:bg-slate-900 border px-3 py-2 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  Ou insira a chave manualmente no app:
                </p>
                <p className="font-mono text-sm font-semibold tracking-wider break-all select-all">
                  {enrollment.totp.secret}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Selecione o texto acima para copiar
                </p>
              </div>

              <form onSubmit={handleVerify} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="totp-verify">Código de verificação (6 dígitos)</Label>
                  <Input
                    id="totp-verify"
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="text-center text-2xl tracking-widest font-mono h-14"
                    autoComplete="one-time-code"
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    O código muda a cada 30 segundos — se expirar, aguarde o próximo.
                  </p>
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10"
                  disabled={submitting || code.length !== 6}
                >
                  {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
                  {submitting ? 'Ativando...' : 'Ativar MFA'}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
