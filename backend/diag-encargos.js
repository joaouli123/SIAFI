/* Diagnóstico somente-leitura: totalDevido atual x sem o saldoDevedor gravado. */
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs', moduleResolution: 'node', resolvePackageJsonExports: false, resolvePackageJsonImports: false, customConditions: null },
});
const { calcularEncargos } = require('./src/common/encargos.ts');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const brl = (v) => Number(v ?? 0).toFixed(2);

async function main() {
  const [ms, mos] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { chave: 'financeiro.multa_atraso_percentual' } }),
    prisma.siteSetting.findUnique({ where: { chave: 'financeiro.mora_dia_percentual' } }),
  ]);
  const multaDefault = ms?.valor ? parseFloat(ms.valor) : 2.0;
  const moraDefault = mos?.valor ? parseFloat(mos.valor) : 0.0333;
  console.log(`taxas: multa=${multaDefault}%  mora/dia=${moraDefault}%\n`);

  const insts = await prisma.installment.findMany({
    where: { status: { in: ['atrasado', 'parcialmente_pago', 'pendente'] }, loan: { status: 'ativo' } },
    orderBy: { id: 'asc' },
    select: {
      id: true, numero: true, status: true, dataVencimento: true,
      installmentAmount: true, totalPago: true, saldoDevedor: true,
      moraAcumulada: true, multaAplicada: true,
      payments: { where: { estornado: false }, select: { dataPagamento: true, valorPago: true, estornado: true } },
      loan: { select: { id: true, multaPercentual: true, moraDiariaPercentual: true, client: { select: { nome: true } } } },
    },
  });

  const hoje = new Date();
  console.log('parcela | cliente | face | pago | saldoGravado | ---- COM saldo gravado ---- | ---- SEM (face-pago) ----');
  for (const i of insts) {
    const mp = i.loan.multaPercentual != null ? Number(i.loan.multaPercentual) : multaDefault;
    const md = i.loan.moraDiariaPercentual != null ? Number(i.loan.moraDiariaPercentual) : moraDefault;
    const comSaldo = calcularEncargos(i, mp, md, hoje);
    const semSaldo = calcularEncargos({ ...i, saldoDevedor: null }, mp, md, hoje);
    const flag = Math.abs(comSaldo.totalDevido - semSaldo.totalDevido) > 0.01 ? '  <<< DIVERGE' : '';
    console.log(
      `#${i.id} P${i.numero} ${i.loan.client.nome.split(' ')[0].padEnd(9)} face=${brl(i.installmentAmount)} pago=${brl(i.totalPago)} saldoGrav=${brl(i.saldoDevedor)}` +
      ` | saldo=${brl(comSaldo.saldo)} multa=${brl(comSaldo.valorMulta)} mora=${brl(comSaldo.valorMora)} TOTAL=${brl(comSaldo.totalDevido)}` +
      ` | saldo=${brl(semSaldo.saldo)} multa=${brl(semSaldo.valorMulta)} mora=${brl(semSaldo.valorMora)} TOTAL=${brl(semSaldo.totalDevido)}${flag}`,
    );
  }
}

main().catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
