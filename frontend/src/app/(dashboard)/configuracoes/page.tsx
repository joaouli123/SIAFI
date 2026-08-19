'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, RefreshCw, Settings, Building2, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/lib/api'

interface Setting { chave: string; valor: string }
type SettingsMap = Record<string, string>

const SETTING_GROUPS = [
  {
    title: 'Informações do Sistema',
    icon: '🏢',
    keys: [
      { key: 'app_name',      label: 'Nome do Sistema',    placeholder: 'SIAFI' },
      { key: 'app_url',       label: 'URL do Sistema',     placeholder: 'https://2wm.siafi.app.br' },
      { key: 'empresa_nome',  label: 'Nome da Empresa',    placeholder: 'Lidera' },
      { key: 'empresa_email', label: 'E-mail de Contato',  placeholder: 'contato@empresa.com' },
    ],
  },
  {
    title: 'Encargos Financeiros',
    icon: '💰',
    description: 'Taxas aplicadas automaticamente sobre inadimplência.',
    keys: [
      { key: 'financeiro.mora_dia_percentual',     label: 'Mora diária (%)',      placeholder: '0.033', hint: 'Juros ao dia sobre saldo em atraso. Ex: 0.033 = 1% ao mês' },
      { key: 'financeiro.multa_atraso_percentual', label: 'Multa por atraso (%)', placeholder: '2',     hint: 'Aplicada na primeira ocorrência de atraso' },
      { key: 'dias_tolerancia',     label: 'Dias de tolerância',   placeholder: '0',     hint: 'Dias após vencimento antes de aplicar encargos' },
      { key: 'taxa_juros_padrao',   label: 'Taxa de juros padrão (%)', placeholder: '5', hint: 'Taxa pré-preenchida ao criar empréstimo' },
    ],
  },
  {
    title: 'SLAs e Prazos',
    icon: '⏱',
    description: 'Prazos operacionais para análise e aceite de contratos.',
    keys: [
      { key: 'intencao.prazo_analise_horas',   label: 'Prazo de análise de intenções (h)', placeholder: '24', hint: 'Horas para financeiro analisar uma intenção antes do SLA expirar' },
      { key: 'financeiro.sla_aceite_dias',     label: 'Prazo de aceite do cliente (dias)', placeholder: '3',  hint: 'Dias para o cliente assinar digitalmente no portal' },
      { key: 'financeiro.sla_reparcelamento',  label: 'Prazo de análise de reparcelamento (dias)', placeholder: '2', hint: 'Dias para financeiro responder uma proposta de reparcelamento' },
      { key: 'intencao.auto_aprovacao',        label: 'Auto-aprovação de intenções',       placeholder: 'false', hint: 'true = aprovar automaticamente ao expirar SLA' },
    ],
  },
  {
    title: 'Comissões',
    icon: '💸',
    description: 'Percentuais padrão da casa, usados quando o contrato não define o seu. Alterar aqui vale para as próximas baixas — nenhum contrato precisa ser reeditado.',
    keys: [
      { key: 'financeiro.comissao_consultor_percentual',     label: 'Comissão do consultor (%)',     placeholder: '10', hint: 'Sobre o lucro geral de cada baixa. O contrato e o cadastro do consultor têm prioridade sobre este valor' },
      { key: 'financeiro.comissao_administrador_percentual', label: 'Comissão do administrador (%)', placeholder: '4',  hint: 'Sobre o lucro geral de cada baixa. O contrato tem prioridade sobre este valor' },
    ],
  },
  {
    title: 'Limites Operacionais',
    icon: '🔒',
    description: 'Valores mínimos e máximos para controle de empréstimos.',
    keys: [
      { key: 'emprestimo.valor_minimo', label: 'Valor mínimo (R$)',    placeholder: '100' },
      { key: 'emprestimo.valor_maximo', label: 'Valor máximo (R$)',    placeholder: '50000' },
      { key: 'emprestimo.parcelas_min', label: 'Parcelas mínimas',     placeholder: '1' },
      { key: 'emprestimo.parcelas_max', label: 'Parcelas máximas',     placeholder: '60' },
    ],
  },
  {
    title: 'WhatsApp (Evolution API)',
    icon: '💬',
    keys: [
      { key: 'whatsapp_api_url',      label: 'URL da API',   placeholder: 'https://evolution.api.com' },
      { key: 'whatsapp_api_key',      label: 'API Key',      placeholder: 'sua-api-key' },
      { key: 'whatsapp_instance',     label: 'Instância',    placeholder: 'nome-instancia' },
    ],
  },
  {
    title: 'Mercado Pago',
    icon: '💳',
    keys: [
      { key: 'mp_access_token',   label: 'Access Token',    placeholder: 'APP_USR-...' },
      { key: 'mp_webhook_secret', label: 'Webhook Secret',  placeholder: 'secret' },
    ],
  },
  {
    title: 'E-mail (SMTP)',
    icon: '📧',
    keys: [
      { key: 'mail_host',       label: 'Servidor SMTP',      placeholder: 'smtp.hostinger.com' },
      { key: 'mail_port',       label: 'Porta',              placeholder: '465' },
      { key: 'mail_user',       label: 'Usuário',            placeholder: 'nao-responder@siafi.lidera.srv.br' },
      { key: 'mail_pass',       label: 'Senha',              placeholder: '••••••••' },
      { key: 'mail_from_name',  label: 'Nome do Remetente',  placeholder: 'SIAFI — Lidera' },
    ],
  },
]

export default function ConfiguracoesPage() {
  const qc = useQueryClient()
  const [values, setValues] = useState<SettingsMap>({})
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting[]>('/settings').then((r) => r.data),
  })

  useEffect(() => {
    if (data) {
      const map: SettingsMap = {}
      data.forEach((s) => { map[s.chave] = s.valor })
      setValues(map)
    }
  }, [data])

  const mutation = useMutation({
    mutationFn: () => api.patch('/settings', { entries: Object.entries(values).map(([chave, valor]) => ({ chave, valor })) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Settings className="size-6" />Configurações</h1>
          <p className="text-muted-foreground text-sm mt-1">Parâmetros do sistema</p>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
          <Save className="size-4" />{mutation.isPending ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar Configurações'}
        </Button>
      </div>

      {saved && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Configurações salvas com sucesso!
        </div>
      )}

      <Link href="/configuracoes/empresa">
        <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="size-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Empresa / Identidade Visual</p>
                <p className="text-xs text-muted-foreground">Logo, cores, CNPJ, endereço e documentos PDF</p>
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      {mutation.isError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Erro ao salvar configurações.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : (
        SETTING_GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span>{(group as any).icon}</span>
                {group.title}
              </CardTitle>
              {(group as any).description && (
                <p className="text-xs text-muted-foreground mt-0.5">{(group as any).description}</p>
              )}
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.keys.map((item) => (
                <div key={item.key} className="space-y-1.5">
                  <Label htmlFor={item.key}>{item.label}</Label>
                  <Input
                    id={item.key}
                    type={item.key.includes('pass') || item.key.includes('secret') || item.key.includes('token') ? 'password' : 'text'}
                    placeholder={item.placeholder}
                    value={values[item.key] ?? ''}
                    onChange={(e) => handleChange(item.key, e.target.value)}
                  />
                  {'hint' in item && item.hint && (
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
