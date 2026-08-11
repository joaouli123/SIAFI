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

  // Regressão 01/08/2026: saldo_devedor tem @default(0) no schema e parcelas antigas nunca
  // receberam o valor de face. Ao passar a confiar nesse campo, 14 parcelas em aberto ficaram
  // valendo R$ 0,00 — não dava para dar baixa nelas ("excede o total devido (0,00)").
  it('ignora saldoDevedor zerado quando a parcela nunca recebeu baixa', () => {
    const vencimento = new Date(2026, 6, 3);
    const hoje = new Date(2026, 7, 2);

    const enc = calcularEncargos(
      {
        installmentAmount: 500,
        totalPago: 0,
        saldoDevedor: 0,
        dataVencimento: vencimento,
        payments: [],
      },
      2,
      0.0333,
      hoje,
    );

    expect(enc.saldo).toBe(500);
    expect(enc.valorMulta).toBe(10);
    expect(enc.diasAtraso).toBe(30);
    expect(enc.totalDevido).toBeGreaterThan(510);
  });

  it('ignora saldoDevedor zerado mesmo sem a lista de baixas carregada', () => {
    const enc = calcularEncargos(
      { installmentAmount: 669.6, totalPago: 0, saldoDevedor: 0, dataVencimento: new Date(2026, 6, 15) },
      2,
      0.0333,
      new Date(2026, 7, 2),
    );

    expect(enc.saldo).toBe(669.6);
    expect(enc.totalDevido).toBeGreaterThan(669.6);
  });

  it('preserva saldo zero de parcela realmente quitada', () => {
    const enc = calcularEncargos(
      {
        installmentAmount: 500,
        totalPago: 500,
        saldoDevedor: 0,
        dataVencimento: new Date(2026, 0, 1),
        payments: [{ dataPagamento: new Date(2026, 0, 5), valorPago: 500 }],
      },
      2,
      0.0333,
      new Date(2026, 1, 1),
    );

    expect(enc.saldo).toBe(0);
    expect(enc.totalDevido).toBe(0);
  });

  it('começa a mora do saldo restante na data da baixa parcial', () => {
    const baixaParcial = new Date(2026, 7, 8);
    const hoje = new Date(2026, 7, 10);

    const enc = calcularEncargos(
      {
        installmentAmount: 600,
        totalPago: 300,
        // R$ 50 já estavam incorporados ao saldo no momento da baixa.
        saldoDevedor: 350,
        dataVencimento: new Date(2026, 5, 15),
        payments: [{ dataPagamento: baixaParcial, valorPago: 300 }],
      },
      2,
      0.0333,
      hoje,
    );

    // Apenas dois dias de mora sobre o saldo após a baixa (350 × 0,0333% × 2).
    expect(enc.valorMulta).toBe(0);
    expect(enc.valorMora).toBe(0.23);
    expect(enc.totalDevido).toBe(350.23);
  });
});
