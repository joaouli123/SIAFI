import { remainingCapital, splitParcela } from './commission';

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

  it('calcula o capital restante depois de uma baixa parcial com encargos', () => {
    const payments = [
      {
        valorPago: 500,
        valorDevido: 864.6,
        dataPagamento: '2026-08-03',
      },
    ];
    const parcela = {
      principalPayback: 500,
      installmentAmount: 600,
      comissaoPercentual: 10,
    };

    expect(splitParcela(payments, parcela)[0].capital).toBe(289.15);
    expect(remainingCapital(payments, parcela)).toBe(210.85);
  });

  it('separa a comissao do consultor e do administrador', () => {
    const [split] = splitParcela(
      [{ valorPago: 600, dataPagamento: '2026-08-05' }],
      {
        principalPayback: 500,
        installmentAmount: 600,
        comissaoPercentual: 30,
        comissaoAdministradorPercentual: 20,
      },
    );

    expect(split.lucro).toBe(100);
    expect(split.comissao).toBe(30);
    expect(split.comissaoAdministrador).toBe(20);
    expect(split.lucroEmpresa).toBe(split.lucro - split.comissao - split.comissaoAdministrador);
    expect(split.lucroEmpresa).toBe(50);
  });

  it('fecha o lucro da empresa com os valores monetarios exibidos', () => {
    const [split] = splitParcela(
      [{ valorPago: 500, valorDevido: 864.6, dataPagamento: '2026-08-03' }],
      {
        principalPayback: 500,
        installmentAmount: 600,
        comissaoPercentual: 10,
        comissaoAdministradorPercentual: 10,
      },
    );

    expect(split.lucro).toBe(210.85);
    expect(split.comissao).toBe(21.08);
    expect(split.comissaoAdministrador).toBe(21.08);
    expect(split.lucroEmpresa).toBe(168.69);
    expect(split.lucroEmpresa).toBe(Number((split.lucro - split.comissao - split.comissaoAdministrador).toFixed(2)));
  });
});
