/*
 * Reparo pontual: parcelas em aberto cujo saldo_devedor ficou em 0 por causa do @default(0)
 * do schema (nunca foram inicializadas com o valor de face). Enquanto ficam assim, o sistema
 * as trata como dívida R$ 0,00: somem da carteira, o PIX sai zerado e qualquer baixa é
 * recusada com "excede o total devido com encargos (0,00)".
 *
 * Uso:
 *   node fix-saldo-devedor.js           -> simulação (não grava nada)
 *   node fix-saldo-devedor.js --aplicar -> grava
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const brl = (v) => Number(v ?? 0).toFixed(2);

async function main() {
  const alvo = await prisma.installment.findMany({
    where: { status: { notIn: ['pago', 'cancelado'] }, saldoDevedor: { lte: 0.005 } },
    orderBy: { id: 'asc' },
    select: {
      id: true, numero: true, status: true, installmentAmount: true, totalPago: true,
      saldoDevedor: true, dataVencimento: true,
      loan: { select: { id: true, client: { select: { nome: true } } } },
      _count: { select: { payments: true } },
    },
  });

  const corrigir = alvo.filter(
    (i) => Number(i.installmentAmount) - Number(i.totalPago) > 0.005 && i._count.payments === 0,
  );
  const ignorados = alvo.filter((i) => !corrigir.includes(i));

  console.log(`${aplicar ? 'APLICANDO' : 'SIMULACAO (use --aplicar para gravar)'}\n`);
  console.log(`Parcelas em aberto com saldo_devedor = 0: ${alvo.length}`);
  console.log(`A corrigir (sem nenhuma baixa registrada): ${corrigir.length}`);
  console.log(`Preservadas (têm baixas — o 0 pode ser legítimo): ${ignorados.length}\n`);

  let total = 0;
  for (const i of corrigir) {
    const novo = Number(i.installmentAmount) - Number(i.totalPago);
    total += novo;
    console.log(
      `  #${i.id} ${i.loan.client.nome} · contrato ${i.loan.id} P${i.numero} (${i.status})` +
      ` · venc ${i.dataVencimento.toISOString().slice(0, 10)} · saldo 0,00 -> ${brl(novo)}`,
    );
    if (aplicar) {
      await prisma.installment.update({ where: { id: i.id }, data: { saldoDevedor: novo } });
    }
  }
  console.log(`\nTotal devolvido à carteira: R$ ${brl(total)}`);
  if (!aplicar) console.log('\nNada foi gravado.');
}

main().catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
