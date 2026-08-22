import { expect, test } from '@playwright/test';
import { baselineProduct } from '../../../src/data/baseline.js';

interface CartResponse {
  data: {
    cartId: string;
    items: Array<{
      product_sku: string;
      product_name: string;
      qty: number;
      product_price: number;
      final_price: number;
      line_total: number;
      errors: Record<string, unknown>;
    }>;
  };
}

test(
  'mantém a integridade dos valores e rejeita pedido incompleto @smoke',
  {
    tag: ['@api', '@post-merge-smoke'],
    annotation: [
      { type: 'risk', description: 'RISK-006' },
      { type: 'risk', description: 'RISK-007' },
      { type: 'risk', description: 'RISK-010' },
      { type: 'behavior', description: 'Integridade do carrinho e bloqueio de pedido incompleto' },
      {
        type: 'intent',
        description: 'Protege valores do item e impede a criação de pedido sem dados obrigatórios.'
      },
      {
        type: 'flow',
        description: 'Carrinho criado -> valores conferidos -> pedido incompleto rejeitado'
      },
      { type: 'validation', description: 'Produto, quantidade, preço e total da linha permanecem íntegros' },
      { type: 'validation', description: 'Pedido incompleto retorna HTTP 400 com mensagem de erro' }
    ]
  },
  async ({ request }, testInfo) => {
    const cartResponse = await request.post('/api/carts', {
      data: { items: [{ sku: baselineProduct.sku, qty: 2 }] }
    });

    expect(cartResponse.ok()).toBe(true);
    const cart = (await cartResponse.json()) as CartResponse;
    expect(cart.data.items).toHaveLength(1);
    expect(cart.data.items[0]).toMatchObject({
      product_sku: baselineProduct.sku,
      product_name: baselineProduct.name,
      qty: 2,
      product_price: baselineProduct.unitPrice,
      final_price: baselineProduct.unitPrice,
      line_total: baselineProduct.unitPrice * 2,
      errors: {}
    });

    const orderResponse = await request.post('/api/orders', {
      data: { cart_id: cart.data.cartId }
    });
    expect(orderResponse.ok()).toBe(false);
    expect(orderResponse.status()).toBe(400);
    const error = (await orderResponse.json()) as { error?: { message?: string } };
    expect(error.error?.message).toBeTruthy();

    await testInfo.attach('evidencia-api-integridade-pedido', {
      body: Buffer.from(
        JSON.stringify(
          {
            operations: [
              {
                endpoint: 'POST /api/carts',
                expected: 'HTTP 2xx e valores do item preservados',
                obtained: `HTTP ${cartResponse.status()} com quantidade 2 e total da linha ${baselineProduct.unitPrice * 2}`
              },
              {
                endpoint: 'POST /api/orders',
                expected: 'HTTP 400 para pedido sem dados obrigatórios',
                obtained: `HTTP ${orderResponse.status()} com mensagem de erro`
              }
            ],
            businessRule: 'Valores do carrinho são íntegros e pedido incompleto não é aceito.'
          },
          null,
          2
        )
      ),
      contentType: 'application/json'
    });
  }
);
