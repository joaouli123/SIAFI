'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, LogOut, ChevronDown, User, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/auth.context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/clients': 'Clientes',
  '/loans': 'Empréstimos',
  '/installments': 'Parcelas',
  '/payments': 'Pagamentos',
  '/transactions': 'Caixa',
  '/settings': 'Configurações',
  '/audit': 'Auditoria',
}

function getPageTitle(pathname: string): string {
  for (const [path, title] of Object.entries(pageTitles)) {
    if (pathname === path || pathname.startsWith(path + '/')) return title
  }
  return 'SIFI'
}

function getInitials(nome: string) {
  return nome
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

const roleLabel: Record<string, string> = {
  admin: 'Administrador',
  financeiro: 'Financeiro',
  consultor: 'Consultor',
  caixa: 'Caixa',
  cliente: 'Cliente',
}

interface TopbarProps {
  onMenuToggle: () => void
}

export function Topbar({ onMenuToggle }: TopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const pageTitle = getPageTitle(pathname)

  return (
    <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-border/60 bg-background/80 backdrop-blur-xl flex-shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>
        
        {Object.keys(pageTitles).includes(pathname) || pathname === '/' ? (
          <h1 className="text-sm font-semibold text-foreground tracking-tight">{pageTitle}</h1>
        ) : (
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            Voltar
          </button>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <User className="size-4 text-primary" strokeWidth={2.5} />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium leading-none">{user?.nome ?? 'Usuário'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {user ? (roleLabel[user.role] ?? user.role) : ''}
            </p>
          </div>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', dropdownOpen && 'rotate-180')} />
        </button>

        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setDropdownOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-xl border border-border bg-popover shadow-lg py-1">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-sm font-medium">{user?.nome}</p>
                <p className="text-xs text-muted-foreground">{user ? (roleLabel[user.role] ?? user.role) : ''}</p>
              </div>
              <button
                onClick={async () => {
                  setDropdownOpen(false)
                  await logout()
                  router.replace('/login')
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <LogOut className="size-4" />
                Sair
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
