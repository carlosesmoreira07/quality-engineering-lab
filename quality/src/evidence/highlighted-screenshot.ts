import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

interface EvidenceCheckpoint {
  locator: Locator;
  label: string;
}

interface HighlightedEvidenceOptions {
  name: string;
  checkpoints: EvidenceCheckpoint[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function attachHighlightedEvidence(
  page: Page,
  testInfo: TestInfo,
  { name, checkpoints }: HighlightedEvidenceOptions
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Viewport indisponível para gerar evidência visual.');

  const rectangles = [];
  for (const checkpoint of checkpoints) {
    await expect(checkpoint.locator).toBeVisible();
    const box = await checkpoint.locator.boundingBox();
    if (!box) throw new Error(`Checkpoint sem área visível: ${checkpoint.label}`);

    const padding = 6;
    const left = Math.max(2, box.x - padding);
    const top = Math.max(2, box.y - padding);
    const right = Math.min(viewport.width - 2, box.x + box.width + padding);
    const bottom = Math.min(viewport.height - 2, box.y + box.height + padding);
    rectangles.push({
      label: checkpoint.label,
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    });
  }

  // A captura original é feita somente depois das assertions e permanece inalterada em memória.
  const original = await page.screenshot({ type: 'png' });
  const evidencePage = await page.context().newPage();
  try {
    await evidencePage.setViewportSize(viewport);
    const overlays = rectangles
      .map(
        (rectangle) => `<div class="checkpoint" style="left:${rectangle.left}px;top:${rectangle.top}px;width:${rectangle.width}px;height:${rectangle.height}px">
          <span class="${rectangle.top < 28 ? 'inside' : ''}">${escapeHtml(rectangle.label)}</span>
        </div>`
      )
      .join('');

    await evidencePage.setContent(`<!doctype html>
      <html><head><meta charset="utf-8"><style>
        * { box-sizing: border-box; }
        html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #0b0f0d; }
        #evidence { position: relative; width: ${viewport.width}px; height: ${viewport.height}px; }
        #evidence > img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .checkpoint {
          position: absolute;
          border: 3px solid #57d98a;
          border-radius: 7px;
          box-shadow: 0 0 0 2px rgba(11, 15, 13, .72), 0 5px 18px rgba(11, 15, 13, .24);
          pointer-events: none;
        }
        .checkpoint span {
          position: absolute;
          left: -2px;
          bottom: calc(100% + 5px);
          max-width: 260px;
          padding: 5px 8px;
          color: #07110b;
          background: #9bf2ba;
          border: 1px solid #57d98a;
          border-radius: 4px;
          font: 700 12px/1.2 Inter, "Segoe UI", sans-serif;
          white-space: nowrap;
        }
        .checkpoint span.inside { top: 4px; bottom: auto; }
      </style></head><body>
        <div id="evidence">
          <img src="data:image/png;base64,${original.toString('base64')}" alt="Cópia da tela validada" />
          ${overlays}
        </div>
      </body></html>`, { waitUntil: 'load' });

    const annotatedCopy = await evidencePage.locator('#evidence').screenshot({ type: 'png' });
    await testInfo.attach(name, { body: annotatedCopy, contentType: 'image/png' });
  } finally {
    await evidencePage.close();
  }
}
