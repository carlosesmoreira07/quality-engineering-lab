import { expect, test } from '@playwright/test';

test(
  'rejeita autenticação com credenciais inválidas @smoke',
  {
    tag: ['@web'],
    annotation: [{ type: 'risk', description: 'RISK-004' }]
  },
  async ({ page }) => {
    await page.goto('/account/login');
    await page.getByPlaceholder('Email').fill('usuario.inexistente@example.test');
    await page.getByPlaceholder('Password').fill('senha-invalida');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Invalid email or password', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/account\/login$/);
  }
);
