'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Save, Upload, X, Palette, FileText, MapPin, Phone, Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import api from '@/lib/api'

interface EmpresaConfig {
  nome: string
  nomeFantasia: string
  cnpj: string
  inscricaoEstadual: string
  email: string
  emailFinanceiro: string
  telefone: string
  whatsapp: string
  site: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
  cep: string
  logoUrl: string
  corPrimaria: string
  corSecundaria: string
  corAcento: string
  corTexto: string
  corFundo: string
  rodapePdf: string
  clausulasAdicionais: string
}

type EmpresaDraft = Partial<EmpresaConfig>

const COLOR_PRESETS = [
  { label: 'Azul',    corPrimaria: '#185FA5', corSecundaria: '#0F6E56', corAcento: '#854F0B' },
  { label: 'Verde',   corPrimaria: '#0F6E56', corSecundaria: '#185FA5', corAcento: '#854F0B' },
  { label: 'Roxo',    corPrimaria: '#6D28D9', corSecundaria: '#0F6E56', corAcento: '#854F0B' },
  { label: 'Vermelho',corPrimaria: '#B91C1C', corSecundaria: '#0F6E56', corAcento: '#854F0B' },
  { label: 'Cinza',   corPrimaria: '#374151', corSecundaria: '#0F6E56', corAcento: '#854F0B' },
]

const COLOR_DEFAULTS = {
  corPrimaria:   '#185FA5',
  corSecundaria: '#0F6E56',
  corAcento:     '#854F0B',
  corTexto:      '#1a1a18',
  corFundo:      '#f5f5f3',
}

export default function ConfiguracoesEmpresaPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [draft, setDraft] = useState<EmpresaDraft>({})
  const [previewColors, setPreviewColors] = useState<Partial<typeof COLOR_DEFAULTS> | null>(null)
  const [cepLoading, setCepLoading] = useState(false)

  const { data: empresa, isLoading } = useQuery<EmpresaConfig>({
    queryKey: ['empresa-config'],
    queryFn: () => api.get<EmpresaConfig>('/empresa').then((r) => r.data),
  })

  useEffect(() => {
    if (empresa) setDraft(empresa)
  }, [empresa])

  const saveMut = useMutation({
    mutationFn: (payload: EmpresaDraft) => api.patch('/empresa', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-config'] })
      qc.invalidateQueries({ queryKey: ['empresa-tema'] })
      toast.success('Configurações salvas com sucesso')
      setPreviewColors(null)
    },
    onError: () => toast.error('Erro ao salvar configurações'),
  })

  const logoMut = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/empresa/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-config'] })
      qc.invalidateQueries({ queryKey: ['empresa-tema'] })
      toast.success('Logo atualizada')
    },
    onError: () => toast.error('Erro ao enviar logo. Verifique o formato e tamanho (máx 2 MB).'),
  })

  const logoDelMut = useMutation({
    mutationFn: () => api.delete('/empresa/logo'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-config'] })
      qc.invalidateQueries({ queryKey: ['empresa-tema'] })
      toast.success('Logo removida')
    },
  })

  function set(key: keyof EmpresaConfig, value: string) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function setColor(key: keyof typeof COLOR_DEFAULTS, value: string) {
    setDraft((d) => ({ ...d, [key]: value }))
    setPreviewColors((p) => ({ ...(p ?? {}), [key]: value }))
  }

  function applyPreset({ label: _label, ...colors }: typeof COLOR_PRESETS[number]) {
    setDraft((d) => ({ ...d, ...colors }))
    setPreviewColors(colors)
  }

  function resetColors() {
    setDraft((d) => ({ ...d, ...COLOR_DEFAULTS }))
    setPreviewColors(null)
  }

  async function lookupCep(cep: string) {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setDraft((d) => ({
          ...d,
          logradouro:  data.logradouro ?? d.logradouro,
          bairro:      data.bairro     ?? d.bairro,
          cidade:      data.localidade ?? d.cidade,
          estado:      data.uf         ?? d.estado,
        }))
      }
    } finally {
      setCepLoading(false)
    }
  }

  const val = (key: keyof EmpresaConfig) => (draft[key] ?? '') as string
  const previewCor = (key: keyof typeof COLOR_DEFAULTS) =>
    previewColors?.[key] ?? val(key as keyof EmpresaConfig) ?? COLOR_DEFAULTS[key]

  if (isLoading) {
    return (
      <div className="space-y-6 w-full">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="size-6" />Empresa / Identidade Visual
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Dados da empresa, marca e identidade visual dos documentos
          </p>
        </div>
        <Button
          onClick={() => saveMut.mutate(draft)}
          disabled={saveMut.isPending}
          className="gap-2"
        >
          {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saveMut.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      <Tabs defaultValue="identidade">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="identidade">Identidade</TabsTrigger>
          <TabsTrigger value="contato">Contato</TabsTrigger>
          <TabsTrigger value="cores">Cores</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: IDENTIDADE ─── */}
        <TabsContent value="identidade" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="size-4" />Logo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {empresa?.logoUrl ? (
                <div className="flex items-center gap-4">
                  <div className="border rounded-lg p-3 bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={empresa.logoUrl} alt="Logo atual" className="h-12 object-contain max-w-[200px]" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Logo atual</p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={logoMut.isPending}
                        className="gap-1.5"
                      >
                        <Upload className="size-3.5" />Substituir
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { if (confirm('Remover a logo?')) logoDelMut.mutate() }}
                        disabled={logoDelMut.isPending}
                        className="gap-1.5 text-destructive hover:text-destructive"
                      >
                        <X className="size-3.5" />Remover
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed rounded-lg p-8 flex flex-col items-center gap-3 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Clique para enviar logo</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG ou SVG · máx 2 MB</p>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) logoMut.mutate(f)
                  e.target.value = ''
                }}
              />
              {logoMut.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />Enviando logo...
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Razão Social</Label>
                <Input value={val('nome')} onChange={(e) => set('nome', e.target.value)} placeholder="Razão Social Ltda" />
              </div>
              <div className="space-y-1.5">
                <Label>Nome Fantasia</Label>
                <Input value={val('nomeFantasia')} onChange={(e) => set('nomeFantasia', e.target.value)} placeholder="Nome Fantasia" />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input value={val('cnpj')} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
              </div>
              <div className="space-y-1.5">
                <Label>Inscrição Estadual</Label>
                <Input value={val('inscricaoEstadual')} onChange={(e) => set('inscricaoEstadual', e.target.value)} placeholder="Isento" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 2: CONTATO ─── */}
        <TabsContent value="contato" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Phone className="size-4" />Contato</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>E-mail Principal</Label>
                <Input type="email" value={val('email')} onChange={(e) => set('email', e.target.value)} placeholder="contato@empresa.com.br" />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail Financeiro</Label>
                <Input type="email" value={val('emailFinanceiro')} onChange={(e) => set('emailFinanceiro', e.target.value)} placeholder="financeiro@empresa.com.br" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={val('telefone')} onChange={(e) => set('telefone', e.target.value)} placeholder="(65) 3333-3333" />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input value={val('whatsapp')} onChange={(e) => set('whatsapp', e.target.value)} placeholder="(65) 99999-9999" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Site</Label>
                <Input value={val('site')} onChange={(e) => set('site', e.target.value)} placeholder="https://empresa.com.br" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="size-4" />Endereço</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <div className="flex gap-2">
                  <Input
                    value={val('cep')}
                    onChange={(e) => set('cep', e.target.value)}
                    onBlur={(e) => lookupCep(e.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                  {cepLoading && <Loader2 className="size-4 animate-spin self-center text-muted-foreground" />}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Bairro</Label>
                <Input value={val('bairro')} onChange={(e) => set('bairro', e.target.value)} placeholder="Centro" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Logradouro</Label>
                <Input value={val('logradouro')} onChange={(e) => set('logradouro', e.target.value)} placeholder="Rua Exemplo" />
              </div>
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={val('numero')} onChange={(e) => set('numero', e.target.value)} placeholder="100" />
              </div>
              <div className="space-y-1.5">
                <Label>Complemento</Label>
                <Input value={val('complemento')} onChange={(e) => set('complemento', e.target.value)} placeholder="Sala 1" />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={val('cidade')} onChange={(e) => set('cidade', e.target.value)} placeholder="Cuiabá" />
              </div>
              <div className="space-y-1.5">
                <Label>Estado (UF)</Label>
                <Input value={val('estado')} onChange={(e) => set('estado', e.target.value)} placeholder="MT" maxLength={2} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 3: CORES ─── */}
        <TabsContent value="cores" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Palette className="size-4" />Esquema de Cores</CardTitle>
                <Button variant="outline" size="sm" onClick={resetColors} className="text-xs">
                  Restaurar padrões
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                A prévia ao lado é isolada — não afeta a interface até salvar.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Presets</p>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p)}
                      className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
                    >
                      <span className="size-3 rounded-full inline-block border border-white/20 shadow-sm" style={{ backgroundColor: p.corPrimaria }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(
                  [
                    { key: 'corPrimaria',   label: 'Cor Primária',   hint: 'Sidebar, botões, destaques' },
                    { key: 'corSecundaria', label: 'Cor Secundária', hint: 'Elementos de apoio' },
                    { key: 'corAcento',     label: 'Cor de Acento',  hint: 'Alertas e badges especiais' },
                    { key: 'corTexto',      label: 'Cor do Texto',   hint: 'Texto principal dos documentos' },
                    { key: 'corFundo',      label: 'Cor de Fundo',   hint: 'Fundo dos documentos PDF' },
                  ] as { key: keyof typeof COLOR_DEFAULTS; label: string; hint: string }[]
                ).map(({ key, label, hint }) => (
                  <div key={key} className="space-y-1.5">
                    <Label>{label}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={val(key as keyof EmpresaConfig) || COLOR_DEFAULTS[key]}
                        onChange={(e) => setColor(key, e.target.value)}
                        className="size-9 rounded-md border cursor-pointer p-0.5"
                      />
                      <Input
                        value={val(key as keyof EmpresaConfig) || COLOR_DEFAULTS[key]}
                        onChange={(e) => setColor(key, e.target.value)}
                        placeholder={COLOR_DEFAULTS[key]}
                        pattern="^#[0-9A-Fa-f]{6}$"
                        className="font-mono text-sm"
                        maxLength={7}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                ))}
              </div>

              {/* Isolated preview */}
              <div className="rounded-xl border overflow-hidden">
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ backgroundColor: previewCor('corPrimaria') }}
                >
                  <span className="text-white font-semibold text-sm">
                    {draft.nomeFantasia || draft.nome || 'Empresa'}
                  </span>
                  <span className="text-white/70 text-xs">Prévia isolada</span>
                </div>
                <div className="p-4 space-y-3" style={{ backgroundColor: previewCor('corFundo'), color: previewCor('corTexto') }}>
                  <div className="flex gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: previewCor('corPrimaria') }}
                    >
                      Ativo
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: previewCor('corSecundaria') }}
                    >
                      Quitado
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: previewCor('corAcento') }}
                    >
                      Atenção
                    </span>
                  </div>
                  <div className="text-xs opacity-70">
                    Exemplo de texto com a cor selecionada
                  </div>
                  <button
                    className="rounded-md px-4 py-1.5 text-xs font-medium text-white"
                    style={{ backgroundColor: previewCor('corPrimaria') }}
                  >
                    Botão Primário
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 4: DOCUMENTOS ─── */}
        <TabsContent value="documentos" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="size-4" />Documentos PDF</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label>Rodapé dos PDFs</Label>
                <Textarea
                  value={val('rodapePdf')}
                  onChange={(e) => set('rodapePdf', e.target.value)}
                  placeholder="Deixe em branco para gerar automaticamente a partir dos dados da empresa"
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Se vazio, o sistema gera automaticamente: Nome · CNPJ · Endereço · Contato
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Cláusulas Adicionais do Contrato</Label>
                <Textarea
                  value={val('clausulasAdicionais')}
                  onChange={(e) => set('clausulasAdicionais', e.target.value)}
                  placeholder="Insira aqui quaisquer cláusulas adicionais que devem aparecer nos contratos de empréstimo..."
                  rows={6}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Estas cláusulas são adicionadas ao final do contrato antes da área de assinatura.
                </p>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <a
                  href="/api/export/carteira"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 h-9 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <FileText className="size-4" />
                  Testar PDF (Carteira)
                </a>
                <p className="text-xs text-muted-foreground self-center">
                  Salve primeiro para ver as alterações refletidas no PDF.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
