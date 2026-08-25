import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { CartPage } from '../../../src/pages/storefront/cart-page.js';
import { ProductPage } from '../../../src/pages/storefront/product-page.js';
import { attachHighlightedEvidence } from '../../../src/evidence/highlighted-screenshot.js';

interface ProductResponse {
  data: {
    uuid: string;
  };
}

test(
  'propaga alteração de preço do Admin para a Storefront @smoke',
  {
    tag: ['@web', '@admin', '@cross-domain'],
    annotation: [
      { type: 'risk', description: 'RISK-002' },
      { type: 'risk', description: 'RISK-013' },
      { type: 'behavior', description: 'Propagação de preço do Admin para a Storefront' },
      {
        type: 'intent',
        description: 'Comprova que uma alteração administrativa chega ao cliente e permanece correta no carrinho.'
      },
      {
        type: 'flow',
        description: 'Admin altera preço -> Storefront recebe alteração -> carrinho preserva o preço correto'
      },
      { type: 'validation', description: 'Admin aceita a alteração para o novo preço' },
      { type: 'validation', description: 'Storefront exibe o preço atualizado' },
      { type: 'validation', description: 'Carrinho calcula quantidade e subtotal com o preço atualizado' }
    ]
  },
  async ({ page }, testInfo) => {
    const adminEmail = process.env.E2E_ADMIN_EMAIL;
    const adminPassword = process.env.E2E_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      const missingCredentials = [
        !adminEmail && 'E2E_ADMIN_EMAIL',
        !adminPassword && 'E2E_ADMIN_PASSWORD'
      ].filter(Boolean);
      throw new Error(
        `Credenciais obrigatórias ausentes: ${missingCredentials.join(', ')}. ` +
          'Configure-as em quality/.env; use quality/.env.example como modelo.'
      );
    }

    const suffix = randomUUID().slice(0, 8);
    const sku = `THERMO-PREM-ESP-${suffix}`;
    const name = 'Garrafa Térmica Inox Premium - Edição Especial';
    const urlKey = `garrafa-termica-inox-premium-edicao-especial-${suffix}`;
    const initialPrice = 41.25;
    const updatedPrice = 42.5;
    let productId: string | undefined;

    await test.step('Estado inicial: autenticar no Admin e criar produto controlado', async () => {
      await page.goto('/admin/login');
      await page.getByPlaceholder('Email').fill(adminEmail);
      await page.getByPlaceholder('Password').fill(adminPassword);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await expect(page).toHaveURL(/\/admin$/);

      const createResponse = await page.request.post('/api/products', {
        data: {
          name,
          sku,
          url_key: urlKey,
          price: initialPrice,
          qty: 10,
          group_id: 1,
          category_id: 4,
          status: true,
          visibility: true,
          manage_stock: true,
          stock_availability: true,
          no_shipping_required: true,
          images: ['/assets/catalog/1287/3556/thermos-yellow.jpg']
        }
      });
      const createBody = (await createResponse.json()) as ProductResponse;
      expect(createResponse.ok(), JSON.stringify(createBody)).toBe(true);
      productId = createBody.data.uuid;
    });

    try {
      await test.step('Alteração administrativa: atualizar o preço pela API', async () => {
        const updateResponse = await page.request.patch(`/api/products/${productId}`, {
          data: { price: updatedPrice }
        });
        expect(updateResponse.ok()).toBe(true);

        await testInfo.attach('evidencia-admin-alteracao-preco', {
          body: Buffer.from(
            JSON.stringify(
              {
                operation: 'PATCH /api/products/{productId}',
                expected: `HTTP 2xx e preço administrativo ${updatedPrice.toFixed(2)}`,
                obtained: `HTTP ${updateResponse.status()} com alteração aceita`,
                businessRule: 'O Admin aceita a alteração que será observada pelo cliente.'
              },
              null,
              2
            )
          ),
          contentType: 'application/json'
        });
      });

      await test.step('Validação na Storefront: observar preço e cálculo atualizados', async () => {
        const product = new ProductPage(page);
        const cart = new CartPage(page);
        const storefrontPath = `/accessories/${urlKey}`;

        await expect
          .poll(
            async () => {
              await product.visit(storefrontPath);
              return product.heading.textContent();
            },
            {
              message: 'Aguardar o produto ficar visível na navegação da Storefront',
              timeout: 15_000,
              intervals: [250, 500, 1_000]
            }
          )
          .toBe(name);

        await expect(product.heading).toHaveText(name);
        await expect(product.price('$42.50')).toBeVisible();
        await product.setQuantity(2);
        await product.addToCart.click();
        const drawerItem = cart.drawer.getByRole('listitem').filter({ hasText: name });
        await expect(drawerItem).toContainText('2');
        await expect(drawerItem).toContainText('$85.00');
        await expect(cart.drawer.getByText('Subtotal:', { exact: true }).locator('..')).toContainText('$85.00');

        await attachHighlightedEvidence(page, testInfo, {
          name: 'evidencia-negocio-admin-storefront-carrinho',
          checkpoints: [
            { locator: drawerItem, label: 'Preço e quantidade propagados' },
            {
              locator: cart.drawer.getByText('Subtotal:', { exact: true }).locator('..'),
              label: 'Subtotal atualizado'
            }
          ]
        });
      });
    } finally {
      if (productId) {
        await test.step('Restauração: remover o produto controlado', async () => {
          const deleteResponse = await page.request.delete(`/api/products/${productId}`);
          expect(deleteResponse.ok()).toBe(true);
        });
      }
    }
  }
);
