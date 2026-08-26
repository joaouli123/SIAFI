/* Somente leitura: TODAS as baixas da Fernanda, inclusive estornadas, com createdAt real. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const brl = (v) => Number(v ?? 0).toFixed(2);
const dt = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) + 'Z' : '—');

async function main() {
  const pays = await prisma.payment.findMany({
    where: { installment: { loan: { client: { nome: { contains: 'Fernanda', mode: 'insensitive' } } } } },
    orderBy: { id: 'asc' },
    select: {
      id: true, valorPago: true, valorDevido: true, desconto: true, descontoTipo: true,
      dataPagamento: true, createdAt: true, estornadoEm: true, estornado: true,
      metodoPagamento: true, contaDestino: true, observacao: true,
      installment: {
        select: {
          id: true, numero: true, status: true, installmentAmount: true,
          principalPayback: true, netGain: true, totalPago: true, saldoDevedor: true,
          loan: { select: { id: true, comissaoPercentual: true } },
        },
      },
    },
  });

  console.log(`Baixas da Fernanda: ${pays.length}\n`);
  for (const p of pays) {
    const i = p.installment;
    console.log(
      `baixa #${p.id} contrato ${i.loan.id} P${i.numero} (parcela id ${i.id})\n` +
      `   pago=${brl(p.valorPago)} valorDevido=${p.valorDevido === null ? 'NULL' : brl(p.valorDevido)} desc=${brl(p.desconto)} (${p.descontoTipo ?? '—'}) metodo=${p.metodoPagamento} conta=${p.contaDestino ?? '—'}\n` +
      `   dataPagamento(digitada)=${dt(p.dataPagamento)}\n` +
      `   createdAt(gravacao real)=${dt(p.createdAt)}  estornadoEm=${dt(p.estornadoEm)}  estornado=${p.estornado}\n` +
      `   parcela: face=${brl(i.installmentAmount)} capital=${brl(i.principalPayback)} lucro=${brl(i.netGain)} totalPago=${brl(i.totalPago)} saldo=${brl(i.saldoDevedor)} status=${i.status}\n` +
      `   CAPITAL-PRIMEIRO mostraria: capital=${brl(Math.min(Number(p.valorPago), Number(i.principalPayback)))} lucro=${brl(Math.max(0, Number(p.valorPago) - Number(i.principalPayback)))}`,
    );
    console.log();
  }

  const ultimas = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' }, take: 8,
    select: { id: true, createdAt: true, dataPagamento: true, valorPago: true, estornado: true,
      installment: { select: { numero: true, loan: { select: { id: true, client: { select: { nome: true } } } } } } },
  });
  console.log('=== ULTIMAS 8 BAIXAS DO SISTEMA (por createdAt) ===');
  for (const p of ultimas) {
    console.log(`  #${p.id} ${dt(p.createdAt)} · ${p.installment.loan.client.nome} contrato ${p.installment.loan.id} P${p.installment.numero} · pago ${brl(p.valorPago)} · data digitada ${dt(p.dataPagamento).slice(0,10)} · estornado=${p.estornado}`);
  }
}

main().catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
