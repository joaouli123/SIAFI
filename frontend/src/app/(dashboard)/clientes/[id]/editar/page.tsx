'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm, Controller, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Upload, X, Users, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ClienteCombobox } from '@/components/ui/cliente-combobox'
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
  nome: z.string().min(3),
  cpf: z.string()
    .optional()
    .refine((v) => {
      if (!v) return true
      const d = v.replace(/\D/g, '')
      return d.length === 11 || d.length === 14
    }, 'CPF (11 dígitos) ou CNPJ (14 dígitos)'),
  rg: z.string().optional(),
  dataNascimento: z.string().optional(), email: z.string().email().optional().or(z.literal('')),
  whatsapp: z.string().min(10), telefone: z.string().optional(),
  endereco: z.string().optional(), bairro: z.string().optional(),
  cidade: z.string().optional(), estado: z.string().max(2).optional(),
  cep: z.string().optional(), observacoes: z.string().optional(),
  active: z.boolean().optional(),
  avalistas: z.array(z.object({
    id: z.coerce.number().optional(), // id if already exists
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
  existing,
  onChange,
}: {
  label: string
  name: string
  accept: string
  file: File | null
  existing?: boolean
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
          {file ? 'Trocar' : existing ? 'Substituir' : 'Selecionar'}
        </Button>
        {file ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <span className="truncate">{file.name}</span>
            <button type="button" onClick={() => { onChange(null); if (ref.current) ref.current.value = '' }}>
              <X className="size-3.5 shrink-0 hover:text-destructive" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {existing ? 'Arquivo existente (clique para substituir)' : 'Nenhum arquivo'}
          </span>
        )}
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

export default function EditarClientePage() {
  const { id } = useParams()
  const router = useRouter()
  const qc = useQueryClient()
  const [foto, setFoto] = useState<File | null>(null)
  const [rgFile, setRgFile] = useState<File | null>(null)
  const [comprovante, setComprovante] = useState<File | null>(null)

  const { data: client, isLoading } = useQuery({
    queryKey: ['clients', id],
    queryFn: () => api.get<any>(`/clients/${id}`).then((r) => r.data),
  })

  const { register, handleSubmit, reset, control, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { avalistas: [] }
  })

  const { fields: avalistaFields, append: addAvalista, remove: removeAvalista } = useFieldArray({
    control,
    name: 'avalistas',
  })

  useEffect(() => {
    if (client) {
      reset({
        ...client,
        dataNascimento: client.dataNascimento ? client.dataNascimento.split('T')[0] : '',
        email: client.email ?? '',
        avalistas: client.meusAvalistas?.map((a: any) => ({
          id: a.id,
          clienteId: a.avalistaId,
          nome: a.nome,
          cpf: a.cpf,
          telefone: a.telefone,
          parentesco: a.parentesco,
        })) || []
      })
    }
  }, [client, reset])

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const fd = new window.FormData()
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
      return api.patch(`/clients/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      router.push(`/clientes/${id}`)
    },
  })

  if (isLoading) return <div className="space-y-4 w-full"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-4">
        <Link href={`/clientes/${id}`}><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="size-4" />Voltar</Button></Link>
        <div><h1 className="text-2xl font-bold tracking-tight">Editar Cliente</h1><p className="text-muted-foreground text-sm">{client?.nome}</p></div>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        {mutation.isError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive space-y-1">
            <p className="font-medium">Erro ao salvar alterações.</p>
            {(() => {
              const err = mutation.error as any
              const msg = err?.response?.data?.message
              if (!msg) return null
              const msgs = Array.isArray(msg) ? msg : [msg]
              return msgs.map((m: string, i: number) => <p key={i} className="text-xs opacity-80">{m}</p>)
            })()}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Dados Pessoais</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label>Nome completo *</Label>
              <Input {...register('nome')} />
              {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>CPF / CNPJ</Label>
              <Controller
                name="cpf"
                control={control}
                render={({ field }) => (
                  <Input
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
            <div className="space-y-1.5"><Label>RG</Label><Input {...register('rg')} /></div>
            <div className="space-y-1.5"><Label>Data de Nascimento</Label><Input type="date" {...register('dataNascimento')} /></div>
            <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" {...register('email')} />{errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}</div>
            <div className="space-y-1.5"><Label>WhatsApp *</Label><Input {...register('whatsapp')} />{errors.whatsapp && <p className="text-xs text-destructive">{errors.whatsapp.message}</p>}</div>
            <div className="space-y-1.5"><Label>Telefone</Label><Input {...register('telefone')} /></div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select {...register('active', { setValueAs: (v) => v === 'true' })}>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Endereço</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5"><Label>Endereço</Label><Input {...register('endereco')} /></div>
            <div className="space-y-1.5"><Label>Bairro</Label><Input {...register('bairro')} /></div>
            <div className="space-y-1.5"><Label>CEP</Label><Input {...register('cep')} /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input {...register('cidade')} /></div>
            <div className="space-y-1.5"><Label>UF</Label>
              <Select {...register('estado')}>
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
              existing={!!client?.fotoPath}
              onChange={setFoto}
            />
            <FileInput
              label="RG (frente)"
              name="rg"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              file={rgFile}
              existing={!!client?.rgPath}
              onChange={setRgFile}
            />
            <FileInput
              label="Comprovante de Endereço"
              name="comprovante"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              file={comprovante}
              existing={!!client?.comprovantePath}
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
                        excludeId={Number(id)}
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
          <CardContent><Textarea {...register('observacoes')} rows={4} /></CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href={`/clientes/${id}`}><Button variant="outline" type="button">Cancelar</Button></Link>
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            <Save className="size-4" />{mutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </form>
    </div>
  )
}
