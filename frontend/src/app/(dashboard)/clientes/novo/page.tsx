'use client'

import { useRef, useState } from 'react'
import { useForm, Controller, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Upload, X, Users, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { ClienteCombobox } from '@/components/ui/cliente-combobox'
import { useAuth } from '@/contexts/auth.context'
import api from '@/lib/api'

function formatCpfCnpj(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

const schema = z.object({
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres'),
  cpf: z.string()
    .min(1, 'CPF ou CNPJ obrigatório')
    .refine((v) => {
      const d = v.replace(/\D/g, '')
      return d.length === 11 || d.length === 14
    }, 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido'),
  rg: z.string().optional(),
  dataNascimento: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  whatsapp: z.string().min(10, 'WhatsApp inválido'),
  telefone: z.string().optional(),
  endereco: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().max(2).optional(),
  cep: z.string().optional(),
  observacoes: z.string().optional(),
  consultorId: z.string().optional(),
  avalistas: z.array(z.object({
    clienteId: z.coerce.number().optional(),
    nome: z.string().optional(),
    cpf: z.string().optional(),
    telefone: z.string().optional(),
    parentesco: z.string().optional(),
  })).optional(),
  referencia1Nome: z.string().optional(),
  referencia1Telefone: z.string().optional(),
  referencia1Vinculo: z.string().optional(),
  referencia2Nome: z.string().optional(),
  referencia2Telefone: z.string().optional(),
  referencia2Vinculo: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const UF_LIST = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

function FileInput({
  label,
  name,
  accept,
  file,
  onChange,
}: {
  label: string
  name: string
  accept: string
  file: File | null
  onChange: (f: File | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => ref.current?.click()}
        >
          <Upload className="size-3.5" />
          {file ? 'Trocar' : 'Selecionar'}
        </Button>
        {file && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <span className="truncate">{file.name}</span>
            <button type="button" onClick={() => { onChange(null); if (ref.current) ref.current.value = '' }}>
              <X className="size-3.5 shrink-0 hover:text-destructive" />
            </button>
          </div>
        )}
        {!file && <span className="text-xs text-muted-foreground">Nenhum arquivo selecionado</span>}
      </div>
      <input
        ref={ref}
        type="file"
        name={name}
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

export default function NovoClientePage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [foto, setFoto] = useState<File | null>(null)
  const [rgFile, setRgFile] = useState<File | null>(null)
  const [comprovante, setComprovante] = useState<File | null>(null)

  const canAssignConsultor = user?.role === 'admin' || user?.role === 'financeiro'

  const { data: consultores } = useQuery<{ id: number; nome: string }[]>({
    queryKey: ['consultores'],
    queryFn: () => api.get('/clients/consultores').then((r) => r.data),
    enabled: canAssignConsultor,
  })

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { avalistas: [] }
  })

  const { fields: avalistaFields, append: addAvalista, remove: removeAvalista } = useFieldArray({
    control,
    name: 'avalistas',
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          if (k === 'avalistas' && Array.isArray(v)) {
            fd.append(k, JSON.stringify(v))
          } else {
            fd.append(k, String(v))
          }
        }
      })
      if (foto) fd.append('foto', foto)
      if (rgFile) fd.append('rg', rgFile)
      if (comprovante) fd.append('comprovante', comprovante)
      return api.post('/clients', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      router.push('/clientes')
    },
  })

  const erroMsg = mutation.isError
    ? ((mutation.error as any)?.response?.data?.message ?? 'Erro ao cadastrar cliente. Verifique os dados e tente novamente.')
    : null

  function onSubmit(data: FormData) {
    mutation.mutate(data)
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-4">
        <Link href="/clientes">
          <Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="size-4" />Voltar</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novo Cliente</h1>
          <p className="text-muted-foreground text-sm mt-1">Preencha os dados do cliente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {erroMsg && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {erroMsg}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Dados Pessoais</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="nome">Nome completo *</Label>
              <Input id="nome" {...register('nome')} placeholder="Nome do cliente" />
              {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpf">CPF / CNPJ *</Label>
              <Controller
                name="cpf"
                control={control}
                render={({ field }) => (
                  <Input
                    id="cpf"
                    value={formatCpfCnpj(field.value ?? '')}
                    onChange={(e) => field.onChange(formatCpfCnpj(e.target.value))}
                    onBlur={field.onBlur}
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    maxLength={18}
                  />
                )}
              />
              {errors.cpf && <p className="text-xs text-destructive">{errors.cpf.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rg">RG</Label>
              <Input id="rg" {...register('rg')} placeholder="00.000.000-0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataNascimento">Data de Nascimento</Label>
              <Input id="dataNascimento" type="date" {...register('dataNascimento')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register('email')} placeholder="email@exemplo.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp">WhatsApp *</Label>
              <Input id="whatsapp" {...register('whatsapp')} placeholder="(00) 00000-0000" />
              {errors.whatsapp && <p className="text-xs text-destructive">{errors.whatsapp.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" {...register('telefone')} placeholder="(00) 0000-0000" />
            </div>
            {canAssignConsultor && (
              <div className="space-y-1.5">
                <Label htmlFor="consultorId">Consultor responsável</Label>
                <Select id="consultorId" {...register('consultorId')}>
                  <option value="">Sem consultor</option>
                  {consultores?.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.nome}</option>
                  ))}
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Endereço</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="endereco">Endereço</Label>
              <Input id="endereco" {...register('endereco')} placeholder="Rua, número, complemento" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bairro">Bairro</Label>
              <Input id="bairro" {...register('bairro')} placeholder="Bairro" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cep">CEP</Label>
              <Input id="cep" {...register('cep')} placeholder="00000-000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cidade">Cidade</Label>
              <Input id="cidade" {...register('cidade')} placeholder="Cidade" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estado">UF</Label>
              <Select id="estado" {...register('estado')}>
                <option value="">Selecione...</option>
                {UF_LIST.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Documentos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FileInput
              label="Foto do Cliente"
              name="foto"
              accept="image/jpeg,image/png,image/webp"
              file={foto}
              onChange={setFoto}
            />
            <FileInput
              label="RG (frente)"
              name="rg"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              file={rgFile}
              onChange={setRgFile}
            />
            <FileInput
              label="Comprovante de Endereço"
              name="comprovante"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              file={comprovante}
              onChange={setComprovante}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><Users className="size-4" />Avalistas</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => addAvalista({ clienteId: undefined, nome: '', cpf: '', telefone: '', parentesco: '' })}
            >
              <Plus className="size-4" />Adicionar
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {avalistaFields.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum avalista. Opcional — pode adicionar um cliente já cadastrado ou uma pessoa avulsa.</p>
            )}
            {avalistaFields.map((field, i) => {
              return (
                <div key={field.id} className="rounded-lg border p-3 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Avalista {i + 1}</span>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => removeAvalista(i)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2 space-y-1.5">
                      <Label>Cliente existente (opcional)</Label>
                      <ClienteCombobox
                        buscaRemota
                        value={watch(`avalistas.${i}.clienteId`)}
                        avulsoLabel="— Pessoa avulsa (preencher manualmente) —"
                        placeholder="Buscar cliente por nome ou CPF..."
                        onSelect={(c) => {
                          setValue(`avalistas.${i}.clienteId`, c?.id ?? undefined)
                          if (c) {
                            setValue(`avalistas.${i}.nome`, c.nome)
                            setValue(`avalistas.${i}.cpf`, c.cpf ?? '')
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nome *</Label>
                      <Input {...register(`avalistas.${i}.nome`)} placeholder="Nome completo" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>CPF</Label>
                      <Input {...register(`avalistas.${i}.cpf`)} placeholder="000.000.000-00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Telefone</Label>
                      <Input {...register(`avalistas.${i}.telefone`)} placeholder="(00) 00000-0000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Vínculo / Parentesco</Label>
                      <Input {...register(`avalistas.${i}.parentesco`)} placeholder="ex: irmão, sócio" />
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Referências de Contato</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Referência 1 — Nome</Label>
                <Input {...register('referencia1Nome')} placeholder="Nome" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input {...register('referencia1Telefone')} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Vínculo</Label>
                <Input {...register('referencia1Vinculo')} placeholder="ex: vizinho" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Referência 2 — Nome</Label>
                <Input {...register('referencia2Nome')} placeholder="Nome" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input {...register('referencia2Telefone')} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Vínculo</Label>
                <Input {...register('referencia2Vinculo')} placeholder="ex: colega" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
          <CardContent>
            <Textarea {...register('observacoes')} placeholder="Informações adicionais sobre o cliente..." rows={4} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/clientes"><Button variant="outline" type="button">Cancelar</Button></Link>
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            <Save className="size-4" />
            {mutation.isPending ? 'Salvando...' : 'Salvar Cliente'}
          </Button>
        </div>
      </form>
    </div>
  )
}
