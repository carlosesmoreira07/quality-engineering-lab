import { expect, test } from '@playwright/test';
import { baselineProduct } from '../../src/data/baseline.js';

interface ProductsQueryResponse {
  data?: {
    products?: {
      total: number;
      items: Array<{
        uuid: string;
        name: string;
        sku: string;
        urlKey: string;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

test(
  'mantém a Home disponível com conteúdo e navegação essenciais',
  {
    tag: ['@web', '@post-merge-smoke'],
    annotation: [
      { type: 'risk', description: 'RISK-001' },
      { type: 'behavior', description: 'Disponibilidade da Home e acesso ao catálogo' },
      { type: 'intent', description: 'Confirma a saúde básica da Storefront sem alterar estado.' }
    ]
  },
  async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Produtos em destaque' })).toBeVisible();
    await expect(page.locator('a[href="/accessories"]', { hasText: 'Ver catálogo' })).toBeVisible();
  }
);

test(
  'mantém catálogo e produto publicado disponíveis somente para leitura',
  {
    tag: ['@web', '@post-merge-smoke'],
    annotation: [
      { type: 'risk', description: 'RISK-001' },
      { type: 'risk', description: 'RISK-002' },
      { type: 'behavior', description: 'Disponibilidade do catálogo e dados essenciais do produto' },
      { type: 'intent', description: 'Valida catálogo, produto, preço e imagem sem criar carrinho.' }
    ]
  },
  async ({ page }) => {
    const catalogResponse = await page.goto('/accessories');

    expect(catalogResponse?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Accessories', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(baselineProduct.name) }).first()).toHaveAttribute(
      'href',
      baselineProduct.path
    );

    const productResponse = await page.goto(baselineProduct.path);

    expect(productResponse?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: baselineProduct.name })).toBeVisible();
    await expect(page.getByText(baselineProduct.formattedUnitPrice, { exact: true })).toBeVisible();
    const productImage = page.getByRole('img', { name: baselineProduct.name });
    await expect(productImage).toBeVisible();
    await expect.poll(() => productImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'ADD TO CART' })).toBeVisible();
  }
);

test(
  'mantém contrato mínimo da consulta pública de produtos',
  {
    tag: ['@api', '@post-merge-smoke'],
    annotation: [
      { type: 'risk', description: 'RISK-001' },
      { type: 'risk', description: 'RISK-002' },
      { type: 'behavior', description: 'Consulta pública read-only do catálogo' },
      { type: 'intent', description: 'Consulta produtos via GraphQL query sem executar mutation.' }
    ]
  },
  async ({ request }) => {
    // EverShop 2.2.1 receives storefront GraphQL operations in the request body;
    // this operation is a query only and cannot create, update or delete data.
    const response = await request.post('/api/graphql', {
      data: {
        query: 'query { products { total items { uuid name sku urlKey } } }'
      }
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const body = (await response.json()) as ProductsQueryResponse;
    expect(body.errors).toBeUndefined();
    expect(body.data?.products?.total).toBeGreaterThan(0);
    expect(body.data?.products?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uuid: expect.stringMatching(/^[0-9a-f-]{36}$/i),
          name: baselineProduct.name,
          sku: baselineProduct.sku,
          urlKey: 'stainless-steel-thermos-yellow'
        })
      ])
    );
  }
);

test(
  'mantém acesso administrativo anônimo bloqueado somente com leitura',
  {
    tag: ['@web', '@security', '@post-merge-smoke'],
    annotation: [
      { type: 'risk', description: 'RISK-016' },
      { type: 'behavior', description: 'Bloqueio read-only da fronteira administrativa' },
      { type: 'intent', description: 'Confirma o redirecionamento anônimo sem tentar mutações administrativas.' }
    ]
  },
  async ({ page, request }) => {
    const response = await request.get('/admin/orders', { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe('/admin/login');

    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  }
);
