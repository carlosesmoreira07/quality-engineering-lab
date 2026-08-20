import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const qualityDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDir = path.resolve(qualityDir, '..');
const resultsPath = path.join(qualityDir, 'test-results', 'results.json');
const outputPath = path.join(repositoryDir, 'output', 'pdf', 'qel-4-test-evidence.pdf');

const riskControls = {
  'RISK-002': 'Preço permanece consistente entre catálogo, Storefront e carrinho.',
  'RISK-004': 'Credenciais inválidas não concedem acesso à conta.',
  'RISK-006': 'Produto, quantidade e valores permanecem íntegros no carrinho.',
  'RISK-007': 'Subtotal e total são calculados corretamente.',
  'RISK-010': 'Pedido incompleto é rejeitado pela API.',
  'RISK-013': 'Alteração administrativa é propagada até a experiência do cliente.'
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function annotationValues(test, type) {
  return (test.annotations ?? [])
    .filter((annotation) => annotation.type === type)
    .map((annotation) => annotation.description)
    .filter(Boolean);
}

function flattenSuites(suites, collected = []) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const lastResult = test.results?.at(-1);
        const passed = test.status === 'expected' && lastResult?.status === 'passed';
        collected.push({
          title: spec.title,
          file: spec.file ?? suite.file ?? '',
          annotations: test.annotations ?? [],
          duration: lastResult?.duration ?? 0,
          passed,
          status: lastResult?.status ?? test.status ?? 'unknown',
          attachments: lastResult?.attachments ?? []
        });
      }
    }
    flattenSuites(suite.suites, collected);
  }
  return collected;
}

function formatDuration(milliseconds) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function gitValue(...args) {
  return execFileSync('git', args, { cwd: repositoryDir, encoding: 'utf8' }).trim();
}

function resolveAttachmentPath(attachmentPath) {
  if (!attachmentPath) return undefined;
  return path.isAbsolute(attachmentPath)
    ? attachmentPath
    : path.resolve(qualityDir, attachmentPath);
}

async function imageDataUrl(attachment) {
  if (attachment.body) return `data:${attachment.contentType};base64,${attachment.body}`;
  const attachmentPath = resolveAttachmentPath(attachment.path);
  if (!attachmentPath) return undefined;
  const body = await readFile(attachmentPath);
  return `data:${attachment.contentType};base64,${body.toString('base64')}`;
}

async function jsonEvidence(attachment) {
  if (attachment.body) return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
  const attachmentPath = resolveAttachmentPath(attachment.path);
  if (!attachmentPath) return undefined;
  return JSON.parse(await readFile(attachmentPath, 'utf8'));
}

function scenarioOrder(test) {
  const behavior = annotationValues(test, 'behavior')[0] ?? test.title;
  if (behavior.includes('Propagação')) return 1;
  if (behavior.includes('Integridade do produto')) return 2;
  if (behavior.includes('Rejeição')) return 3;
  return 4;
}

function riskTableRows(tests, riskIds) {
  return riskIds
    .map((riskId) => {
      const associatedTests = tests.filter((test) => annotationValues(test, 'risk').includes(riskId));
      const controlled = associatedTests.length > 0 && associatedTests.every((test) => test.passed);
      return `<tr>
        <td class="risk-id">${escapeHtml(riskId)}</td>
        <td>${escapeHtml(riskControls[riskId] ?? 'Controle funcional associado à execução.')}</td>
        <td class="risk-result ${controlled ? 'controlled' : 'failed'}">${controlled ? 'Controlado' : 'Não controlado'}</td>
      </tr>`;
    })
    .join('');
}

function structuredEvidenceMarkup(evidence) {
  if (!evidence) return '';
  const operations = evidence.operations ?? [evidence];
  return `<div class="structured-evidence">
    ${operations
      .map(
        (operation) => `<div class="operation">
          <strong>${escapeHtml(operation.endpoint ?? operation.operation)}</strong>
          <span>Esperado: ${escapeHtml(operation.expected)}</span>
          <span>Obtido: ${escapeHtml(operation.obtained)}</span>
        </div>`
      )
      .join('')}
  </div>`;
}

