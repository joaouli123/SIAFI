import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = [
  '/login', '/mfa-challenge', '/mfa-setup', '/api', '/_next', '/favicon.ico', '/auth',
  '/portal/login', '/portal/mfa-challenge', '/portal/mfa-setup', '/portal/primeiro-acesso',
  '/redefinir-senha', '/esqueci-senha',
]

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function hasActiveSession(request: NextRequest): boolean {
  // Marker cookie set by the frontend itself (lib/api.ts tokenStore) whenever an
  // access token is held in memory. Works even when backend and frontend are on
  // different origins (e.g. Railway), unlike the cookies below which the backend
  // sets on its own domain and the frontend origin never receives.
  if (request.cookies.has('siafi_session')) return true
  // NestJS username/password session (httpOnly cookie set by backend after login)
  if (request.cookies.has('refresh_token')) return true
  // Supabase session — Google OAuth (cookie set by /auth/callback route handler)
  return request.cookies.getAll().some((c) => c.name.includes('-auth-token'))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    // Não redirecionar /login -> /dashboard por cookie. Cookies de sessão podem
    // estar mortos (refresh_token expirado, marcador siafi_session órfão) e o
    // dashboard devolveria para /login → loop com spinner eterno. Quem decide
    // se há sessão válida é o AuthContext (que consulta a API); a página de
    // login já redireciona sozinha quando isAuthenticated=true.
    return NextResponse.next()
  }

  if (!hasActiveSession(request)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
