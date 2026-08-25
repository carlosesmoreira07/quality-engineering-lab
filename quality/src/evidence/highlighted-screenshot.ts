import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

interface EvidenceCheckpoint {
  locator: Locator;
  label: string;
  hideLabel?: boolean;
}

interface HighlightedEvidenceOptions {
  name: string;
  checkpoints: EvidenceCheckpoint[];
  outcome?: 'passed' | 'failed';
  focusOn?: Locator;
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
  { name, checkpoints, outcome = 'passed', focusOn }: HighlightedEvidenceOptions
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Viewport indisponível para gerar evidência visual.');

  const rectangles = [];
  for (const checkpoint of checkpoints) {
    await expect(checkpoint.locator).toBeVisible();
    const box = await checkpoint.locator.boundingBox();
    if (!box) throw new Error(`Checkpoint sem área visível: ${checkpoint.label}`);

    const paddingX = 12;
    const paddingY = 8;
    const left = Math.max(4, box.x - paddingX);
    const top = Math.max(4, box.y - paddingY);
    const right = Math.min(viewport.width - 4, box.x + box.width + paddingX);
    const bottom = Math.min(viewport.height - 4, box.y + box.height + paddingY);
    rectangles.push({
      label: checkpoint.label,
      hideLabel: checkpoint.hideLabel,
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      labelPosition: top >= 42 ? 'above' : bottom <= viewport.height - 42 ? 'below' : 'outside'
    });
  }

  let clip = { x: 0, y: 0, width: viewport.width, height: viewport.height };
  if (focusOn) {
    await expect(focusOn).toBeVisible();
    const focusBox = await focusOn.boundingBox();
    if (!focusBox) throw new Error('Área de foco indisponível para gerar evidência visual.');
    const width = Math.min(viewport.width, 880);
    const height = Math.min(viewport.height, 620);
    clip = {
      x: Math.max(0, Math.min(viewport.width - width, focusBox.x + focusBox.width / 2 - width / 2)),
      y: Math.max(0, Math.min(viewport.height - height, focusBox.y + focusBox.height / 2 - height / 2)),
      width,
      height
    };
    for (const rectangle of rectangles) {
      rectangle.left -= clip.x;
      rectangle.top -= clip.y;
    }
  }

  // A captura é feita somente depois das assertions; o foco recorta a cópia, sem alterar a página validada.
  const original = await page.screenshot({ type: 'png', clip });
  const evidencePage = await page.context().newPage();
  try {
    await evidencePage.setViewportSize({ width: clip.width, height: clip.height });
    const overlays = rectangles
      .map(
        (rectangle) => `<div class="checkpoint ${outcome}" style="left:${rectangle.left}px;top:${rectangle.top}px;width:${rectangle.width}px;height:${rectangle.height}px">
          ${rectangle.hideLabel ? '' : `<span class="${rectangle.labelPosition}">${escapeHtml(rectangle.label)}</span>`}
        </div>`
      )
      .join('');

    await evidencePage.setContent(`<!doctype html>
      <html><head><meta charset="utf-8"><style>
        * { box-sizing: border-box; }
        html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #0b0f0d; }
        #evidence { position: relative; width: ${clip.width}px; height: ${clip.height}px; }
        #evidence > img { display: block; width: 100%; height: 100%; object-fit: contain; }
        .checkpoint {
          position: absolute;
          border: 4px solid;
          border-radius: 7px;
          box-shadow: 0 0 0 2px rgba(11, 15, 13, .72), 0 5px 18px rgba(11, 15, 13, .24);
          pointer-events: none;
        }
        .checkpoint.passed { border-color: #28a745; }
        .checkpoint.failed { border-color: #d92d20; }
        .checkpoint span {
          position: absolute;
          left: -2px;
          max-width: 280px;
          padding: 5px 8px;
          color: #07110b;
          border: 1px solid;
          border-radius: 4px;
          font: 700 12px/1.2 Inter, "Segoe UI", sans-serif;
          white-space: nowrap;
        }
        .checkpoint.passed span { background: #baf4ce; border-color: #28a745; }
        .checkpoint.failed span { color: #4a0b08; background: #ffd2ce; border-color: #d92d20; }
        .checkpoint span.above { bottom: calc(100% + 7px); }
        .checkpoint span.below { top: calc(100% + 7px); }
        .checkpoint span.outside { left: calc(100% + 7px); top: 0; }
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
