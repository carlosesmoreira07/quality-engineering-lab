import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { attachHighlightedEvidence } from '../../../src/evidence/highlighted-screenshot.js';

interface ResourceResponse {
  data: {
    uuid: string;
  };
}

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';

test(
  'isola recursos entre clientes e bloqueia operações administrativas @security',
  {
    tag: ['@api', '@security'],
    annotation: [
      { type: 'risk', description: 'RISK-005' },
      { type: 'risk', description: 'RISK-016' },
      { type: 'behavior', description: 'Isolamento entre clientes e fronteira administrativa' },
      {
        type: 'intent',
        description: 'Impede que um cliente manipule recursos de outro ou execute operações administrativas.'
      },
      {
        type: 'flow',
        description: 'Cliente A cria recurso -> Cliente B tenta alterá-lo -> fronteiras horizontal e vertical rejeitam o acesso'
      },
      { type: 'validation', description: 'Cliente B não altera nem exclui o endereço sintético do Cliente A' },
      { type: 'validation', description: 'Cliente A mantém controle sobre o próprio recurso' },
      { type: 'validation', description: 'Cliente comum não consulta nem cancela pedidos administrativos' }
    ]
  },
  async ({ browser, page, playwright }, testInfo) => {
    const adminEmail = process.env.E2E_ADMIN_EMAIL;
    const adminPassword = process.env.E2E_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      throw new Error('E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD são obrigatórios para o cleanup de segurança.');
    }

    const runId = randomUUID();
    const disposablePassword = `Qel7-${randomUUID()}-Aa1!`;
    const customerA = {
      email: `qel7-a-${runId}@example.test`,
      password: disposablePassword,
      full_name: 'QEL Security Customer A'
    };
    const customerB = {
      email: `qel7-b-${runId}@example.test`,
      password: disposablePassword,
      full_name: 'QEL Security Customer B'
    };
    const adminContext = await browser.newContext({ baseURL });
    const adminPage = await adminContext.newPage();
    const customerAApi = await playwright.request.newContext({ baseURL });
    let customerAId: string | undefined;
    let customerBId: string | undefined;
    let addressId: string | undefined;

    try {
      await test.step('Preparação: criar identidades e recurso sintéticos controlados', async () => {
        await adminPage.goto('/admin/login');
        await adminPage.getByPlaceholder('Email').fill(adminEmail);
        await adminPage.getByPlaceholder('Password').fill(adminPassword);
        await adminPage.getByRole('button', { name: 'Sign In' }).click();
        await expect(adminPage).toHaveURL(/\/admin$/);

        const createA = await adminPage.request.post('/api/customers', { data: customerA });
        expect(createA.ok()).toBe(true);
        customerAId = ((await createA.json()) as ResourceResponse).data.uuid;

        const createB = await adminPage.request.post('/api/customers', { data: customerB });
        expect(createB.ok()).toBe(true);
        customerBId = ((await createB.json()) as ResourceResponse).data.uuid;

        const loginA = await customerAApi.post('/customer/login', {
          data: { email: customerA.email, password: customerA.password }
        });
        expect(loginA.ok()).toBe(true);

        const loginB = await page.request.post('/customer/login', {
          data: { email: customerB.email, password: customerB.password }
        });
        expect(loginB.ok()).toBe(true);

        const createAddress = await customerAApi.post('/api/customers/me/addresses', {
          data: {
            full_name: 'QEL Controlled Address',
            telephone: '0000000000',
            address_1: 'Synthetic Street 1',
            city: 'Control City',
            province: 'Control State',
            country: 'US',
            postcode: '00000'
          }
        });
        expect(createAddress.ok()).toBe(true);
        addressId = ((await createAddress.json()) as ResourceResponse).data.uuid;
      });

      const updateAttempt = await test.step('Autorização horizontal: Cliente B tenta alterar recurso do Cliente A', async () => {
        const response = await page.request.patch(`/api/customers/me/addresses/${addressId}`, {
          data: { city: 'Unauthorized Change' }
        });
        expect(response.status()).toBe(400);
        return response;
      });

      const deleteAttempt = await test.step('Autorização horizontal: Cliente B tenta excluir recurso do Cliente A', async () => {
        const response = await page.request.delete(`/api/customers/me/addresses/${addressId}`);
        expect(response.status()).toBe(400);
        return response;
      });

      const ownerUpdate = await test.step('Controle positivo: Cliente A mantém acesso ao próprio recurso', async () => {
        const response = await customerAApi.patch(`/api/customers/me/addresses/${addressId}`, {
          data: { city: 'Owner Controlled City' }
        });
        expect(response.ok()).toBe(true);
        return response;
      });

      const adminViewAttempt = await test.step('Autorização vertical: cliente comum tenta consultar pedidos administrativos', async () => {
        const response = await page.request.get('/admin/orders', { maxRedirects: 0 });
        expect(response.status()).toBe(302);
        expect(response.headers().location).toBe('/admin/login');
        return response;
      });

      const adminMutationAttempt = await test.step('Autorização vertical: cliente comum tenta cancelar pedido administrativamente', async () => {
        const response = await page.request.post(`/api/orders/${randomUUID()}/cancel`, { data: {} });
        expect(response.status()).toBe(401);
        return response;
      });

      await testInfo.attach('evidencia-seguranca-fronteiras-autorizacao', {
        body: Buffer.from(
          JSON.stringify(
            {
              risk: ['RISK-005', 'RISK-016'],
              attempts: [
                {
                  operation: 'PATCH /api/customers/me/addresses/{addressId}',
                  actor: 'Cliente B',
                  target: 'Recurso sintético do Cliente A',
                  expected: 'Alteração rejeitada por ownership',
                  obtained: `HTTP ${updateAttempt.status()}`
                },
                {
                  operation: 'DELETE /api/customers/me/addresses/{addressId}',
                  actor: 'Cliente B',
                  target: 'Recurso sintético do Cliente A',
                  expected: 'Exclusão rejeitada por ownership',
                  obtained: `HTTP ${deleteAttempt.status()}`
                },
                {
                  operation: 'GET /admin/orders e POST /api/orders/{id}/cancel',
                  actor: 'Cliente comum',
                  target: 'Fronteira administrativa de pedidos',
                  expected: 'Consulta redirecionada e mutação não autorizada',
                  obtained: `HTTP ${adminViewAttempt.status()} e HTTP ${adminMutationAttempt.status()}`
                }
              ],
              control: `Ownership preservado (controle positivo HTTP ${ownerUpdate.status()}) e autorização administrativa obrigatória.`,
              result: 'Acesso cruzado e elevação de privilégio rejeitados.',
              decision: 'Controles efetivos para os comportamentos exercitados.'
            },
            null,
            2
          )
        ),
        contentType: 'application/json'
      });
    } finally {
      if (addressId) {
        const deleteAddress = await customerAApi.delete(`/api/customers/me/addresses/${addressId}`);
        expect.soft(deleteAddress.ok(), 'Cleanup do endereço sintético').toBe(true);
      }
      for (const customerId of [customerAId, customerBId]) {
        if (customerId) {
          const deleteCustomer = await adminPage.request.delete(`/api/customers/${customerId}`);
          expect.soft(deleteCustomer.ok(), 'Cleanup do cliente sintético').toBe(true);
        }
      }
      await customerAApi.dispose();
      await adminContext.close();
    }
  }
);

