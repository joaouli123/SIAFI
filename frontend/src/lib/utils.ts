import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toZonedTime } from "date-fns-tz"

const TIMEZONE = "America/Cuiaba"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

export function formatCurrency(val: unknown): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(toNumber(val))
}

export function formatPercent(val: unknown, decimals = 2): string {
  return `${toNumber(val).toFixed(decimals)}%`
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date))
}

export function formatDateLocal(date: string | Date): string {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

export function formatDateTimeLocal(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date
  return format(toZonedTime(d, TIMEZONE), "dd/MM/yyyy HH:mm", { locale: ptBR })
}

export function formatCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, "")
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "")
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return phone
}

export function formatCEP(cep: string): string {
  const d = cep.replace(/\D/g, "")
  if (d.length !== 8) return cep
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

export const STATUS_LOAN: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  aguardando_aceite:    { label: "Aguardando aceite", variant: "warning" },
  aguardando_liberacao: { label: "Aguardando liberação", variant: "warning" },
  ativo:        { label: "Ativo", variant: "success" },
  quitado:      { label: "Quitado", variant: "outline" },
  cancelado:    { label: "Cancelado", variant: "destructive" },
  inadimplente: { label: "Inadimplente", variant: "warning" },
}

export const STATUS_INSTALLMENT: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  pendente:          { label: "Pendente", variant: "outline" },
  parcialmente_pago: { label: "Parcialmente pago", variant: "warning" },
  pago:              { label: "Pago", variant: "success" },
  atrasado:          { label: "Atrasado", variant: "destructive" },
  cancelado:         { label: "Cancelado", variant: "warning" },
}

export const METODO_PAGAMENTO: Record<string, string> = {
  dinheiro:     "Dinheiro",
  pix:          "PIX",
  mercadopago:  "Mercado Pago",
  transferencia:"Transferência",
  cheque:       "Cheque",
  cartao:       "Cartão",
}
