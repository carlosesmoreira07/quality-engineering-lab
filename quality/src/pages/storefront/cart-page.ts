import type { Locator, Page } from '@playwright/test';

export class CartPage {
  readonly drawer: Locator;

  constructor(page: Page) {
    this.drawer = page.getByRole('dialog', { name: 'Your Cart' });
  }

  async openFullCart(): Promise<void> {
    await this.drawer.getByRole('button', { name: 'View Cart' }).click();
  }
}
