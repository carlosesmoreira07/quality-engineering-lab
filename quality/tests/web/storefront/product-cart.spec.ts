import { expect, test } from '@playwright/test';
import { baselineProduct } from '../../../src/data/baseline.js';
import { CartPage } from '../../../src/pages/storefront/cart-page.js';
import { ProductPage } from '../../../src/pages/storefront/product-page.js';
import { attachHighlightedEvidence } from '../../../src/evidence/highlighted-screenshot.js';

test(
  'preserva preço, quantidade e cálculo do produto no carrinho @smoke',
  {
    tag: ['@web'],
    annotation: [
      { type: 'risk', description: 'RISK-002' },
      { type: 'risk', description: 'RISK-006' },
      { type: 'risk', description: 'RISK-007' },
      { type: 'behavior', description: 'Integridade do produto no carrinho' },
      {
        type: 'intent',
        description: 'Garante que seleção, quantidade, preço e subtotal permaneçam corretos no carrinho.'
      },
      {
        type: 'flow',
        description: 'Produto configurado -> item adicionado -> carrinho preserva seleção e valores'
      },
      { type: 'validation', description: 'Produto, SKU, variante e quantidade correspondem à seleção' },
      { type: 'validation', description: 'Preço da linha e subtotal correspondem a duas unidades' }
    ]
  },
  async ({ page }, testInfo) => {
    const product = new ProductPage(page);
    const cart = new CartPage(page);

    await product.visit(baselineProduct.path);
    await expect(product.heading).toHaveText(baselineProduct.name);
    await expect(product.price(baselineProduct.formattedUnitPrice)).toBeVisible();

    await product.selectVariant(baselineProduct.color);
    await expect(product.variant(baselineProduct.color).locator('..')).toHaveClass(/selected/);
    await product.setQuantity(2);
    await product.addToCart.click();

    await expect(cart.drawer).toBeVisible();
    const drawerItem = cart.drawer.getByRole('listitem').filter({ hasText: baselineProduct.name });
    await expect(drawerItem).toContainText('2');
    await expect(drawerItem).toContainText(`Color: ${baselineProduct.color}`);
    await expect(drawerItem).toContainText('$70.00');
    await expect(cart.drawer.getByText('Subtotal:', { exact: true }).locator('..')).toContainText('$70.00');

    await cart.openFullCart();
    await expect(page).toHaveURL(/\/cart$/);
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: baselineProduct.name })).toBeVisible();
    await expect(main).toContainText(`SKU ${baselineProduct.sku}`);
    await expect(main.getByText('2', { exact: true })).toBeVisible();
    await expect(main.getByText('Sub total', { exact: true }).locator('..')).toContainText('$70.00');
    await expect(main.getByText('$70.00', { exact: true }).last()).toBeVisible();

    await attachHighlightedEvidence(page, testInfo, {
      name: 'evidencia-negocio-integridade-carrinho',
      checkpoints: [
        { locator: main.getByRole('link', { name: baselineProduct.name }), label: 'Produto e variante' },
        { locator: main.getByText('2', { exact: true }), label: 'Quantidade' },
        { locator: main.getByText('Sub total', { exact: true }).locator('..'), label: 'Subtotal validado' }
      ]
    });
  }
);
