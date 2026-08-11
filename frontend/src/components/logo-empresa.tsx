'use client'

import Image from 'next/image'
import { useTema } from '@/hooks/use-tema'

interface LogoEmpresaProps {
  altura?: number
  className?: string
  fallbackTexto?: boolean
}

export function LogoEmpresa({
  altura = 36,
  className,
  fallbackTexto = true,
}: LogoEmpresaProps) {
  const { data: tema } = useTema()

  if (tema?.logoUrl) {
    return (
      <Image
        src={tema.logoUrl}
        alt={tema.nomeFantasia}
        height={altura}
        width={altura * 5}
        className={`object-contain ${className ?? ''}`}
        style={{ height: altura, width: 'auto', maxWidth: altura * 5 }}
        priority
        unoptimized
      />
    )
  }

  if (fallbackTexto) {
    return (
      <span
        className={`font-bold text-white leading-none ${className ?? ''}`}
        style={{ fontSize: Math.max(13, Math.round(altura * 0.48)) }}
      >
        {tema?.nomeFantasia || 'SIFI'}
      </span>
    )
  }

  return null
}
