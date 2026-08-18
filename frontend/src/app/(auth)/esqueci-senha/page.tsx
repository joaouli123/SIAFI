'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, KeyRound, Loader2, MailCheck } from 'lucide-react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const schema = z.object({
  identificador: z.string().trim().min(2, 'Informe seu usuário ou e-mail'),
})
type FormData = z.infer<typeof schema>

export default function EsqueciSenhaPage() {
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  })

  async function onSubmit(data: FormData) {
    setErro(null)
    try {
      await api.post('/auth/esqueci-senha', { identificador: data.identificador })
      setEnviado(true)
    } catch (err: any) {
      const status = err?.response?.status
      setErro(status === 429
        ? 'Muitas tentativas. Aguarde um minuto e tente novamente.'
        : 'Não foi possível processar o pedido agora. Tente novamente.')
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="pb-4 text-center">
        <div className="flex justify-center mb-3">
          <div className="size-12 rounded-full bg-blue-100 flex items-center justify-center">
            {enviado ? <MailCheck className="size-6 text-green-600" /> : <KeyRound className="size-6 text-blue-600" />}
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">
          {enviado ? 'Verifique seu e-mail' : 'Esqueci minha senha'}
        </CardTitle>
        <CardDescription>
          {enviado
            ? 'Se o usuário existir e tiver e-mail cadastrado, enviamos um link para redefinir a senha. O link vale por 1 hora.'
            : 'Informe seu usuário ou e-mail cadastrado e enviaremos um link para criar uma nova senha.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enviado && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="identificador">Usuário ou e-mail</Label>
              <Input
                id="identificador"
                autoComplete="username"
                placeholder="seu.usuario ou voce@empresa.com"
                {...register('identificador')}
                aria-invalid={!!errors.identificador}
              />
              {errors.identificador && (
                <p className="text-xs text-destructive">{errors.identificador.message}</p>
              )}
            </div>

            {erro && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                <p className="text-sm text-destructive">{erro}</p>
              </div>
            )}

            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin mr-2" />}
              {isSubmitting ? 'Enviando...' : 'Enviar link de recuperação'}
            </Button>
          </form>
        )}

        {enviado && (
          <p className="text-xs text-center text-muted-foreground">
            Não recebeu? Confira a caixa de spam ou peça ao administrador do sistema para reenviar.
          </p>
        )}

        <Link
          href="/login"
          className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Voltar ao login
        </Link>
      </CardContent>
    </Card>
  )
}
