'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import api, { tokenStore } from '@/lib/api'
import { useAuth } from '@/contexts/auth.context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function MfaChallengePage() {
  const { completeMfa, logout } = useAuth()
  const router = useRouter()
  const [code, setCode] = useState('')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const tryLoad = async () => {
      // Wait up to 5s for the token to be available from auth context init
      let tries = 0
      while (!tokenStore.get() && tries < 50) {
        await new Promise(r => setTimeout(r, 100))
        tries++
      }

      if (!tokenStore.get()) {
        // No token even after waiting — check if we have a refresh token
        const localRefreshToken = typeof window !== 'undefined' ? localStorage.getItem('siafi_refresh_token') : null
        if (!localRefreshToken) {
          setError('Sessão expirada. Faça login novamente.')
          setLoading(false)
          setTimeout(() => router.replace('/login'), 2000)
          return
        }
        // Try to refresh manually
        try {
          const { data } = await api.post<{ accessToken: string; refreshToken?: string }>('/auth/refresh', {
            refreshToken: localRefreshToken
          })
          tokenStore.set(data.accessToken)
          if (data.refreshToken && typeof window !== 'undefined') {
            localStorage.setItem('siafi_refresh_token', data.refreshToken)
          }
        } catch {
          setError('Sessão expirada. Faça login novamente.')
          setLoading(false)
          setTimeout(() => router.replace('/login'), 2000)
          return
        }
      }

      // Now fetch MFA factors via backend (uses admin key — works with aal1)
      try {
        const { data } = await api.get<{ factors: Array<{ id: string; status: string; factor_type: string }> }>('/auth/mfa/factors')
        const verified = data.factors?.find(f => f.status === 'verified' && f.factor_type === 'totp')
        if (!verified) {
          router.replace('/mfa-setup')
          return
        }
        setFactorId(verified.id)
        setLoading(false)
        setTimeout(() => inputRef.current?.focus(), 50)
      } catch (err: any) {
        console.error('[mfa-challenge] Failed to load factors:', err)
        setError('Erro ao carregar autenticação. Faça login novamente.')
        setLoading(false)
        setTimeout(() => router.replace('/login'), 2500)
      }
    }

    tryLoad()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId || code.length !== 6) return
    setError(null)
    setSubmitting(true)

    try {
      // Use backend endpoint that proxies the Supabase challenge/verify
      const { data } = await api.post<{ accessToken: string; refreshToken: string }>('/auth/mfa/verify', {
        factorId,
        code,
      })

      // Save the new aal2 refresh token
      if (typeof window !== 'undefined' && data.refreshToken) {
        localStorage.setItem('siafi_refresh_token', data.refreshToken)
      }

      await completeMfa(data.accessToken)
      window.location.replace('/dashboard')
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Código inválido. Tente novamente.'
      setError(msg)
      setCode('')
      setTimeout(() => inputRef.current?.focus(), 50)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="size-6 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="pb-4 text-center">
        <div className="flex justify-center mb-3">
          <div className="size-12 rounded-full bg-blue-100 flex items-center justify-center">
            <ShieldCheck className="size-6 text-blue-600" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">Verificação em duas etapas</CardTitle>
        <p className="text-sm text-muted-foreground">
          Insira o código de 6 dígitos do seu aplicativo autenticador.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="totp-code">Código de verificação</Label>
            <Input
              id="totp-code"
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
            {submitting ? 'Verificando...' : 'Verificar'}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Abra o Google Authenticator ou outro app TOTP para ver o código.
        </p>

        <button
          type="button"
          onClick={async () => { await logout(); window.location.replace('/login') }}
          disabled={submitting}
          className="mt-3 w-full text-center text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          Entrar com outro usuário
        </button>
      </CardContent>
    </Card>
  )
}