async function scenarioCard(test) {
  const behavior = annotationValues(test, 'behavior')[0] ?? test.title;
  const intent = annotationValues(test, 'intent')[0] ?? '';
  const flow = annotationValues(test, 'flow')[0] ?? '';
  const validations = annotationValues(test, 'validation');
  const risks = annotationValues(test, 'risk');
  const businessImages = test.attachments.filter(
    (attachment) =>
      attachment.name.startsWith('evidencia-negocio-') && attachment.contentType === 'image/png'
  );
  const structuredAttachments = test.attachments.filter(
    (attachment) =>
      (attachment.name.startsWith('evidencia-api-') || attachment.name.startsWith('evidencia-admin-')) &&
      attachment.contentType === 'application/json'
  );
  const imageUrls = (await Promise.all(businessImages.map(imageDataUrl))).filter(Boolean);
  const structured = (await Promise.all(structuredAttachments.map(jsonEvidence))).filter(Boolean);
  const hasEvidence = imageUrls.length > 0 || structured.length > 0;

  return `<article class="scenario-card">
    <header>
      <div>
        <h3>${escapeHtml(behavior)}</h3>
        <div class="risk-list">${risks.map((risk) => `<span>${escapeHtml(risk)}</span>`).join('')}</div>
      </div>
      <div class="scenario-result ${test.passed ? 'pass' : 'fail'}">
        <strong>${test.passed ? 'PASS' : 'FAIL'}</strong>
        <span>${formatDuration(test.duration)}</span>
      </div>
    </header>
    <p><b>Intenção:</b> ${escapeHtml(intent)}</p>
    <p><b>Fluxo:</b> ${escapeHtml(flow)}</p>
    <div class="evidence-grid ${imageUrls.length > 0 && structured.length > 0 ? 'split' : ''}">
      ${structured.map(structuredEvidenceMarkup).join('')}
      ${imageUrls
        .map(
          (imageUrl) => `<figure>
            <img src="${imageUrl}" alt="Evidência do checkpoint de negócio" />
          </figure>`
        )
        .join('')}
      ${hasEvidence ? '' : '<div class="no-evidence">Sem evidência de negócio disponível nesta execução.</div>'}
    </div>
    <p class="validations"><b>Validações:</b> ${validations.map(escapeHtml).join('; ')}</p>
  </article>`;
}

const report = JSON.parse(await readFile(resultsPath, 'utf8'));
const tests = flattenSuites(report.suites).sort((left, right) => scenarioOrder(left) - scenarioOrder(right));
if (tests.length === 0) throw new Error(`Nenhum teste encontrado em ${resultsPath}`);

const total = tests.length;
const passed = tests.filter((test) => test.passed).length;
const failures = tests.filter((test) => !test.passed).length;
const allApproved = failures === 0 && passed === total;
const riskIds = [...new Set(tests.flatMap((test) => annotationValues(test, 'risk')))].sort();
const duration = report.stats?.duration ?? tests.reduce((sum, test) => sum + test.duration, 0);
const startedAt = report.stats?.startTime ? new Date(report.stats.startTime) : new Date();
const commit = gitValue('rev-parse', '--short', 'HEAD');
const scenarioCards = await Promise.all(tests.map(scenarioCard));