test(
  'bloqueia acesso administrativo anônimo em Web e API @security',
  {
    tag: ['@web', '@api', '@security'],
    annotation: [
      { type: 'risk', description: 'RISK-016' },
      { type: 'behavior', description: 'Bloqueio da fronteira administrativa para usuário anônimo' },
      {
        type: 'intent',
        description: 'Comprova que páginas e operações administrativas de pedidos exigem autenticação privilegiada.'
      },
      {
        type: 'flow',
        description: 'Anônimo tenta consultar Admin -> acesso direcionado ao login -> mutação administrativa rejeitada'
      },
      { type: 'validation', description: 'Página de pedidos administrativos direciona ao login do Admin' },
      { type: 'validation', description: 'Cancelamento administrativo retorna HTTP 401' }
    ]
  },
  async ({ page, request }, testInfo) => {
    const adminPageAttempt = await request.get('/admin/orders', { maxRedirects: 0 });
    expect(adminPageAttempt.status()).toBe(302);
    expect(adminPageAttempt.headers().location).toBe('/admin/login');

    const adminMutationAttempt = await request.post(`/api/orders/${randomUUID()}/cancel`, { data: {} });
    expect(adminMutationAttempt.status()).toBe(401);

    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login$/);
    const adminLoginForm = page.getByRole('button', { name: 'Sign In' }).locator('xpath=ancestor::form');
    await expect(adminLoginForm).toBeVisible();

    await attachHighlightedEvidence(page, testInfo, {
      name: 'evidencia-negocio-bloqueio-admin-anonimo',
      checkpoints: [
        { locator: adminLoginForm, label: 'Acesso redirecionado ao login' }
      ]
    });
    await testInfo.attach('evidencia-api-bloqueio-admin-anonimo', {
      body: Buffer.from(
        JSON.stringify(
          {
            risk: 'RISK-016',
            attempt: 'Usuário anônimo consulta a página e tenta executar cancelamento administrativo.',
            control: 'Autenticação administrativa obrigatória nas fronteiras Web e API.',
            result: `Web HTTP ${adminPageAttempt.status()} para /admin/login; API HTTP ${adminMutationAttempt.status()}.`,
            decision: 'Acesso privilegiado bloqueado para usuário anônimo.'
          },
          null,
          2
        )
      ),
      contentType: 'application/json'
    });
  }
);
