import { getSupabaseServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getPublicOrigin(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host = request.headers.get('host') ?? 'siafi.app.br'
  return `${proto}://${host}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const origin = getPublicOrigin(request)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth_cancelado`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_falhou`)
  }

  const supabase = await getSupabaseServerClient()
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data?.session) {
    return NextResponse.redirect(`${origin}/login?error=auth_falhou`)
  }

  const { user } = data.session

  // Validar no backend: verifica se o email está pré-cadastrado.
  // Se não estiver, o backend deleta a conta do Supabase e retorna 403.
  // Qualquer falha de rede também nega o acesso por precaução.
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4010/api'
    const res = await fetch(`${apiUrl}/auth/validate-google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        supabaseUserId: user.id,
      }),
    })

    if (!res.ok) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=conta_nao_cadastrada`)
    }

    const { tipo } = (await res.json()) as { tipo: 'operador' | 'cliente' }
    const destino = tipo === 'cliente' ? '/portal' : '/dashboard'
    return NextResponse.redirect(`${origin}${destino}`)

  } catch {
    // Falha de rede — negar por precaução, nunca liberar
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=erro_validacao`)
  }
}
