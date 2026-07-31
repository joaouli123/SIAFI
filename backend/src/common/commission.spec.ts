import { splitParcela } from './commission';

describe('splitParcela', () => {
  it('rateia capital sobre a divida atual quando o pagamento cobre o valor de face', () => {
    const [split] = splitParcela(
      [
        {
          valorPago: 500,
          valorDevido: 699.75,
          dataPagamento: '2026-07-25',
        },
      ],
      {
        principalPayback: 500,
        installmentAmount: 500,
        comissaoPercentual: 0,
      },
    );

    expect(split.capital).toBe(357.27);
    expect(split.lucro).toBe(142.73);
  });

  it('absorve o capital restante quando pagamento mais desconto quita a divida atual', () => {
    const [split] = splitParcela(
      [
        {
          valorPago: 735,
          valorDevido: 737.7,
          desconto: 2.7,
          dataPagamento: '2026-07-25',
        },
      ],
      {
        principalPayback: 500,
        installmentAmount: 500,
        comissaoPercentual: 0,
      },
    );

    expect(split.capital).toBe(500);
    expect(split.lucro).toBe(235);
  });

  it('mantem capital-primeiro para parcela iniciada antes de 24/07/2026', () => {
    const [split] = splitParcela(
      [
        {
          valorPago: 300,
          valorDevido: 701.4,
          dataPagamento: '2026-07-23',
        },
      ],
      {
        principalPayback: 500,
        installmentAmount: 500,
        comissaoPercentual: 0,
      },
    );

    expect(split.capital).toBe(300);
    expect(split.lucro).toBe(0);
  });
});
