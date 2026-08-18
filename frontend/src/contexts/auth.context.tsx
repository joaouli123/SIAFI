'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import api, { tokenStore } from '@/lib/api'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export type UserRole = 'admin' | 'financeiro' | 'consultor' | 'caixa' | 'cliente'

export interface AuthUser {
  id: number
  username: string
  nome: string
  role: UserRole
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (credentials: { identificador: string; password: string }) => Promise<{ needsMfa?: boolean; setupMfaRequired?: boolean; role?: UserRole }>
  loginWithGoogle: () => Promise<void>
  completeMfa: (aal2Token: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

async function fetchMe(): Promise<AuthUser & { needsMfa?: boolean }> {
  const { data } = await api.get<AuthUser & { needsMfa?: boolean }>('/auth/me')
  return data
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    tokenStore.onAuthLost = () => { setUser(null) }
    return () => { tokenStore.onAuthLost = null }
  }, [])

  useEffect(() => {
    let cancelled = false

    // Redireciona sessões aal1 com MFA pendente para o challenge — exceto nas
    // páginas de MFA e no /login (permite re-login/troca de usuário sem loop).
    // Retorna true quando disparou navegação (full page load em andamento).
    function redirectToMfa(): boolean {
      if (cancelled || typeof window === 'undefined') return false
      const path = window.location.pathname
      if (path.includes('/mfa-challenge') || path.includes('/mfa-setup') || path.includes('/login') || path.includes('/redefinir-senha')) {
        return false
      }
      window.location.replace('/mfa-challenge')
      return true
    }

    // Retorna true quando disparou navegação — nesse caso isLoading fica true
    // para o layout manter o spinner e NÃO competir com redirect próprio.
    async function init(): Promise<boolean> {
      const supabase = getSupabaseBrowserClient()

      // -1. Link de recuperação de senha que caiu fora de /redefinir-senha
      // (Supabase manda para o Site URL quando o redirect_to não está na
      // allow-list). O token vem no hash e criaria sessão silenciosamente —
      // repassa para a tela correta com o hash intacto.
      const hash = window.location.hash
      if (hash.includes('type=recovery') && !window.location.pathname.startsWith('/redefinir-senha')) {
        window.location.replace(`/redefinir-senha${hash}`)
        return true
      }

      // 0. Handle OAuth callback code in URL (any page, any port)
      const urlCode = new URLSearchParams(window.location.search).get('code')
      if (urlCode) {
        window.history.replaceState({}, '', window.location.pathname)
        const { data: exchangeData } = await supabase.auth.exchangeCodeForSession(urlCode)
        if (exchangeData.session?.access_token) {
          tokenStore.set(exchangeData.session.access_token)
          try {
            const me = await fetchMe()
            if (!cancelled) {
              setUser(me)
              window.location.replace('/dashboard')
            }
          } catch {
            await supabase.auth.signOut()
            tokenStore.clear()
            if (!cancelled) window.location.replace('/login?error=acesso_negado')
          }
          return true
        }
      }

      // 1. Try existing in-memory token
      try {
        const me = await fetchMe()
        if (me.needsMfa) {
          // Token is valid (aal1) but MFA not yet completed.
          // Do NOT set user — the MFA pages handle their own rendering.
          return redirectToMfa()
        }
        if (!cancelled) setUser(me)
        return false
      } catch {}

      // 2. Try NestJS refresh via httpOnly cookie with fallback in body
      try {
        const localRefreshToken = typeof window !== 'undefined' ? localStorage.getItem('siafi_refresh_token') : null
        const { data } = await api.post<{ accessToken: string; refreshToken?: string }>('/auth/refresh', {
          refreshToken: localRefreshToken
        })
        tokenStore.set(data.accessToken)
        if (typeof window !== 'undefined' && data.refreshToken) {
          localStorage.setItem('siafi_refresh_token', data.refreshToken)
        }
        const me = await fetchMe()
        if (me.needsMfa) {
          return redirectToMfa()
        }
        if (!cancelled) setUser(me)
        return false
      } catch {}

      // 3. Check Supabase session (Google OAuth staff only — NEVER client sessions)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          // Decode JWT to reject client sessions — prevents a client Supabase session
          // stored in a staff browser from silently authenticating as the wrong user
          const parts = session.access_token.split('.')
          const payload = parts[1]
            ? JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
            : {}
          const appRole = (payload?.app_metadata as Record<string, unknown> | undefined)?.role
          if (appRole !== 'cliente') {
            tokenStore.set(session.access_token)
            const me = await fetchMe()
            if (me.needsMfa) {
              return redirectToMfa()
            }
            if (!cancelled) setUser(me)
          }
        }
      } catch {}

      return false
    }

    init().then((navigating) => {
      if (!cancelled && !navigating) setIsLoading(false)
    })

    return () => { cancelled = true }
  }, [])

  async function login(credentials: { identificador: string; password: string }) {
    const { data } = await api.post<{
      accessToken: string
      refreshToken: string
      user: AuthUser
      needsMfa?: boolean
      setupMfaRequired?: boolean
    }>('/auth/login', credentials)

    tokenStore.set(data.accessToken)
    if (typeof window !== 'undefined' && data.refreshToken) {
      localStorage.setItem('siafi_refresh_token', data.refreshToken)
    }

    if (data.needsMfa) {
      return { needsMfa: true }
    }

    if (data.setupMfaRequired) {
      return { setupMfaRequired: true }
    }

    setUser(data.user)
    return { role: data.user.role }
  }

  async function completeMfa(aal2Token: string) {
    tokenStore.set(aal2Token)
    const me = await fetchMe()
    setUser(me)
  }

  async function loginWithGoogle() {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  async function logout() {
    try { await api.post('/auth/logout') } catch {}
    try {
      const supabase = getSupabaseBrowserClient()
      await supabase.auth.signOut()
    } catch {}
    tokenStore.clear()
    if (typeof window !== 'undefined') {
      localStorage.removeItem('siafi_refresh_token')
    }
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, loginWithGoogle, completeMfa, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}
