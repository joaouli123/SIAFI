/* Diagnóstico somente-leitura: reproduz o rateio real das baixas da Fernanda. */
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    resolvePackageJsonExports: false,
    resolvePackageJsonImports: false,
    customConditions: null,
  },
});
const { splitParcela, baixasVivas, COMISSAO_PROPORCIONAL_DESDE, isProporcional } = require('./src/common/commission.ts');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const brl = (v) => Number(v ?? 0).toFixed(2);

async function main() {
  console.log('COMISSAO_PROPORCIONAL_DESDE =', COMISSAO_PROPORCIONAL_DESDE.toISOString());
  console.log('env COMISSAO_PROPORCIONAL_DESDE =', process.env.COMISSAO_PROPORCIONAL_DESDE || '(nao definida)');

  const clients = await prisma.client.findMany({
    where: { nome: { contains: 'Fernanda', mode: 'insensitive' } },
    select: { id: true, nome: true, consultorId: true },
  });
  console.log('\nCLIENTES:', clients);

  for (const c of clients) {
    const loans = await prisma.loan.findMany({
      where: { clientId: c.id },
      select: {
        id: true, status: true, comissaoPercentual: true,
        installments: {
          orderBy: { numero: 'asc' },
          select: {
            id: true, numero: true, status: true, dataVencimento: true,
            installmentAmount: true, principalPayback: true, netGain: true,
            totalPago: true, saldoDevedor: true, moraAcumulada: true, multaAplicada: true,
            payments: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true, valorPago: true, valorDevido: true, desconto: true,
                descontoTipo: true, dataPagamento: true, createdAt: true,
                estornado: true, contaDestino: true,
              },
            },
          },
        },
      },
    });

    for (const loan of loans) {
      const comPag = loan.installments.filter((i) => i.payments.length);
      if (!comPag.length) continue;
      console.log(`\n===== CLIENTE ${c.nome} (id ${c.id}) · CONTRATO #${loan.id} (${loan.status}) · comissao ${loan.comissaoPercentual}% =====`);
      for (const inst of comPag) {
        const vivas = baixasVivas(inst.payments);
        const params = {
          principalPayback: inst.principalPayback,
          installmentAmount: inst.installmentAmount,
          comissaoPercentual: loan.comissaoPercentual,
        };
        const splits = splitParcela(vivas, params);
        console.log(`\n  P${inst.numero} (id ${inst.id}) status=${inst.status} venc=${inst.dataVencimento.toISOString().slice(0, 10)}`);
        console.log(`    face=${brl(inst.installmentAmount)} capital=${brl(inst.principalPayback)} lucro=${brl(inst.netGain)} totalPago=${brl(inst.totalPago)} saldo=${brl(inst.saldoDevedor)} mora=${brl(inst.moraAcumulada)} multa=${brl(inst.multaAplicada)}`);
        console.log(`    regra: ${isProporcional(vivas) ? 'PROPORCIONAL' : 'CAPITAL-PRIMEIRO'} (baixas vivas: ${vivas.length})`);
        vivas.forEach((p, i) => {
          const s = splits[i];
          console.log(`    baixa#${p.id} ${new Date(p.dataPagamento).toISOString().slice(0, 10)} pago=${brl(p.valorPago)} valorDevido=${p.valorDevido === null ? 'NULL' : brl(p.valorDevido)} desc=${brl(p.desconto)}`
            + ` -> capital=${brl(s.capital)} lucro=${brl(s.lucro)} comissao=${brl(s.comissao)}`);
        });
        const estornadas = inst.payments.filter((p) => p.estornado);
        if (estornadas.length) console.log(`    (${estornadas.length} baixa(s) estornada(s) ignorada(s))`);
      }
    }
  }
}

main().catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
