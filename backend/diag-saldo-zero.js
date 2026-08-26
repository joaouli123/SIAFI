/* Diagnóstico somente-leitura: parcelas em aberto com saldo_devedor zerado. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const brl = (v) => Number(v ?? 0).toFixed(2);

async function main() {
  const insts = await prisma.installment.findMany({
    where: { status: { notIn: ['pago', 'cancelado'] } },
    orderBy: { id: 'asc' },
    select: {
      id: true, numero: true, status: true, dataVencimento: true,
      installmentAmount: true, totalPago: true, saldoDevedor: true,
      loan: { select: { id: true, status: true, client: { select: { nome: true } } } },
      _count: { select: { payments: true } },
    },
  });

  const zeradas = insts.filter(
    (i) => Number(i.saldoDevedor) <= 0.005 && Number(i.installmentAmount) - Number(i.totalPago) > 0.005,
  );

  console.log(`Parcelas em aberto: ${insts.length}`);
  console.log(`Parcelas com saldo_devedor = 0 mas ainda devendo: ${zeradas.length}\n`);

  let perdido = 0;
  for (const i of zeradas) {
    const devido = Number(i.installmentAmount) - Number(i.totalPago);
    perdido += devido;
    console.log(
      `  #${i.id} P${i.numero} ${i.loan.client.nome} · contrato ${i.loan.id} (${i.loan.status}) · ${i.status}` +
      ` · venc ${i.dataVencimento.toISOString().slice(0, 10)} · face ${brl(i.installmentAmount)} · pago ${brl(i.totalPago)}` +
      ` · baixas ${i._count.payments} · SISTEMA MOSTRA DEVENDO 0, REAL ${brl(devido)}`,
    );
  }
  console.log(`\nValor de face que o sistema hoje trata como quitado: R$ ${brl(perdido)}`);

  const contratos = [...new Set(zeradas.map((i) => i.loan.id))];
  console.log(`Contratos afetados: ${contratos.join(', ')}`);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
