/**
 * Popula empréstimos + parcelas de teste (algumas atrasadas) para os 3 clientes
 * já criados pelo seed.ts, para validar: card "Clientes Atrasados" no dashboard
 * e coluna "Atualizado" (valor + juros) na listagem de parcelas.
 *
 * Uso:
 *   cd backend
 *   npx ts-node --project tsconfig.json --transpile-only prisma/seed-test-data.ts
 *
 * Idempotente: pula clientes que já têm empréstimo de teste (observacoes = 'SEED_TESTE').
 */
import * as dotenv from 'dotenv'
dotenv.config()

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const MULTA_PCT = 0.02
const MORA_DIA_PCT = 0.0033

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

async function seedLoanForClient(cpf: string) {
  // Aceita CPF cru ou formatado — o seed.ts grava formatado (000.000.000-00)
  const digits = cpf.replace(/\D/g, '')
  const formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  const client = await prisma.client.findFirst({ where: { cpf: { in: [digits, formatted] } } })
  if (!client) {
    console.error(`  [erro] cliente com CPF ${cpf} não encontrado — rode prisma/seed.ts antes`)
    return
  }

  const existing = await prisma.loan.findFirst({
    where: { clientId: client.id, observacoes: 'SEED_TESTE' },
  })
  if (existing) {
    console.log(`  [skip] "${client.nome}" já tem empréstimo de teste (loan ${existing.id})`)
    return
  }

  const principal = 3000
  const numeroParcelas = 6
  const valorParcela = 500 // 3000 + 20% lucro / 6
  const targetProfit = 600
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dataInicio = addMonths(today, -5)

  const loan = await prisma.loan.create({
    data: {
      clientId: client.id,
      principalAmount: principal,
      targetProfit,
      totalReceivable: principal + targetProfit,
      numeroParcelas,
      dataInicio,
      status: 'ativo',
      observacoes: 'SEED_TESTE',
      multaPercentual: MULTA_PCT * 100,
      moraDiariaPercentual: MORA_DIA_PCT * 100,
    },
  })

  // 6 parcelas mensais a partir de 1 mês após o início.
  // Parcelas 1 e 2: vencidas há tempo, sem pagamento → status 'atrasado' com encargos.
  // Parcela 3: vencida ontem, ainda não processada pelo cron → também marcada 'atrasado'.
  // Parcelas 4-6: futuras, 'pendente'.
  for (let i = 1; i <= numeroParcelas; i++) {
    const dataVencimento = addMonths(dataInicio, i)
    const isPast = dataVencimento < today
    const diasAtraso = isPast ? Math.floor((today.getTime() - dataVencimento.getTime()) / 86400000) : 0

    const multaAplicada = isPast ? Number((valorParcela * MULTA_PCT).toFixed(2)) : 0
    const moraAcumulada = isPast ? Number((valorParcela * MORA_DIA_PCT * diasAtraso).toFixed(2)) : 0
    const valorComEncargos = isPast ? Number((valorParcela + multaAplicada + moraAcumulada).toFixed(2)) : null

    await prisma.installment.create({
      data: {
        loanId: loan.id,
        numero: i,
        installmentAmount: valorParcela,
        principalPayback: principal / numeroParcelas,
        netGain: targetProfit / numeroParcelas,
        saldoDevedor: isPast ? valorParcela : 0,
        moraAcumulada,
        multaAplicada,
        valorComEncargos: valorComEncargos ?? undefined,
        dataVencimento,
        status: isPast ? 'atrasado' : 'pendente',
      },
    })
  }

  console.log(`  [ok] empréstimo de teste criado para "${client.nome}" — loan ${loan.id} (3 parcelas atrasadas, 3 pendentes)`)
}

async function main() {
  console.log('\n=== SIAFI Seed — Empréstimos/Parcelas de teste ===')
  await seedLoanForClient('90150459173') // Eloá Clara Analu Nascimento
  await seedLoanForClient('38979033184') // Juan Ian Barros
  await seedLoanForClient('63231627176') // Fernanda Alícia Teixeira
  console.log('\nSeed de teste concluído.\n')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
