'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { isClienteToken } from '@/lib/api'
import { portalTokenStore } from '@/lib/portal/portal-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function getRedirectParam() {
  if (typeof window === 'undefined') return '/portal'
  const r = new URLSearchParams(window.location.search).get('redirect')
  return r?.startsWith('/') ? r : '/portal'
}

export default function PortalLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [contaAtiva, setContaAtiva] = useState<string | null>(null)
  const [trocandoConta, setTrocandoConta] = useState(false)

  // Sessão de cliente já aberta: pergunta em vez de entrar sozinho, senão quem
  // precisa usar outra conta fica preso no portal. Sessão de staff é encerrada
  // para o AuthProvider global não redirecionar para o dashboard.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      if (!session) return
      if (isClienteToken(session.access_token)) {
        setContaAtiva(session.user?.user_metadata?.nome || session.user?.email || 'cliente')
      } else {
        supabase.auth.signOut()
      }
    })
  }, [])

  async function entrarComOutraConta() {
    setTrocandoConta(true)
    await getSupabaseBrowserClient().auth.signOut().catch(() => {})
    portalTokenStore.clear()
    setContaAtiva(null)
    setTrocandoConta(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (signInError) {
        setError('Email ou senha incorretos.')
        return
      }

      if (!data.session) {
        setError('Erro ao iniciar sessão. Tente novamente.')
        return
      }

      // Enforce client-only access
      const b64 = data.session.access_token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/')
      const payload = b64 ? JSON.parse(atob(b64)) : {}
      if (payload?.app_metadata?.role !== 'cliente') {
        await supabase.auth.signOut()
        setError('Esta área é exclusiva para clientes Lidera.')
        return
      }

      portalTokenStore.set(data.session.access_token)

      // Check if MFA elevation is required
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
        const redirect = getRedirectParam()
        router.replace('/portal/mfa-challenge?redirect=' + encodeURIComponent(redirect))
        return
      }

      router.replace(getRedirectParam())
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao fazer login. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex justify-center mb-5">
            <Image src="/logo.png" alt="SIAFI" width={160} height={48} className="object-contain h-12 w-auto" priority />
          </div>
          <CardTitle className="text-2xl font-bold text-center">Portal do Cliente</CardTitle>
          <p className="text-sm text-muted-foreground text-center">Entre com suas credenciais de acesso</p>
        </CardHeader>
        <CardContent>
          {contaAtiva ? (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Você está conectado como <span className="font-medium text-foreground break-words">{contaAtiva}</span>.
              </p>
              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10"
                onClick={() => router.replace(getRedirectParam())}
                disabled={trocandoConta}
              >
                Continuar no portal
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full h-10"
                onClick={entrarComOutraConta}
                disabled={trocandoConta}
              >
                {trocandoConta && <Loader2 className="size-4 animate-spin mr-2" />}
                Entrar com outra conta
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pr-10"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10"
                disabled={loading}
              >
                {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
          )}

          <div className="mt-4 pt-4 border-t text-center">
            <p className="text-xs text-muted-foreground mb-1">É da equipe Lidera?</p>
            <a
              href="/login"
              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
            >
              Acesso da equipe →
            </a>
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            SIAFI — Sistema Integrado de Apoio Financeiro · Lidera
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
