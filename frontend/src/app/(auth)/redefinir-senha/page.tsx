'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Image from 'next/image'
import { Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Estado = 'verificando' | 'formulario' | 'salvando' | 'sucesso' | 'link_invalido' | 'erro'
type TipoUsuario = 'cliente' | 'staff'

// ─── Validação ────────────────────────────────────────────────────────────────

const schema = z.object({
  novaSenha: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Deve conter ao menos um número')
    .regex(/[^A-Za-z0-9]/, 'Deve conter ao menos um caractere especial'),
  confirmarSenha: z.string(),
}).refine(d => d.novaSenha === d.confirmarSenha, {
  message: 'As senhas não conferem',
  path: ['confirmarSenha'],
})

type FormData = z.infer<typeof schema>

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function calcStrength(password: string): { level: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
  if (!password) return { level: 0, label: '', color: '' }
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const met = checks.filter(Boolean).length
  if (met <= 1) return { level: 1, label: 'Fraca', color: '#ef4444' }
  if (met === 2) return { level: 2, label: 'Média', color: '#f97316' }
  if (met === 3) return { level: 3, label: 'Boa', color: '#84cc16' }
  return password.length >= 12
    ? { level: 4, label: 'Forte', color: '#22c55e' }
    : { level: 3, label: 'Boa', color: '#84cc16' }
}

function PasswordStrengthBar({ password }: { password: string }) {
  const { level, label, color } = calcStrength(password)
  if (!password) return null
  return (
    <div className="space-y-1 mt-1">
      <div className="flex gap-1">
        {([1, 2, 3, 4] as const).map(n => (
          <div
            key={n}
            className="h-1.5 flex-1 rounded-full transition-all duration-300"
            style={{ backgroundColor: n <= level ? color : '#e5e7eb' }}
          />
        ))}
      </div>
      <p className="text-xs font-medium" style={{ color: level > 0 ? color : undefined }}>
        {label}
      </p>
    </div>
  )
}

function CriteriaItem({ met, text }: { met: boolean; text: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs ${met ? 'text-green-600' : 'text-muted-foreground'}`}>
      {met
        ? <CheckCircle2 className="size-3 shrink-0" />
        : <div className="size-3 shrink-0 rounded-full border border-current" />}
      {text}
    </li>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function RedefinirSenhaPage() {
  const router = useRouter()

  const [estado, setEstado]                   = useState<Estado>('verificando')
  const [tipoUsuario, setTipoUsuario]         = useState<TipoUsuario>('cliente')
  const [mensagemErro, setMensagemErro]       = useState('')
  const [segundosRestantes, setSegundosRestantes] = useState(5)
  const [showPass, setShowPass]               = useState(false)
  const [showConfirm, setShowConfirm]         = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  })

  const novaSenha = watch('novaSenha') ?? ''

  // ── Inicialização: lê o hash da URL ────────────────────────────────────────

  useEffect(() => {
    const hash   = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)

    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type         = params.get('type')

    if (!accessToken || !refreshToken || type !== 'recovery') {
      setEstado('link_invalido')
      return
    }

    // Remove tokens da barra de endereços imediatamente
    window.history.replaceState({}, '', window.location.pathname)

    // Determina tipo de usuário decodificando o payload JWT (sem verificar assinatura)
    try {
      const b64     = accessToken.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(atob(b64))
      const role    = payload?.app_metadata?.role ?? 'staff'
      setTipoUsuario(role === 'cliente' ? 'cliente' : 'staff')
    } catch {
      setTipoUsuario('staff')
    }

    getSupabaseBrowserClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }: { error: unknown }) => { setEstado(error ? 'link_invalido' : 'formulario') })
      .catch(() => setEstado('link_invalido'))
  }, [])

  // ── Countdown e redirecionamento após sucesso ──────────────────────────────

  useEffect(() => {
    if (estado !== 'sucesso') return
    const destino = tipoUsuario === 'cliente' ? '/portal/login' : '/login'
    let contador = 5
    setSegundosRestantes(contador)
    const interval = setInterval(() => {
      contador -= 1
      setSegundosRestantes(contador)
      if (contador <= 0) {
        clearInterval(interval)
        router.replace(destino)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [estado, tipoUsuario, router])

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function onSubmit(data: FormData) {
    setEstado('salvando')
    setMensagemErro('')
    try {
      const supabase = getSupabaseBrowserClient()

      if (tipoUsuario === 'staff') {
        // Operadores: a troca é feita pelo backend com a chave admin. O
        // updateUser do cliente exige sessão aal2 quando a conta tem MFA e a
        // sessão de recovery é sempre aal1 ("AAL2 session is required..."); o
        // backend também sincroniza o hash bcrypt validado no login.
        const { data: { session } } = await supabase.auth.getSession()
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api'
        const res = await fetch(`${apiUrl}/auth/redefinir-senha`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({ novaSenha: data.novaSenha }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.message ?? 'Falha ao redefinir a senha. Tente novamente.')
        }
      } else {
        // Clientes do portal não têm MFA obrigatório: updateUser funciona em aal1.
        const { error } = await supabase.auth.updateUser({ password: data.novaSenha })
        if (error) throw error
      }

      await supabase.auth.signOut().catch(() => {})
      setEstado('sucesso')
    } catch (err: any) {
      setMensagemErro(err?.message ?? 'Erro ao salvar a senha. Tente novamente.')
      setEstado('erro')
    }
  }

  const destino  = tipoUsuario === 'cliente' ? '/portal/login' : '/login'
  const criteria = {
    length:  novaSenha.length >= 8,
    upper:   /[A-Z]/.test(novaSenha),
    number:  /[0-9]/.test(novaSenha),
    special: /[^A-Za-z0-9]/.test(novaSenha),
  }

  const logo = (
    <div className="flex justify-center mb-6">
      <Image
        src="/logo.png"
        alt="SIAFI"
        width={180}
        height={54}
        className="object-contain h-12 w-auto"
        priority
      />
    </div>
  )

  // ── Estado: verificando ────────────────────────────────────────────────────

  if (estado === 'verificando') {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
          {logo}
          <Loader2 className="size-8 animate-spin text-blue-600" />
          <p className="text-sm text-muted-foreground">Verificando seu link de acesso...</p>
        </CardContent>
      </Card>
    )
  }

  // ── Estado: link_invalido ──────────────────────────────────────────────────

  if (estado === 'link_invalido') {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          {logo}
          <CardTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="size-5" />
            Link inválido ou expirado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Este link de redefinição já foi usado ou expirou. Os links são válidos por{' '}
            <strong>12 horas</strong> e de uso único.
          </p>
          <p className="text-sm text-muted-foreground">
            Entre em contato com seu consultor para solicitar um novo link.
          </p>
          <Button className="w-full" variant="outline" onClick={() => router.replace(destino)}>
            Ir para o login
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Estado: sucesso ────────────────────────────────────────────────────────

  if (estado === 'sucesso') {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          {logo}
          <CardTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="size-5" />
            Senha definida com sucesso!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Redirecionando para o login em <strong>{segundosRestantes}s</strong>...
          </p>
          <Button className="w-full" onClick={() => router.replace(destino)}>
            Ir para o login agora
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Estado: erro ───────────────────────────────────────────────────────────

  if (estado === 'erro') {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          {logo}
          <CardTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="size-5" />
            Erro ao salvar senha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{mensagemErro}</p>
          <Button className="w-full" variant="outline" onClick={() => setEstado('formulario')}>
            <RefreshCw className="size-4 mr-2" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Estado: formulario / salvando ──────────────────────────────────────────

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="pb-4">
        {logo}
        <CardTitle className="text-2xl font-bold">Defina sua nova senha</CardTitle>
        <CardDescription>
          Escolha uma senha segura para proteger sua conta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>

          {/* Nova senha */}
          <div className="space-y-2">
            <Label htmlFor="novaSenha">Nova senha *</Label>
            <div className="relative">
              <Input
                id="novaSenha"
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                className="pr-10"
                disabled={estado === 'salvando'}
                {...register('novaSenha')}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <PasswordStrengthBar password={novaSenha} />
            <ul className="space-y-0.5 mt-1">
              <CriteriaItem met={criteria.length}  text="Mínimo 8 caracteres" />
              <CriteriaItem met={criteria.upper}   text="Ao menos uma letra maiúscula" />
              <CriteriaItem met={criteria.number}  text="Ao menos um número" />
              <CriteriaItem met={criteria.special} text="Ao menos um caractere especial" />
            </ul>
            {errors.novaSenha && (
              <p className="text-xs text-destructive">{errors.novaSenha.message}</p>
            )}
          </div>

          {/* Confirmar senha */}
          <div className="space-y-2">
            <Label htmlFor="confirmarSenha">Confirmar nova senha *</Label>
            <div className="relative">
              <Input
                id="confirmarSenha"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                className="pr-10"
                disabled={estado === 'salvando'}
                {...register('confirmarSenha')}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.confirmarSenha && (
              <p className="text-xs text-destructive">{errors.confirmarSenha.message}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11"
            disabled={estado === 'salvando'}
          >
            {estado === 'salvando' && <Loader2 className="size-4 animate-spin mr-2" />}
            {estado === 'salvando' ? 'Salvando...' : 'Salvar nova senha'}
          </Button>

        </form>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          SIAFI — Sistema Integrado de Apoio Financeiro
        </p>
      </CardContent>
    </Card>
  )
}
