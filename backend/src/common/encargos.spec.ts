import { calcularEncargos } from './encargos';

describe('calcularEncargos', () => {
  it('mantem encargos restantes quando a baixa cobre o valor de face, mas nao a divida atual', () => {
    const vencimento = new Date(2026, 0, 1);
    const pagamento = new Date(2026, 0, 11);

    const enc = calcularEncargos(
      {
        installmentAmount: 500,
        totalPago: 500,
        saldoDevedor: 50,
        dataVencimento: vencimento,
        payments: [{ dataPagamento: pagamento, valorPago: 500 }],
      },
      0,
      1,
      pagamento,
    );

    expect(enc.saldo).toBe(50);
    expect(enc.valorMulta).toBe(0);
    expect(enc.valorMora).toBe(0);
    expect(enc.totalDevido).toBe(50);
  });
});
