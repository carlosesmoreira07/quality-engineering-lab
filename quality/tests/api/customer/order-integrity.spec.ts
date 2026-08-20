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
    tag: ['@api'],
    annotation: [
      { type: 'risk', description: 'RISK-006' },
      { type: 'risk', description: 'RISK-007' },
      { type: 'risk', description: 'RISK-010' }
    ]
  },
  async ({ request }) => {
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
  }
);
