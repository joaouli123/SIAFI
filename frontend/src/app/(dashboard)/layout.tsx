'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { TemaProvider } from '@/components/tema-provider'
import { useAuth, type UserRole } from '@/contexts/auth.context'
import { useSessionRecovery } from '@/hooks/use-session-recovery'
import { Loader2 } from 'lucide-react'

// Prefixes that require a minimum role set. First match wins.
const ROUTE_ROLES: Array<{ prefix: string; roles: UserRole[] }> = [
  // Admin only
  { prefix: '/usuarios',        roles: ['admin'] },
  { prefix: '/configuracoes',   roles: ['admin'] },
  { prefix: '/auditoria',       roles: ['admin'] },
  { prefix: '/documentacao',    roles: ['admin'] },
  // Admin + Financeiro
  { prefix: '/emprestimos',     roles: ['admin', 'financeiro'] },
  { prefix: '/relatorios',      roles: ['admin', 'financeiro'] },
  { prefix: '/renegociacoes',   roles: ['admin', 'financeiro'] },
  { prefix: '/conciliacao',     roles: ['admin', 'financeiro'] },
  { prefix: '/inadimplentes',   roles: ['admin', 'financeiro'] },
  { prefix: '/notificacoes',    roles: ['admin', 'financeiro'] },
  // Admin + Financeiro + Consultor
  { prefix: '/pix',             roles: ['admin', 'financeiro', 'consultor'] },
  { prefix: '/solicitacoes',    roles: ['admin', 'financeiro', 'consultor'] },
  { prefix: '/intencoes',       roles: ['admin', 'financeiro', 'consultor'] },
  { prefix: '/cobrancas',       roles: ['admin', 'financeiro', 'consultor'] },
  { prefix: '/reparcelamentos', roles: ['admin', 'financeiro', 'consultor'] },
  { prefix: '/consultor',       roles: ['admin', 'financeiro', 'consultor'] },
  // Admin + Financeiro + Caixa
  { prefix: '/caixa',           roles: ['admin', 'financeiro', 'caixa'] },
  { prefix: '/parcelas',        roles: ['admin', 'financeiro', 'caixa'] },
  { prefix: '/pagamentos',      roles: ['admin', 'financeiro', 'caixa'] },
  { prefix: '/suporte',         roles: ['admin', 'financeiro', 'caixa'] },
  // Admin + Financeiro + Caixa + Consultor
  { prefix: '/clientes',        roles: ['admin', 'financeiro', 'caixa', 'consultor'] },
  { prefix: '/mensagens',       roles: ['admin', 'financeiro', 'caixa', 'consultor'] },
  // Financeiro + Caixa (liberações)
  { prefix: '/liberacoes-pendentes', roles: ['admin', 'financeiro', 'caixa'] },
]

function isAllowed(pathname: string, role: UserRole): boolean {
  const match = ROUTE_ROLES.find((r) => pathname.startsWith(r.prefix))
  if (!match) return true
  return (match.roles as string[]).includes(role)
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useSessionRecovery()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname ?? '/dashboard')}`)
      return
    }
    if (!isLoading && user?.role === 'cliente') {
      router.replace('/portal')
      return
    }
    if (!isLoading && user && pathname && !isAllowed(pathname, user.role)) {
      router.replace('/dashboard')
    }
  }, [isAuthenticated, isLoading, user, pathname, router])

  // Show spinner during initial load OR while a redirect is pending (auth lost / wrong role).
  // Returning null here causes a white screen because router.replace() is async.
  if (isLoading || !isAuthenticated || user?.role === 'cliente') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-blue-600" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <TemaProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex flex-1 flex-col min-w-0">
          <Topbar onMenuToggle={() => setSidebarOpen((v) => !v)} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </TemaProvider>
  )
}
