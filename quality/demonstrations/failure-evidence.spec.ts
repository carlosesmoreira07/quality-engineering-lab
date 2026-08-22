import { expect, test } from '@playwright/test';
import { attachHighlightedEvidence } from '../src/evidence/highlighted-screenshot.js';

test('demonstra visualmente uma divergência detectada sem afetar a execução principal', async ({ page }, testInfo) => {
  await page.setContent(`<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; color: #172019; background: #f3f7f4; font: 18px/1.5 Inter, "Segoe UI", sans-serif; }
          header { height: 84px; padding: 22px 72px; color: #f5f7f4; background: #0b0f0d; }
          header b { color: #9bf2ba; letter-spacing: .08em; }
          main { width: 1120px; margin: 56px auto; padding: 44px; border: 1px solid #d8e2db; border-radius: 18px; background: white; }
          .context { color: #5d6b62; font-size: 16px; }
          .product { display: grid; grid-template-columns: 360px 1fr; gap: 52px; align-items: center; margin-top: 24px; }
          .image { height: 310px; display: grid; place-items: center; border-radius: 14px; color: #247647; background: #e6f6eb; font-size: 72px; }
          h1 { margin: 0 0 12px; font-size: 34px; }
          .expected { color: #5d6b62; }
          .price { display: inline-block; margin: 22px 0; padding: 10px 18px; border-radius: 8px; background: #fff3f1; font-size: 32px; font-weight: 750; }
          .note { max-width: 520px; padding: 14px 18px; border-left: 5px solid #d92d20; background: #fff7f6; }
        </style>
      </head>
      <body>
        <header><b>QUALITY ENGINEERING LAB</b> · Demonstração controlada</header>
        <main>
          <div class="context">Storefront de demonstração · nenhum dado do SUT foi criado ou alterado</div>
          <section class="product">
            <div class="image" aria-label="Imagem do produto">◫</div>
            <div>
              <h1>Produto de referência</h1>
              <div class="expected">Preço esperado pela regra de negócio: $35.00</div>
              <div class="price" data-testid="observed-price">$36.00</div>
              <div class="note">Divergência proposital inserida apenas nesta página local e efêmera.</div>
            </div>
          </section>
        </main>
      </body>
    </html>`);

  const observedPrice = page.getByTestId('observed-price');
  let divergenceDetected = false;
  try {
    await expect(observedPrice).toHaveText('$35.00', { timeout: 500 });
  } catch {
    divergenceDetected = true;
  }
  expect(divergenceDetected, 'A divergência controlada deve ser detectada').toBe(true);

  await attachHighlightedEvidence(page, testInfo, {
    name: 'evidencia-falha-controlada-preco',
    outcome: 'failed',
    checkpoints: [{ locator: observedPrice, label: 'Falha detectada: $36.00 observado' }]
  });
});
