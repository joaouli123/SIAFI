'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, Save, Eye, EyeOff, ChevronLeft, CheckCircle, RefreshCw, ToggleLeft, ToggleRight,
} from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface EmailTemplate {
  slug:      string
  nome:      string
  assunto:   string
  corpo:     string
  variaveis: string[]
  ativo:     boolean
  updatedAt: string
}

interface PreviewResult {
  assunto: string
  corpo:   string
}

const SLUG_LABELS: Record<string, string> = {
  'email.lembrete-vencimento':  '📅 Lembrete de vencimento',
  'email.confirmacao-pagamento': '✅ Confirmação de pagamento',
  'email.portal-ativado':       '🔑 Portal ativado / nova senha',
  'email.cobranca-antecipada':  '📎 Cobrança antecipada (com boleto)',
  'intencao.aprovada':          '🎉 Intenção aprovada',
  'intencao.rejeitada':         '❌ Intenção rejeitada',
  'proposta.capital-liberado':  '💰 Capital liberado',
  'proposta.expirando-cliente': '⏰ Aceite expirando',
}

export default function EmailTemplatesPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [assunto, setAssunto]   = useState('')
  const [corpo, setCorpo]       = useState('')
  const [preview, setPreview]   = useState<PreviewResult | null>(null)
  const [showHtml, setShowHtml] = useState(false)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)

  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ['email-templates'],
    queryFn: () => api.get('/email-templates').then(r => r.data),
  })

  const saveMut = useMutation({
    mutationFn: ({ slug, assunto, corpo }: { slug: string; assunto: string; corpo: string }) =>
      api.patch(`/email-templates/${slug}`, { assunto, corpo }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['email-templates'] })
      setSavedSlug(vars.slug)
      setTimeout(() => setSavedSlug(null), 3000)
    },
  })

  const toggleMut = useMutation({
    mutationFn: ({ slug, ativo }: { slug: string; ativo: boolean }) =>
      api.patch(`/email-templates/${slug}`, { ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  })

  const previewMut = useMutation({
    mutationFn: ({ slug }: { slug: string }) =>
      api.post<PreviewResult>(`/email-templates/${slug}/preview`, { vars: {} })
        .then(r => r.data),
    onSuccess: (data) => setPreview(data),
  })

  function selectTemplate(tpl: EmailTemplate) {
    setSelected(tpl.slug)
    setAssunto(tpl.assunto)
    setCorpo(tpl.corpo)
    setPreview(null)
    setShowHtml(false)
  }

  const selectedTpl = templates?.find(t => t.slug === selected)

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-4">
        <Link href="/configuracoes">
          <Button variant="ghost" size="sm" className="gap-2">
            <ChevronLeft className="size-4" />Configurações
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="size-5 text-blue-500" />
            Templates de E-mail
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Personalize o assunto e corpo dos e-mails enviados automaticamente pelo sistema.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de templates */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-3">
            Templates ({templates?.length ?? 0})
          </p>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : (
            templates?.map(tpl => (
              <button
                key={tpl.slug}
                onClick={() => selectTemplate(tpl)}
                className={cn(
                  'w-full text-left rounded-lg border px-4 py-3 transition-colors',
                  selected === tpl.slug
                    ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-700'
                    : 'border-border hover:bg-muted/50',
                  !tpl.ativo && 'opacity-50',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {SLUG_LABELS[tpl.slug] ?? tpl.nome}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{tpl.assunto}</p>
                  </div>
                  {!tpl.ativo && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">Inativo</Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Editor */}
        <div className="lg:col-span-2">
          {!selected ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <Mail className="size-10 opacity-30" />
                <p>Selecione um template para editar</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="font-semibold">{SLUG_LABELS[selected] ?? selectedTpl?.nome}</h2>
                  <p className="text-xs text-muted-foreground font-mono">{selected}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTpl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn('gap-2', selectedTpl.ativo ? 'text-green-600' : 'text-muted-foreground')}
                      onClick={() => toggleMut.mutate({ slug: selected, ativo: !selectedTpl.ativo })}
                      disabled={toggleMut.isPending}
                    >
                      {selectedTpl.ativo
                        ? <><ToggleRight className="size-4" />Ativo</>
                        : <><ToggleLeft className="size-4" />Inativo</>}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => previewMut.mutate({ slug: selected })}
                    disabled={previewMut.isPending}
                  >
                    <RefreshCw className={cn('size-3.5', previewMut.isPending && 'animate-spin')} />
                    Prévia
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => saveMut.mutate({ slug: selected, assunto, corpo })}
                    disabled={saveMut.isPending}
                  >
                    {savedSlug === selected
                      ? <><CheckCircle className="size-3.5" />Salvo!</>
                      : <><Save className="size-3.5" />{saveMut.isPending ? 'Salvando...' : 'Salvar'}</>}
                  </Button>
                </div>
              </div>

              {/* Variáveis disponíveis */}
              {selectedTpl?.variaveis && selectedTpl.variaveis.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-muted/40 border border-dashed">
                  <span className="text-xs text-muted-foreground mr-1">Variáveis:</span>
                  {selectedTpl.variaveis.map(v => (
                    <code
                      key={v}
                      className="text-xs bg-background border rounded px-1.5 py-0.5 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                      title="Clique para copiar"
                      onClick={() => navigator.clipboard.writeText(`{{${v}}}`)}
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">· Clique para copiar</span>
                </div>
              )}

              {/* Assunto */}
              <div className="space-y-1.5">
                <Label>Assunto</Label>
                <Input
                  value={assunto}
                  onChange={e => setAssunto(e.target.value)}
                  placeholder="Assunto do e-mail..."
                />
              </div>

              {/* Corpo — split editor / preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Corpo (HTML)</Label>
                  {preview && (
                    <button
                      onClick={() => setShowHtml(!showHtml)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showHtml ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                      {showHtml ? 'Editar' : 'Ver prévia'}
                    </button>
                  )}
                </div>

                {!showHtml || !preview ? (
                  <textarea
                    className="w-full min-h-[340px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    value={corpo}
                    onChange={e => setCorpo(e.target.value)}
                    spellCheck={false}
                  />
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <div className="bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground border-b font-mono">
                      Assunto: {preview.assunto}
                    </div>
                    <div
                      className="min-h-[320px] bg-white dark:bg-slate-900"
                      dangerouslySetInnerHTML={{ __html: preview.corpo }}
                    />
                  </div>
                )}
              </div>

              {saveMut.isError && (
                <p className="text-xs text-destructive">Erro ao salvar template. Verifique o conteúdo e tente novamente.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