const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>QEL-4 Quality Summary</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    :root {
      --navy: #0b172a;
      --navy-2: #152945;
      --text: #172033;
      --muted: #627083;
      --line: #d8e1e8;
      --soft: #f5f8fa;
      --green: #127451;
      --green-bg: #e7f8f1;
      --red: #a32d2d;
      --red-bg: #fdecec;
      --cyan: #16758a;
    }
    html, body { margin: 0; padding: 0; background: white; color: var(--text); font-family: "Segoe UI", Arial, sans-serif; }
    .page {
      width: 297mm;
      height: 210mm;
      padding: 11mm 13mm 9mm;
      position: relative;
      overflow: hidden;
      break-after: page;
      background: white;
    }
    .page:last-child { break-after: auto; }
    .topline { height: 2.2mm; width: 28mm; background: #24bfd0; margin-bottom: 4mm; }
    .identity { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 5mm; }
    .identity h1 { margin: 0; color: var(--navy); font-size: 23pt; line-height: 1; letter-spacing: -0.4pt; }
    .identity p { margin: 2mm 0 0; color: var(--muted); font-size: 8.5pt; }
    .meta { text-align: right; font-size: 8pt; color: var(--muted); line-height: 1.55; }
    .summary-grid { display: grid; grid-template-columns: 54mm 1fr; gap: 7mm; margin-bottom: 3.5mm; }
    .gate {
      min-height: 38mm;
      border-radius: 3mm;
      padding: 6mm;
      color: white;
      background: ${allApproved ? 'var(--navy)' : '#611f1f'};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .gate small { font-size: 7.5pt; letter-spacing: 1.1pt; color: #bcd3df; }
    .gate strong { font-size: 25pt; line-height: 1; }
    .gate span { font-size: 8pt; color: #dcebf1; }
    .gate-metrics { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--line); border-radius: 3mm; overflow: hidden; }
    .metric { padding: 3.5mm 3mm; background: var(--soft); border-right: 1px solid var(--line); text-align: center; }
    .metric:last-child { border-right: 0; }
    .metric strong { display: block; color: var(--navy); font-size: 18pt; line-height: 1; }
    .metric span { display: block; margin-top: 2mm; color: var(--muted); font-size: 7.2pt; text-transform: uppercase; letter-spacing: .3pt; }
    h2 { color: var(--navy); font-size: 14pt; margin: 0 0 2.5mm; }
    .objective { display: grid; grid-template-columns: 35mm 1fr; gap: 4mm; align-items: start; border-left: 2px solid #24bfd0; padding: 1.5mm 0 1.5mm 4mm; margin-bottom: 3mm; }
    .objective h2 { margin: 0; }
    .objective p { margin: 0; font-size: 9pt; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; font-size: 8pt; }
    th { background: var(--navy-2); color: white; text-align: left; padding: 2.3mm 3mm; }
    td { border: 1px solid var(--line); padding: 1.7mm 3mm; vertical-align: middle; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .risk-id { width: 28mm; font-weight: 700; color: var(--navy); }
    .risk-result { width: 31mm; text-align: center; font-weight: 700; }
    .risk-result.controlled { color: var(--green); background: var(--green-bg) !important; }
    .risk-result.failed { color: var(--red); background: var(--red-bg) !important; }
    .decision { margin-top: 3mm; display: grid; grid-template-columns: 45mm 1fr; gap: 4mm; align-items: center; padding: 3mm 4mm; border-radius: 2.5mm; background: ${allApproved ? 'var(--green-bg)' : 'var(--red-bg)'}; }
    .decision strong { color: ${allApproved ? 'var(--green)' : 'var(--red)'}; font-size: 12pt; }
    .decision span { font-size: 8.5pt; line-height: 1.4; }
    .residual { margin: 2mm 0 0; font-size: 6.8pt; color: var(--muted); }
    .page-title { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4mm; }
    .page-title h2 { font-size: 19pt; margin: 0; }
    .page-title p { margin: 1.5mm 0 0; font-size: 8pt; color: var(--muted); }
    .evidence-count { font-size: 8pt; color: var(--muted); text-align: right; }
    .scenario-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 80mm 80mm; gap: 5mm; }
    .scenario-card { border: 1px solid var(--line); border-radius: 2.5mm; padding: 4mm; overflow: hidden; background: white; }
    .scenario-card header { display: flex; justify-content: space-between; gap: 4mm; align-items: flex-start; margin-bottom: 2mm; }
    .scenario-card h3 { margin: 0 0 1.2mm; font-size: 11pt; line-height: 1.15; color: var(--navy); }
    .risk-list { display: flex; gap: 1.2mm; flex-wrap: wrap; }
    .risk-list span { background: #edf4f7; color: var(--cyan); border-radius: 8px; padding: .7mm 1.8mm; font-size: 6.5pt; font-weight: 600; }
    .scenario-result { min-width: 21mm; text-align: center; border-radius: 2mm; padding: 1.7mm 2mm; }
    .scenario-result.pass { background: var(--green-bg); color: var(--green); }
    .scenario-result.fail { background: var(--red-bg); color: var(--red); }
    .scenario-result strong { display: block; font-size: 9pt; }
    .scenario-result span { display: block; font-size: 6.5pt; margin-top: .5mm; }
    .scenario-card p { margin: 1.2mm 0; font-size: 7.3pt; line-height: 1.3; }
    .evidence-grid { height: 34mm; margin: 2mm 0; display: grid; place-items: center; overflow: hidden; background: var(--soft); border-radius: 1.5mm; border: 1px solid #e5ebef; }
    .evidence-grid.split { grid-template-columns: .9fr 1.1fr; gap: 2mm; padding: 1.5mm; }
    figure { margin: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
    figure img { max-width: 100%; max-height: 32mm; object-fit: contain; display: block; }
    .structured-evidence { width: 100%; padding: 1.8mm 2mm; display: grid; gap: 1.3mm; }
    .operation { display: grid; grid-template-columns: 1fr; gap: .4mm; font-size: 6.2pt; line-height: 1.2; }
    .operation strong { color: var(--navy); }
    .operation span { color: var(--muted); }
    .no-evidence { color: var(--muted); font-size: 7pt; }
    .validations { color: var(--muted); font-size: 6.6pt !important; line-height: 1.2 !important; }
    .footer { position: absolute; left: 13mm; right: 13mm; bottom: 4.5mm; display: flex; justify-content: space-between; border-top: 1px solid var(--line); padding-top: 1.5mm; color: var(--muted); font-size: 6.5pt; }
  </style>
</head>
<body>
  <section class="page">
    <div class="topline"></div>
    <div class="identity">
      <div>
        <h1>QUALITY SUMMARY</h1>
        <p>QEL-4 - Fundação de automação funcional Web e API</p>
      </div>
      <div class="meta">
        <b>Commit:</b> ${escapeHtml(commit)}<br />
        <b>SUT:</b> EverShop 2.2.1<br />
        <b>Execução:</b> ${escapeHtml(startedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}
      </div>
    </div>
    <div class="summary-grid">
      <div class="gate">
        <small>QUALITY GATE</small>
        <strong>${allApproved ? 'APROVADO' : 'REPROVADO'}</strong>
        <span>${allApproved ? 'Execução atende ao escopo de riscos do QEL-4.' : 'Execução possui cenários não aprovados.'}</span>
      </div>
      <div class="gate-metrics">
        <div class="metric"><strong>${passed}/${total}</strong><span>testes aprovados</span></div>
        <div class="metric"><strong>${riskIds.length}</strong><span>riscos cobertos</span></div>
        <div class="metric"><strong>${failures}</strong><span>falhas</span></div>
        <div class="metric"><strong>${formatDuration(duration)}</strong><span>duração</span></div>
      </div>
    </div>
    <div class="objective">
      <h2>Objetivo</h2>
      <p>Validar os controles prioritários de preço, autenticação, integridade do carrinho, cálculo, bloqueio de pedido incompleto e propagação Admin -> Storefront, cobrindo ${escapeHtml(riskIds.join(', '))}.</p>
    </div>
    <h2>Cobertura por risco</h2>
    <table>
      <thead><tr><th>Risco</th><th>Controle comprovado</th><th>Resultado</th></tr></thead>
      <tbody>${riskTableRows(tests, riskIds)}</tbody>
    </table>
    <div class="decision">
      <strong>${allApproved ? 'Aprovado para evolução' : 'Evolução bloqueada'}</strong>
      <span>${allApproved ? 'Todos os cenários e riscos deste escopo foram aprovados; não há bloqueio conhecido para a continuidade do laboratório.' : 'Existem cenários não aprovados. Corrigir as falhas e executar novamente antes de seguir.'}</span>
    </div>
    <p class="residual"><b>Risco residual:</b> esta execução não representa cobertura total do produto. Fluxos completos de frete/pagamento/cancelamento, segurança e performance permanecem planejados para cards posteriores.</p>
    <div class="footer"><span>QEL-4 | Quality Summary orientado a risco</span><span>Página 1 de 2</span></div>
  </section>
  <section class="page">
    <div class="topline"></div>
    <div class="page-title">
      <div>
        <h2>Cenários e evidências principais</h2>
        <p>Intenção -> fluxo de negócio -> resultado -> checkpoint associado ao teste</p>
      </div>
      <div class="evidence-count">${tests.reduce((count, test) => count + test.attachments.filter((attachment) => attachment.name.startsWith('evidencia-')).length, 0)} attachments de negócio</div>
    </div>
    <div class="scenario-grid">${scenarioCards.join('')}</div>
    <div class="footer"><span>Detalhes de Engenharia permanecem no HTML Reporter nativo</span><span>Página 2 de 2</span></div>
  </section>
</body>
</html>`;

await mkdir(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: outputPath,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
} finally {
  await browser.close();
}

console.log(`Quality Summary gerado: ${outputPath}`);
console.log(`Gate: ${allApproved ? 'APROVADO' : 'REPROVADO'} | Testes: ${passed}/${total} | Falhas: ${failures}`);
