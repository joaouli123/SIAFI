/*
 * Reconstroi Payment.valorDevido (divida com encargos no dia da baixa) para as baixas
 * gravadas ANTES da coluna existir. Sem esse valor o rateio proporcional cai no valor de
 * face e devolve capital cheio — foi o que o cliente viu na baixa de 21/07 do Juan.
 *
 *   node backfill-valor-devido.js            -> simulacao
 *   node backfill-valor-devido.js --aplicar  -> grava
 */
const { PrismaClient } = require('@prisma/client');
const { calcularEncargos } = require('./dist/src/common/encargos');
const { splitParcela } = require('./dist/src/common/commission');
const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const brl = (v) => Number(v ?? 0).toFixed(2);

async function main() {
  const cfg = await prisma.siteSetting.findMany({
    where: { chave: { in: ['financeiro.multa_atraso_percentual', 'financeiro.mora_dia_percentual'] } },
  }).catch(() => []);
  const num = (c, d) => {
    const s = cfg.find((x) => x.chave === c);
    return s ? Number(s.valor) : d;
  };
  const multaDefault = num('financeiro.multa_atraso_percentual', 2);
  const moraDefault = num('financeiro.mora_dia_percentual', 0.0333);

  const parcelas = await prisma.installment.findMany({
    where: { payments: { some: { valorDevido: null, estornado: false } } },
    select: {
      id: true, numero: true, installmentAmount: true, principalPayback: true,
      dataVencimento: true,
      loan: {
        select: {
          id: true, multaPercentual: true, moraDiariaPercentual: true, comissaoPercentual: true,
          client: { select: { nome: true } },
        },
      },
      payments: {
        where: { estornado: false },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, valorPago: true, valorDevido: true, desconto: true, dataPagamento: true, createdAt: true },
      },
    },
  });

  console.log(aplicar ? 'APLICANDO\n' : 'SIMULACAO (use --aplicar para gravar)\n');
  let n = 0;

  for (const inst of parcelas) {
    const multa = inst.loan.multaPercentual != null ? Number(inst.loan.multaPercentual) : multaDefault;
    const mora = inst.loan.moraDiariaPercentual != null ? Number(inst.loan.moraDiariaPercentual) : moraDefault;
    const antes = [];
    const novos = [];

    for (const p of inst.payments) {
      let valorDevido = p.valorDevido == null ? null : Number(p.valorDevido);
      if (valorDevido == null) {
        const enc = calcularEncargos(
          {
            installmentAmount: inst.installmentAmount,
            totalPago: antes.reduce((s, b) => s + Number(b.valorPago), 0),
            saldoDevedor: null,
            dataVencimento: inst.dataVencimento,
            payments: antes,
          },
          multa, mora, new Date(p.dataPagamento),
        );
        valorDevido = enc.totalDevido;
        novos.push({ id: p.id, valorDevido });
      }
      antes.push({ ...p, valorDevido });
    }

    if (!novos.length) continue;
    n += novos.length;

    const params = {
      principalPayback: inst.principalPayback,
      installmentAmount: inst.installmentAmount,
      comissaoPercentual: inst.loan.comissaoPercentual,
    };
    const antesSplit = splitParcela(inst.payments, params);
    const depoisSplit = splitParcela(antes, params);

    console.log(`${inst.loan.client.nome} · contrato ${inst.loan.id} P${inst.numero} · face ${brl(inst.installmentAmount)} capital ${brl(inst.principalPayback)}`);
    inst.payments.forEach((p, i) => {
      const nv = novos.find((x) => x.id === p.id);
      console.log(
        `   baixa #${p.id} ${new Date(p.dataPagamento).toISOString().slice(0, 10)} pago ${brl(p.valorPago)}` +
        ` · valorDevido ${p.valorDevido == null ? `NULL -> ${brl(nv?.valorDevido)}` : brl(p.valorDevido) + ' (mantido)'}` +
        ` · capital ${brl(antesSplit[i].capital)} -> ${brl(depoisSplit[i].capital)}` +
        ` · lucro ${brl(antesSplit[i].lucro)} -> ${brl(depoisSplit[i].lucro)}`,
      );
    });
    console.log();

    if (aplicar) {
      for (const nv of novos) {
        await prisma.payment.update({ where: { id: nv.id }, data: { valorDevido: nv.valorDevido } });
      }
    }
  }

  console.log(`Baixas sem valorDevido: ${n}`);
  if (!aplicar) console.log('Nada foi gravado.');
}

main().catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
