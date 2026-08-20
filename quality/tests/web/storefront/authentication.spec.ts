import { expect, test } from '@playwright/test';

test(
  'rejeita autenticação com credenciais inválidas @smoke',
  {
    tag: ['@web'],
    annotation: [
      { type: 'risk', description: 'RISK-004' },
      { type: 'behavior', description: 'Rejeição de autenticação inválida' },
      { type: 'intent', description: 'Impede acesso à conta quando as credenciais não são válidas.' },
      { type: 'flow', description: 'Credencial inválida -> acesso rejeitado -> usuário permanece no login' },
      { type: 'validation', description: 'Mensagem de credenciais inválidas é exibida' },
      { type: 'validation', description: 'Usuário permanece na rota de login' }
    ]
  },
  async ({ page }, testInfo) => {
    await page.goto('/account/login');
    await page.getByPlaceholder('Email').fill('usuario.inexistente@example.test');
    await page.getByPlaceholder('Password').fill('senha-invalida');
    await page.getByRole('button', { name: 'Sign In' }).click();

    const rejectionMessage = page.getByText('Invalid email or password', { exact: true });
    await expect(rejectionMessage).toBeVisible();
    await expect(page).toHaveURL(/\/account\/login$/);

    await testInfo.attach('evidencia-negocio-rejeicao-autenticacao', {
      body: await rejectionMessage.locator('..').screenshot(),
      contentType: 'image/png'
    });
  }
);
