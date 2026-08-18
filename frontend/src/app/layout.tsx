import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from 'sonner'
import { CookieBanner } from '@/components/lgpd/cookie-banner'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'SIAFI — Sistema Integrado de Apoio Financeiro',
  description: 'Sistema Integrado de Apoio Financeiro',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Link de recuperação de senha que o Supabase mandou para o Site URL
            (redirect_to fora da allow-list): o token vem no hash e viraria
            sessão silenciosa. Roda antes de qualquer JS da app e devolve o
            fluxo para /redefinir-senha com o hash intacto. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var h=location.hash;if(h&&h.indexOf('type=recovery')!==-1&&location.pathname.indexOf('/redefinir-senha')!==0){location.replace('/redefinir-senha'+h);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <Toaster richColors position="top-right" />
        <CookieBanner />
      </body>
    </html>
  )
}
