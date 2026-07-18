'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth.context'
import {
  Users,
  Briefcase,
  Zap,
  Globe,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  BookOpen,
  ChevronRight,
} from 'lucide-react'

function useCounter(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const steps = 40
    const increment = target / steps
    const interval = duration / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        setValue(target)
        clearInterval(timer)
      } else {
        setValue(Math.floor(current))
      }
    }, interval)
    return () => clearInterval(timer)
  }, [target, duration])

  return value
}

function StatCard({ value, suffix = '', label }: { value: number; suffix?: string; label: string }) {
  const count = useCounter(value)
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-7 text-center shadow-sm">
      <span className="text-4xl font-bold text-blue-600 tabular-nums">
        {count}{suffix}
      </span>
      <span className="mt-2 text-sm text-gray-500">{label}</span>
    </div>
  )
}

const features = [
  {
    icon: Briefcase,
    title: 'Gestão de Carteira',
    description:
      'Controle completo de clientes e contratos — cadastro, documentos, score de crédito e histórico em um único lugar.',
  },
  {
    icon: Zap,
    title: 'Split de Faturamento',
    description:
      'Separação automática entre capital emprestado e lucro do contrato, com rastreamento preciso a cada parcela paga.',
  },
  {
    icon: CheckCircle2,
    title: 'Cobrança Inteligente',
    description:
      'Envio automático de cobranças por WhatsApp e e-mail antes do vencimento, com reenvio e registro de contato.',
  },
  {
    icon: Globe,
    title: 'Portal do Cliente',
    description:
      'Autoatendimento com PIX integrado, assinatura digital de contratos, solicitação de reparcelamento e suporte.',
  },
  {
    icon: MessageSquare,
    title: 'Comunicador Interno',
    description:
      'Mensagens em tempo real entre operadores com contexto de contratos e suporte a envio de documentos.',
  },
  {
    icon: ShieldCheck,
    title: 'Conformidade e Segurança',
    description:
      'Autenticação em dois fatores, isolamento de dados por perfil (RLS), log de auditoria imutável e conformidade LGPD.',
  },
]

const timeline = [
  { date: 'Jan 2026', label: 'Início do desenvolvimento', current: false },
  { date: 'Mar 2026', label: 'Módulos core — clientes, contratos, parcelas, caixa', current: false },
  { date: 'Abr 2026', label: 'Integração Mercado Pago · Portal do Cliente · Supabase Auth', current: false },
  { date: 'Mai 2026', label: 'Split de parcela · Perfil Consultor · Sistema de e-mail · Chat Realtime', current: false },
  { date: 'Mai 2026', label: 'Remodelagem de telas por perfil · Score de risco · Reparcelamento · LGPD', current: true },
]

const stack = [
  'NestJS 10',
  'Next.js 16',
  'PostgreSQL',
  'Supabase',
  'Prisma 5',
  'BullMQ',
  'Redis (Upstash)',
  'Mercado Pago',
  'Evolution API (WhatsApp)',
  'Tailwind CSS 4',
  'shadcn/ui',
]

export default function SobrePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  return (
    <div className="mx-auto w-full space-y-14 px-4 py-8">

      {/* Hero */}
      <section className="flex flex-col items-center text-center">
        <div className="mb-4 flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm text-emerald-700 font-medium">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Sistema em operação
        </div>

        <h1 className="mt-2 text-5xl font-bold tracking-tight text-gray-900">
          SIAFI <span className="text-blue-600">2.0</span>
        </h1>
        <p className="mt-2 text-lg text-gray-600">Sistema de Agilidade Financeira</p>
        <p className="mt-1 text-sm text-gray-400">
          Lidera Tecnologia e Gestão Ltda. · Versão 2.0 · Maio 2026
        </p>
      </section>

      {/* Link Manual */}
      <section>
        <Link
          href="/ajuda"
          className="flex items-center gap-4 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100">
            <BookOpen className="size-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-blue-900">Manual do Sistema</p>
            <p className="text-sm text-blue-600">Guia completo de uso — perfis, telas e fluxos operacionais</p>
          </div>
          <ChevronRight className="size-4 text-blue-400 shrink-0" />
        </Link>
      </section>

      {/* O que é o SIAFI */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">O que é o SIAFI</h2>
        <div className="space-y-3 text-gray-600 leading-relaxed text-sm">
          <p>
            O SIAFI é o sistema financeiro integrado da Lidera Tecnologia e Gestão Ltda.,
            desenvolvido para centralizar e automatizar toda a operação de crédito — do cadastro
            de clientes à quitação de contratos. Ele conecta consultores, equipe financeira,
            operadores de caixa e clientes em uma única plataforma segura e auditável.
          </p>
          <p>
            O sistema gerencia o ciclo completo de vida de um contrato de crédito: análise de
            intenção, assinatura digital, liberação de capital, cobrança automática, recebimento
            de parcelas, tratamento de inadimplência e reparcelamento — tudo com rastreabilidade
            completa e separação de funções por perfil de acesso.
          </p>
          <p>
            Com integração nativa ao PIX via Mercado Pago, notificações automáticas por WhatsApp
            e e-mail, e um portal de autoatendimento para os clientes, o SIAFI reduz o trabalho
            operacional manual e garante que a equipe foque no que realmente importa: a gestão
            da carteira e o relacionamento com o cliente.
          </p>
        </div>
      </section>

      {/* Números */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Números do sistema</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard value={5}  label="Perfis de acesso" />
          <StatCard value={25} suffix="+" label="Telas operacionais" />
          <StatCard value={21} label="Módulos ativos" />
          <StatCard value={13} label="Templates de e-mail" />
          <StatCard value={3}  label="Canais de cobrança" />
          <StatCard value={99} suffix=",9%" label="SLA de uptime" />
        </div>
      </section>

      {/* Funcionalidades */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Funcionalidades principais</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-200 hover:shadow-md transition-all"
            >
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-blue-50">
                <Icon className="size-5 text-blue-600" />
              </div>
              <h3 className="mb-1.5 font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stack tecnológica (admin only) */}
      {isAdmin && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Stack tecnológica</h2>
          <div className="flex flex-wrap gap-2">
            {stack.map((tech) => (
              <span
                key={tech}
                className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-700"
              >
                {tech}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Linha do tempo */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Linha do tempo</h2>
        <ol className="relative border-l border-gray-200 pl-6 space-y-8">
          {timeline.map(({ date, label, current }) => (
            <li key={label} className="relative">
              <span
                className={`absolute -left-[1.5625rem] top-1 flex size-3 items-center justify-center rounded-full ring-4 ring-white ${
                  current ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              />
              <time className="mb-1 block text-xs font-medium text-gray-400 uppercase tracking-wider">
                {date}
              </time>
              <p className={`text-sm ${current ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                {label}
                {current && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    atual
                  </span>
                )}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Créditos e suporte */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Créditos e suporte</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Desenvolvido por</dt>
            <dd className="text-gray-700">Lidera Tecnologia e Gestão Ltda.</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Versão</dt>
            <dd className="text-gray-700">2.0.0</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Última atualização</dt>
            <dd className="text-gray-700">Maio 2026</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Suporte técnico</dt>
            <dd className="text-gray-700">
              Consulte <span className="font-medium text-blue-600">Configurações → Contato de suporte</span>
            </dd>
          </div>
        </dl>
      </section>

    </div>
  )
}
