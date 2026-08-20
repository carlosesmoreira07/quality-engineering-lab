import type { Locator, Page } from '@playwright/test';

export class ProductPage {
  readonly heading: Locator;
  readonly quantity: Locator;
  readonly addToCart: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1 });
    this.quantity = page.getByRole('spinbutton', { name: 'Quantity' });
    this.addToCart = page.getByRole('button', { name: 'Add to cart' });
  }

  async visit(path: string): Promise<void> {
    await this.page.goto(path);
  }

  price(value: string): Locator {
    return this.page.getByText(value, { exact: true }).first();
  }

  variant(value: string): Locator {
    return this.page.getByRole('button', { name: value, exact: true });
  }

  async selectVariant(value: string): Promise<void> {
    await this.variant(value).click();
  }

  async setQuantity(value: number): Promise<void> {
    await this.quantity.fill(String(value));
  }
}
