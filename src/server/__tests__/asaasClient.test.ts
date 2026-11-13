import { describe, expect, it, vi } from 'vitest';
import { AsaasClient, AsaasApiError } from '../asaasClient';

const SANDBOX_KEY = '$aact_hmlg_' + 'A'.repeat(48);
const PRODUCTION_KEY = '$aact_prod_' + 'B'.repeat(48);

function clientWithResponse(result: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(result), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return {
    client: new AsaasClient({ environment: 'sandbox', apiKey: SANDBOX_KEY, fetchImpl }),
    calls,
  };
}

describe('AsaasClient — borda financeira privada', () => {
  it('recusa chave do ambiente errado e produção sem autorização explícita', () => {
    expect(() => new AsaasClient({ environment: 'production', apiKey: SANDBOX_KEY })).toThrow(/Credencial/);
    expect(() => new AsaasClient({ environment: 'sandbox', apiKey: PRODUCTION_KEY })).toThrow(/Credencial/);
    expect(() => new AsaasClient({ environment: 'production', apiKey: PRODUCTION_KEY })).toThrow(/autorização/);
    const approved = new AsaasClient({ environment: 'production', apiKey: PRODUCTION_KEY, productionApproved: true });
    expect(approved).toBeInstanceOf(AsaasClient);
  });

  it('cria cobrança Pix no endpoint oficial, com centavos e segredo somente no servidor', async () => {
    const { client, calls } = clientWithResponse({ id: 'pay_123456', status: 'PENDING' });
    const result = await client.createPixCharge({
      asaasCustomerId: 'cus_000123',
      amountCents: 10090,
      dueDate: '2026-11-30',
      externalReference: 'LOLA-20261113-ABCDEF123456',
    });
    expect(result).toEqual({ id: 'pay_123456', status: 'PENDING' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api-sandbox.asaas.com/v3/payments');
    expect((calls[0].init.headers as Record<string, string>).access_token).toBe(SANDBOX_KEY);
    expect((calls[0].init.headers as Record<string, string>)['User-Agent']).toMatch(/^LOLA/);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      customer: 'cus_000123', billingType: 'PIX', value: 100.9,
      dueDate: '2026-11-30', externalReference: 'LOLA-20261113-ABCDEF123456',
    });
  });

  it('não tenta rede com centavos fracionários, data inexistente ou ID malicioso', async () => {
    const { client, calls } = clientWithResponse({ id: 'pay_123', status: 'PENDING' });
    const valid = {
      asaasCustomerId: 'cus_000123', amountCents: 1099,
      dueDate: '2026-11-30', externalReference: 'LOLA-20261113-ABCDEF123456',
    };
    await expect(client.createPixCharge({ ...valid, amountCents: 10.5 })).rejects.toThrow(/inteiro/);
    await expect(client.createPixCharge({ ...valid, dueDate: '2026-02-30' })).rejects.toThrow(/Vencimento/);
    await expect(client.createPixCharge({ ...valid, asaasCustomerId: 'cus_..%2f' })).rejects.toThrow(/inválid/);
    expect(calls).toHaveLength(0);
  });

  it('obtém o QR Code Pix com payload copia e cola e consulta conciliação', async () => {
    const qr = clientWithResponse({ encodedImage: 'QUJDRA==', payload: '000201PIX', expirationDate: '2026-12-01' });
    expect(await qr.client.getPixQrCode('pay_123456')).toEqual({
      encodedImage: 'QUJDRA==', payload: '000201PIX', expirationDate: '2026-12-01',
    });
    expect(qr.calls[0].url).toBe('https://api-sandbox.asaas.com/v3/payments/pay_123456/pixQrCode');

    const reconcile = clientWithResponse({
      id: 'pay_123456', status: 'RECEIVED', value: 100.9, externalReference: 'LOLA-20261113-ABCDEF123456',
    });
    expect((await reconcile.client.getPayment('pay_123456')).status).toBe('RECEIVED');
  });

  it('gera checkout hospedado de cartão sem coletar PAN/CVV e recusa link externo', async () => {
    const request = {
      asaasCustomerId: 'cus_000123',
      externalReference: 'LOLA-20261113-ABCDEF123456',
      items: [{ name: 'Brinco inox', quantity: 2, valueCents: 5000, imageBase64: 'QUJDRA==' }],
      minutesToExpire: 20,
      callback: {
        successUrl: 'https://loja.valid.example/pagamento/retorno',
        cancelUrl: 'https://loja.valid.example/pagamento/cancelado',
      },
    };
    const { client, calls } = clientWithResponse({
      id: 'abcd-1234', link: 'https://sandbox.asaas.com/checkoutSession/show/abcd-1234',
    });
    const result = await client.createCardCheckout(request);
    expect(result.link).toMatch(/^https:\/\/sandbox\.asaas\.com\//);
    const payload = JSON.parse(String(calls[0].init.body));
    expect(payload.chargeTypes).toEqual(['DETACHED']);
    expect(payload.billingTypes).toEqual(['CREDIT_CARD']);
    expect(payload.items[0].value).toBe(50);
    expect(payload.customer).toBe('cus_000123');
    expect(JSON.stringify(payload)).not.toMatch(/cardNumber|cvv|expiry/i);

    const unsafe = clientWithResponse({ id: 'abcd', link: 'https://evil.example/collect' });
    await expect(unsafe.client.createCardCheckout(request)).rejects.toThrow(/não autorizado/);
  });

  it('reembolso exige referência de autorização e valor inteiro positivo', async () => {
    const { client, calls } = clientWithResponse({ id: 'pay_123456', status: 'REFUNDED' });
    await expect(client.refundApproved({
      approvalReference: '', asaasPaymentId: 'pay_123456', amountCents: 1500, description: 'Devolução autorizada',
    })).rejects.toThrow(/Aprovação/);
    const result = await client.refundApproved({
      approvalReference: 'refund-approval-12345', asaasPaymentId: 'pay_123456',
      amountCents: 1500, description: 'Devolução autorizada',
    });
    expect(result.status).toBe('REFUNDED');
    expect(calls[0].url).toBe('https://api-sandbox.asaas.com/v3/payments/pay_123456/refund');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      value: 15, description: 'Devolução autorizada',
    });
  });

  it('não repassa mensagens do provedor possivelmente contendo dados sensíveis', async () => {
    const { client } = clientWithResponse({
      errors: [{ description: 'nome e telefone privados aqui' }],
    }, 401);
    await expect(client.getPayment('pay_123456')).rejects.toBeInstanceOf(AsaasApiError);
    await expect(client.getPayment('pay_123456')).rejects.not.toThrow(/privados/);
  });
});
