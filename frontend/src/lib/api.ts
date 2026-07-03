import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

let _accessToken: string | null = null

// Non-httpOnly marker cookie on the FRONTEND's own origin, read by proxy.ts (edge
// middleware) to gate routes. The real refresh_token cookie is set by the backend,
// which may live on a different origin (e.g. Railway's separate *.up.railway.app
// subdomains) and never reaches the frontend — so the middleware can't rely on it.
function setSessionCookie() {
  if (typeof document === 'undefined') return
  document.cookie = 'siafi_session=1; path=/; max-age=2592000; samesite=lax'
}
function clearSessionCookie() {
  if (typeof document === 'undefined') return
  document.cookie = 'siafi_session=; path=/; max-age=0; samesite=lax'
}

export const tokenStore = {
  get: () => _accessToken,
  set: (t: string) => { _accessToken = t; setSessionCookie() },
  clear: () => { _accessToken = null; clearSessionCookie() },
  onAuthLost: null as (() => void) | null,
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/')
    if (!b64) return null
    return JSON.parse(atob(b64))
  } catch {
    return null
  }
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api',
  withCredentials: true,
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.get()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let _isRefreshing = false
let _failedQueue: Array<{
  resolve: (value: string) => void
  reject: (reason: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  _failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token as string)
    }
  })
  _failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    const errorMsg = (error.response?.data as any)?.message;
    const isMfaError = errorMsg?.includes('MFA') || errorMsg?.includes('TOTP');
    if (isMfaError) {
      return Promise.reject(error);
    }

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    if (originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/auth/login')) {
      return Promise.reject(error)
    }

    if (_isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        _failedQueue.push({ resolve, reject })
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
        .catch((err) => Promise.reject(err))
    }

    originalRequest._retry = true
    _isRefreshing = true

    try {
      // Primary: NestJS refresh via httpOnly cookie with fallback in body
      const localRefreshToken = typeof window !== 'undefined' ? localStorage.getItem('siafi_refresh_token') : null;
      const { data } = await api.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
        refreshToken: localRefreshToken,
      });
      tokenStore.set(data.accessToken)
      if (typeof window !== 'undefined' && data.refreshToken) {
        localStorage.setItem('siafi_refresh_token', data.refreshToken);
      }
      processQueue(null, data.accessToken)
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
      return api(originalRequest)
    } catch (refreshError) {
      // Fallback: Supabase session from cookies (Google OAuth staff users only)
      try {
        const { getSupabaseBrowserClient } = await import('./supabase/client')
        const supabase = getSupabaseBrowserClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          const payload = decodeJwtPayload(session.access_token)
          const appRole = (payload?.app_metadata as Record<string, unknown> | undefined)?.role
          // Reject client sessions — prevents client session from contaminating staff API calls
          if (appRole !== 'cliente') {
            tokenStore.set(session.access_token)
            processQueue(null, session.access_token)
            originalRequest.headers.Authorization = `Bearer ${session.access_token}`
            return api(originalRequest)
          }
        }
      } catch {}

      processQueue(refreshError, null)
      tokenStore.clear()
      tokenStore.onAuthLost?.()
      return Promise.reject(refreshError)
    } finally {
      _isRefreshing = false
    }
  }
)

export default api
