import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const qualityDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDir = path.resolve(qualityDir, '..');
const resultsPath = path.join(qualityDir, 'test-results', 'results.json');
const outputPath = path.join(repositoryDir, 'output', 'pdf', 'qel-4-test-evidence.pdf');

const riskCatalog = {
  'RISK-002': { priority: 4, label: 'Crítico', risk: 'Preço incorreto pode ser exibido ou propagado para a compra.', control: 'Preço é conferido na Storefront e no carrinho.' },
  'RISK-004': { priority: 4, label: 'Crítico', risk: 'Credenciais inválidas podem conceder ou manter acesso à conta.', control: 'Autenticação inválida é rejeitada e a sessão não é criada.' },
  'RISK-005': { priority: 4, label: 'Crítico', risk: 'Um cliente pode acessar ou alterar dados pertencentes a outro.', control: 'Ownership e isolamento entre clientes são exercitados por API.' },
  'RISK-006': { priority: 4, label: 'Crítico', risk: 'Produto, variante ou quantidade podem divergir da escolha do cliente.', control: 'Item, variante e quantidade são conferidos no carrinho.' },
  'RISK-007': { priority: 4, label: 'Crítico', risk: 'Subtotal ou total podem divergir dos itens e preços válidos.', control: 'Valores de linha e subtotal são recalculados e comparados.' },
  'RISK-010': { priority: 4, label: 'Crítico', risk: 'Pedido pode ser aceito sem os dados obrigatórios íntegros.', control: 'API rejeita pedido incompleto com contrato de erro válido.' },
  'RISK-013': { priority: 4, label: 'Crítico', risk: 'Preço administrativo pode não chegar corretamente à experiência de compra.', control: 'Alteração do Admin é observada na Storefront e no carrinho.' },
  'RISK-016': { priority: 3, label: 'Alto', risk: 'Usuário sem privilégio pode consultar ou alterar pedidos administrativos.', control: 'Fronteiras Web e API exigem autenticação administrativa.' },
  'RISK-018': { priority: 2, label: 'Médio', risk: 'Lentidão pode degradar catálogo e página de produto.', control: 'Smoke mede disponibilidade e latência da leitura de produto.' },
  'RISK-019': { priority: 4, label: 'Crítico', risk: 'Degradação pode impedir a compra ou gerar resultado transacional incerto.', control: 'Smoke verifica respostas e thresholds da jornada crítica exercitada.' }
};
const performanceRisks = ['RISK-019', 'RISK-018'];

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function annotationValues(test, type) {
  return (test.annotations ?? []).filter((annotation) => annotation.type === type).map((annotation) => annotation.description).filter(Boolean);
}

function flattenSuites(suites, collected = []) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const lastResult = test.results?.at(-1);
        collected.push({ title: spec.title, file: spec.file ?? suite.file ?? '', annotations: test.annotations ?? [], duration: lastResult?.duration ?? 0, passed: test.status === 'expected' && lastResult?.status === 'passed', attachments: lastResult?.attachments ?? [] });
      }
    }
    flattenSuites(suite.suites, collected);
  }
  return collected;
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return 'n/d';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`;
  return `${Math.floor(milliseconds / 60_000)} min ${Math.round((milliseconds % 60_000) / 1000)} s`;
}

function gitValue(...args) { return execFileSync('git', args, { cwd: repositoryDir, encoding: 'utf8' }).trim(); }
function resolveAttachmentPath(attachmentPath) { return !attachmentPath ? undefined : path.isAbsolute(attachmentPath) ? attachmentPath : path.resolve(qualityDir, attachmentPath); }

async function imageDataUrl(attachment) {
  if (attachment.body) return `data:${attachment.contentType};base64,${attachment.body}`;
  const attachmentPath = resolveAttachmentPath(attachment.path);
  if (!attachmentPath) return undefined;
  return `data:${attachment.contentType};base64,${(await readFile(attachmentPath)).toString('base64')}`;
}

async function jsonEvidence(attachment) {
  if (attachment.body) return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
  const attachmentPath = resolveAttachmentPath(attachment.path);
  return attachmentPath ? JSON.parse(await readFile(attachmentPath, 'utf8')) : undefined;
}

function suiteKey(test) { return test.file.replaceAll('\\', '/').includes('/security/') ? 'security' : 'functional'; }
function riskScore(test) { return Math.max(0, ...annotationValues(test, 'risk').map((riskId) => riskCatalog[riskId]?.priority ?? 0)); }
function scenarioOrder(test) {
  const behavior = annotationValues(test, 'behavior')[0] ?? test.title;
  if (behavior.includes('Propagação')) return 1;
  if (behavior.includes('Integridade do produto')) return 2;
  if (behavior.includes('Rejeição')) return 3;
  return 4;
}
function orderTests(tests) {
  return [...tests].sort((left, right) => {
    const suiteDifference = (suiteKey(left) === 'functional' ? 1 : 2) - (suiteKey(right) === 'functional' ? 1 : 2);
    return suiteDifference || riskScore(right) - riskScore(left) || scenarioOrder(left) - scenarioOrder(right);
  });
}

async function latestPerformanceSummary() {
  const entries = await readdir(qualityDir, { withFileTypes: true });
  let candidates = entries.filter((entry) => entry.isFile() && /^performance-smoke-.+-summary\.json$/.test(entry.name)).map((entry) => path.join(qualityDir, entry.name));
  if (process.env.GITHUB_RUN_ID) {
    const currentRun = candidates.filter((candidate) => path.basename(candidate).includes(process.env.GITHUB_RUN_ID));
    if (currentRun.length > 0) candidates = currentRun;
  }
  const dated = await Promise.all(candidates.map(async (candidate) => ({ candidate, modified: (await stat(candidate)).mtimeMs })));
  dated.sort((left, right) => right.modified - left.modified);
  if (!dated[0]) return undefined;
  const summary = JSON.parse(await readFile(dated[0].candidate, 'utf8'));
  const checks = Object.values(summary.root_group?.checks ?? {});
  const checkPasses = checks.reduce((sum, check) => sum + (check.passes ?? 0), 0);
  const checkFailures = checks.reduce((sum, check) => sum + (check.fails ?? 0), 0);
  const failedRequestRate = summary.metrics?.http_req_failed?.value ?? 1;
  return { passed: summary.qel?.passed ?? (checkFailures === 0 && failedRequestRate === 0), duration: summary.qel?.durationMs, checks, checkPasses, checkFailures, p95: summary.metrics?.http_req_duration?.['p(95)'], failedRequestRate, requests: summary.metrics?.http_reqs?.count ?? 0, iterations: summary.metrics?.iterations?.count ?? 0 };
}

function riskPills(risks) {
  return risks.map((riskId) => `<span class="risk-pill"><b>${escapeHtml(riskId)}</b>${escapeHtml(riskCatalog[riskId]?.label ?? '')}</span>`).join('');
}

function structuredEvidenceMarkup(evidence, index) {
  if (!evidence) return '';
  if (evidence.attempt && !evidence.operations && !evidence.attempts) {
    return `<section class="structured-card"><div class="structured-label">Evidência técnica ${index + 1}</div><h3>${escapeHtml(evidence.attempt)}</h3><dl><div><dt>Controle</dt><dd>${escapeHtml(evidence.control)}</dd></div><div><dt>Resultado</dt><dd>${escapeHtml(evidence.result)}</dd></div><div><dt>Decisão</dt><dd>${escapeHtml(evidence.decision)}</dd></div></dl></section>`;
  }
  const operations = evidence.operations ?? evidence.attempts ?? [evidence];
  return `<section class="structured-card"><div class="structured-label">Evidência técnica ${index + 1}</div>${operations.map((operation) => `<article class="operation"><h3>${escapeHtml(operation.endpoint ?? operation.operation ?? 'Checkpoint')}</h3>${operation.actor ? `<p><b>Ator:</b> ${escapeHtml(operation.actor)}</p>` : ''}<p><b>Esperado:</b> ${escapeHtml(operation.expected)}</p><p><b>Obtido:</b> ${escapeHtml(operation.obtained)}</p></article>`).join('')}</section>`;
}

function footer(page, totalPages, label) { return `<footer><span>${escapeHtml(label)}</span><span>Página ${page} de ${totalPages}</span></footer>`; }

async function testPage(test, pageNumber, totalPages, suitePosition, suiteTotal) {
  const behavior = annotationValues(test, 'behavior')[0] ?? test.title;
  const intent = annotationValues(test, 'intent')[0] ?? 'Controle automatizado associado ao cenário.';
  const flow = annotationValues(test, 'flow')[0] ?? 'Fluxo descrito no teste automatizado.';
  const validations = annotationValues(test, 'validation');
  const risks = annotationValues(test, 'risk');
  const suite = suiteKey(test);
  const businessImages = test.attachments.filter((attachment) => attachment.name.startsWith('evidencia-negocio-') && attachment.contentType === 'image/png');
  const structuredAttachments = test.attachments.filter((attachment) => attachment.name.startsWith('evidencia-') && attachment.contentType === 'application/json');
  const imageUrls = (await Promise.all(businessImages.map(imageDataUrl))).filter(Boolean);
  const structured = (await Promise.all(structuredAttachments.map(jsonEvidence))).filter(Boolean);
  const primaryRisk = [...risks].sort((left, right) => (riskCatalog[right]?.priority ?? 0) - (riskCatalog[left]?.priority ?? 0))[0];
  const suiteTitle = suite === 'functional' ? 'Testes funcionais e regressivos' : 'Testes de segurança';
  const evidenceCount = imageUrls.length + structured.length;
  return `<section class="page detail-page ${suite}"><header class="detail-header"><div><span class="suite-kicker">${escapeHtml(suiteTitle)}</span><small>Caso ${suitePosition} de ${suiteTotal}</small></div><div class="test-status ${test.passed ? 'pass' : 'fail'}"><b>${test.passed ? 'APROVADO' : 'REPROVADO'}</b><span>${formatDuration(test.duration)}</span></div></header><div class="detail-title"><div><h1>${escapeHtml(behavior)}</h1><div class="risk-pills">${riskPills(risks)}</div></div><span class="evidence-total">${evidenceCount} ${evidenceCount === 1 ? 'evidência' : 'evidências'}</span></div><div class="narrative-grid"><article><span>Risco de negócio</span><p>${escapeHtml(riskCatalog[primaryRisk]?.risk ?? 'Risco associado às anotações do cenário.')}</p></article><article><span>Controle</span><p>${escapeHtml(intent)}</p></article><article class="decision-card"><span>Decisão</span><p>${test.passed ? 'Controle efetivo para o comportamento exercitado.' : 'Controle não aprovado; evolução bloqueada para este comportamento.'}</p></article></div><div class="flow-strip"><div><b>Fluxo</b>${escapeHtml(flow)}</div><div><b>Checks</b>${escapeHtml(validations.join('; ') || 'Assertions descritas no teste.')}</div></div><div class="evidence-layout ${imageUrls.length > 0 ? 'with-image' : 'structured-only'}">${structured.length > 0 ? `<div class="structured-list">${structured.map(structuredEvidenceMarkup).join('')}</div>` : ''}${imageUrls.map((imageUrl) => `<figure><img src="${imageUrl}" alt="Evidência visual com checkpoint destacado"><figcaption>Cópia anotada após as assertions; a tela original não foi modificada.</figcaption></figure>`).join('')}${evidenceCount === 0 ? '<div class="empty-evidence">Sem attachment de negócio nesta execução. Consulte o HTML Reporter para diagnóstico técnico.</div>' : ''}</div>${footer(pageNumber, totalPages, `${suiteTitle} - risco → controle → evidência → decisão`)}</section>`;
}

function performancePage(performance, pageNumber, totalPages) {
  const passed = performance?.passed === true;
  const checks = performance?.checks ?? [];
  return `<section class="page detail-page performance"><header class="detail-header"><div><span class="suite-kicker">Testes não funcionais e performance</span><small>Perfil smoke controlado</small></div><div class="test-status ${passed ? 'pass' : 'fail'}"><b>${passed ? 'APROVADO' : 'REPROVADO'}</b><span>${formatDuration(performance?.duration)}</span></div></header><div class="detail-title"><div><h1>Disponibilidade e latência da jornada crítica</h1><div class="risk-pills">${riskPills(performanceRisks)}</div></div><span class="evidence-total">1 evidência k6</span></div><div class="narrative-grid"><article><span>Risco de negócio</span><p>Degradação pode comprometer descoberta, validação de pedido e confiança na compra.</p></article><article><span>Controle</span><p>Workload curto verifica disponibilidade, checks funcionais e thresholds objetivos de latência.</p></article><article class="decision-card"><span>Decisão</span><p>${passed ? 'Thresholds e checks atendidos no perfil smoke.' : 'Performance smoke ausente ou reprovado; barreira não aprovada.'}</p></article></div><div class="performance-metrics"><article><b>${performance?.p95 !== undefined ? `${performance.p95.toFixed(0)} ms` : 'n/d'}</b><span>latência p95</span></article><article><b>${((performance?.failedRequestRate ?? 1) * 100).toFixed(1)}%</b><span>requisições com erro</span></article><article><b>${performance?.requests ?? 0}</b><span>requisições</span></article><article><b>${performance?.iterations ?? 0}</b><span>iterações</span></article><article><b>${performance?.checkPasses ?? 0}/${(performance?.checkPasses ?? 0) + (performance?.checkFailures ?? 0)}</b><span>checks aprovados</span></article></div><section class="performance-checks"><h2>Checks executados</h2><div>${checks.map((check) => `<article><span class="check-dot ${check.fails === 0 ? 'pass' : 'fail'}"></span><p>${escapeHtml(check.name)}</p><b>${check.passes ?? 0} pass / ${check.fails ?? 0} fail</b></article>`).join('') || '<p>Summary k6 não encontrado para esta execução.</p>'}</div></section>${footer(pageNumber, totalPages, 'Performance - risco → workload → checks → thresholds → decisão')}</section>`;
}

function barriersPage(suites, pageNumber, totalPages) {
  const barrier = (index, title, purpose, signal, passed) => `<article class="barrier-card"><div class="barrier-number">${index}</div><div><span>${escapeHtml(title)}</span><h2>${escapeHtml(purpose)}</h2><p>${escapeHtml(signal)}</p></div><b class="barrier-status ${passed ? 'pass' : 'fail'}">${passed ? 'PASSA' : 'BLOQUEIA'}</b></article>`;
  return `<section class="page barriers-page"><div class="brand-line"></div><header class="barriers-header"><span>QUALITY ENGINEERING LAB</span><small>Modelo de proteção da mudança</small></header><h1>Barreiras da Qualidade</h1><p class="barriers-lead">Cada suíte reduz uma classe diferente de risco. A mudança só avança quando todas as barreiras obrigatórias permanecem verdes.</p><div class="barrier-flow">${barrier('01', 'Funcional e regressivo', 'Protege regras e jornadas de negócio', `${suites.functional.passed}/${suites.functional.total} testes; ${suites.functional.risks} riscos exercitados`, suites.functional.approved)}<div class="flow-arrow">↓</div>${barrier('02', 'Segurança', 'Protege identidade e fronteiras de autorização', `${suites.security.passed}/${suites.security.total} testes; acesso horizontal e vertical`, suites.security.approved)}<div class="flow-arrow">↓</div>${barrier('03', 'Performance', 'Protege disponibilidade e tempo de resposta', `p95 ${suites.performance.p95}; erro ${suites.performance.errorRate}`, suites.performance.approved)}<div class="flow-arrow">↓</div>${barrier('04', 'Evidências', 'Protege auditabilidade e decisão', 'HTML técnico, attachments e PDF executivo verificados', suites.evidence.approved)}</div><div class="blocking-rule"><span>Regra de bloqueio</span><p>Qualquer falha obrigatória deixa o workflow vermelho. Não há score, tolerância percentual ou aprovação por IA.</p></div>${footer(pageNumber, totalPages, 'Barreiras da Qualidade - sinal simples, determinístico e auditável')}</section>`;
}

const report = JSON.parse(await readFile(resultsPath, 'utf8'));
const tests = orderTests(flattenSuites(report.suites));
if (tests.length === 0) throw new Error(`Nenhum teste encontrado em ${resultsPath}`);
const performance = await latestPerformanceSummary();
const functionalTests = tests.filter((test) => suiteKey(test) === 'functional');
const securityTests = tests.filter((test) => suiteKey(test) === 'security');
const total = tests.length;
const passed = tests.filter((test) => test.passed).length;
const failures = total - passed;
const allApproved = failures === 0 && performance?.passed === true;
const riskIds = [...new Set([...tests.flatMap((test) => annotationValues(test, 'risk')), ...performanceRisks])].sort((left, right) => (riskCatalog[right]?.priority ?? 0) - (riskCatalog[left]?.priority ?? 0) || left.localeCompare(right));
const testDuration = report.stats?.duration ?? tests.reduce((sum, test) => sum + test.duration, 0);
const totalDuration = testDuration + (performance?.duration ?? 0);
const startedAt = report.stats?.startTime ? new Date(report.stats.startTime) : new Date();
const commit = gitValue('rev-parse', '--short', 'HEAD');
const evidenceCount = tests.reduce((count, test) => count + test.attachments.filter((attachment) => attachment.name.startsWith('evidencia-')).length, 0) + (performance ? 1 : 0);
const totalPages = 1 + tests.length + 1 + 1;
let pageNumber = 1;
const suiteStatus = {
  functional: { total: functionalTests.length, passed: functionalTests.filter((test) => test.passed).length, approved: functionalTests.length > 0 && functionalTests.every((test) => test.passed), risks: new Set(functionalTests.flatMap((test) => annotationValues(test, 'risk'))).size },
  security: { total: securityTests.length, passed: securityTests.filter((test) => test.passed).length, approved: securityTests.length > 0 && securityTests.every((test) => test.passed) },
  performance: { approved: performance?.passed === true, p95: performance?.p95 !== undefined ? `${performance.p95.toFixed(0)} ms` : 'n/d', errorRate: `${((performance?.failedRequestRate ?? 1) * 100).toFixed(1)}%` },
  evidence: { approved: evidenceCount > 0 }
};

const executivePage = `<section class="page executive-page"><div class="brand-line"></div><header class="executive-header"><div><span>QUALITY ENGINEERING LAB</span><h1>Quality Report</h1><p>Decisão executiva baseada em riscos e evidências reais</p></div><div class="report-meta"><b>Commit ${escapeHtml(commit)}</b><span>EverShop 2.2.1</span><span>${escapeHtml(startedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</span></div></header><div class="executive-summary"><article class="gate-card ${allApproved ? 'pass' : 'fail'}"><span>QUALITY GATE</span><strong>${allApproved ? 'APROVADO' : 'REPROVADO'}</strong><p>${allApproved ? 'Controles obrigatórios aprovados para o escopo exercitado.' : 'Há barreira obrigatória reprovada ou sem evidência.'}</p></article><div class="metric-grid"><article><b>${passed}/${total}</b><span>testes aprovados</span></article><article><b>${riskIds.length}</b><span>riscos exercitados</span></article><article><b>${failures}</b><span>falhas</span></article><article><b>${formatDuration(totalDuration)}</b><span>duração observada</span></article></div></div><div class="suite-summary"><article><span>01</span><div><b>Funcional e regressivo</b><p>${suiteStatus.functional.passed}/${suiteStatus.functional.total} controles aprovados</p></div><i class="${suiteStatus.functional.approved ? 'pass' : 'fail'}"></i></article><article><span>02</span><div><b>Segurança</b><p>${suiteStatus.security.passed}/${suiteStatus.security.total} controles aprovados</p></div><i class="${suiteStatus.security.approved ? 'pass' : 'fail'}"></i></article><article><span>03</span><div><b>Performance</b><p>p95 ${suiteStatus.performance.p95}; erro ${suiteStatus.performance.errorRate}</p></div><i class="${suiteStatus.performance.approved ? 'pass' : 'fail'}"></i></article></div><div class="executive-insight"><article><span>Sinal para decisão</span><h2>${allApproved ? 'Baseline saudável no escopo validado' : 'Correção necessária antes de evoluir'}</h2><p>O resultado combina comportamento de negócio, autorização, performance e presença de evidências auditáveis. O HTML Reporter mantém detalhes técnicos, traces e attachments.</p></article><article><span>Cobertura de risco</span><div class="executive-risks">${riskPills(riskIds)}</div><p>${evidenceCount} evidências derivadas desta execução. Quantidades, duração, cobertura e decisão são calculadas a partir dos resultados.</p></article></div><p class="residual-risk"><b>Risco residual:</b> esta execução não representa pentest nem cobertura integral do produto. Frete, pagamento e cancelamento completos permanecem fora do escopo atual.</p>${footer(pageNumber++, totalPages, 'Visão executiva para Produto, Tecnologia e Liderança')}</section>`;

const detailPages = [];
for (const test of tests) {
  const suiteTests = suiteKey(test) === 'functional' ? functionalTests : securityTests;
  detailPages.push(await testPage(test, pageNumber++, totalPages, suiteTests.indexOf(test) + 1, suiteTests.length));
}
const performanceMarkup = performancePage(performance, pageNumber++, totalPages);
const barriersMarkup = barriersPage(suiteStatus, pageNumber++, totalPages);

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Quality Report</title><style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}:root{--ink:#f5f7f4;--muted:#a7b0aa;--dim:#75807a;--canvas:#0b0f0d;--surface:#111713;--surface-2:#171f1a;--line:#28312b;--mint:#9bf2ba;--mint-strong:#57d98a;--amber:#f6c56f;--red:#ff8279;--paper:#f3f7f4;--paper-line:#d8e2db;--paper-text:#172019;--paper-muted:#66736b}html,body{margin:0;padding:0;color:var(--paper-text);background:white;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.page{width:297mm;height:210mm;padding:11mm 14mm 10mm;position:relative;overflow:hidden;break-after:page;background:var(--paper)}.page:last-child{break-after:auto}.brand-line{width:28mm;height:2mm;margin-bottom:5mm;background:var(--mint-strong)}footer{position:absolute;left:14mm;right:14mm;bottom:5mm;display:flex;justify-content:space-between;padding-top:2mm;border-top:1px solid currentColor;opacity:.62;font-size:7pt}.executive-page{color:var(--ink);background:var(--canvas)}.executive-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6mm}.executive-header span,.barriers-header span{color:var(--mint);font:750 7pt/1 ui-monospace,Consolas,monospace;letter-spacing:.14em}.executive-header h1{margin:2mm 0 1mm;font-size:28pt;line-height:1;letter-spacing:-1pt}.executive-header p{margin:0;color:var(--muted);font-size:10pt}.report-meta{display:grid;gap:1mm;text-align:right;color:var(--muted);font-size:8pt}.report-meta b{color:var(--ink)}.executive-summary{display:grid;grid-template-columns:72mm 1fr;gap:5mm;margin-bottom:5mm}.gate-card{height:42mm;padding:5mm;border:1px solid var(--line);border-radius:3mm;display:flex;flex-direction:column;justify-content:center;background:var(--surface)}.gate-card.pass{border-left:2mm solid var(--mint-strong)}.gate-card.fail{border-left:2mm solid var(--red)}.gate-card span{color:var(--muted);font-size:7pt;letter-spacing:.13em}.gate-card strong{display:block;max-width:100%;margin:2mm 0;color:var(--ink);font-size:22pt;line-height:1;white-space:nowrap;letter-spacing:-.5pt}.gate-card p{margin:0;color:var(--muted);font-size:7.5pt;line-height:1.35}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm}.metric-grid article{min-height:42mm;padding:3mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;border:1px solid var(--line);border-radius:3mm;background:var(--surface)}.metric-grid b{color:var(--ink);font-size:18pt;line-height:1}.metric-grid span{margin-top:2mm;color:var(--muted);font-size:7pt;text-transform:uppercase;letter-spacing:.05em}.suite-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-bottom:5mm}.suite-summary article{display:grid;grid-template-columns:10mm 1fr 4mm;gap:2mm;align-items:center;min-height:20mm;padding:3mm;border:1px solid var(--line);border-radius:2.5mm;background:var(--surface-2)}.suite-summary article>span{color:var(--mint);font:700 9pt/1 ui-monospace,monospace}.suite-summary b{font-size:8.5pt}.suite-summary p{margin:1mm 0 0;color:var(--muted);font-size:7pt}i.pass,i.fail{width:3mm;height:3mm;border-radius:50%}i.pass{background:var(--mint-strong);box-shadow:0 0 0 1mm rgba(87,217,138,.14)}i.fail{background:var(--red)}.executive-insight{display:grid;grid-template-columns:1.05fr .95fr;gap:4mm}.executive-insight article{min-height:48mm;padding:4mm;border:1px solid var(--line);border-radius:3mm;background:var(--surface)}.executive-insight span{color:var(--mint);font:700 7pt/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em}.executive-insight h2{margin:3mm 0 2mm;color:var(--ink);font-size:17pt;line-height:1.1}.executive-insight p{color:var(--muted);font-size:8pt;line-height:1.5}.executive-risks{display:flex;flex-wrap:wrap;gap:1.5mm;margin:3mm 0}.risk-pill{display:inline-flex;gap:1.5mm;align-items:center;padding:1.2mm 2.2mm;border-radius:999px;color:#1f5d37;background:#e6f6eb;font-size:7pt}.risk-pill b{color:#0c5c30}.executive-page .risk-pill{color:#b8c2bc;background:#1d2921}.executive-page .risk-pill b{color:var(--mint)}.residual-risk{margin:3mm 0 0;color:var(--dim);font-size:6.8pt}.detail-page{background:#f6f8f6}.detail-page:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3mm;background:var(--mint-strong)}.detail-page.security:before{background:var(--amber)}.detail-page.performance:before{background:#8ab7ff}.detail-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4mm}.detail-header>div:first-child{display:grid;gap:1.5mm}.suite-kicker{color:#247647;font:750 7pt/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}.security .suite-kicker{color:#8a5d12}.performance .suite-kicker{color:#315f9c}.detail-header small{color:var(--paper-muted);font-size:7pt}.test-status{min-width:31mm;padding:2.2mm 3mm;border-radius:2mm;text-align:center}.test-status.pass{color:#17663a;background:#ddf4e5}.test-status.fail{color:#902923;background:#fde4e1}.test-status b{display:block;font-size:8pt}.test-status span{display:block;margin-top:.5mm;font-size:6.5pt}.detail-title{display:flex;justify-content:space-between;gap:5mm;align-items:flex-start;margin-bottom:4mm}.detail-title h1{max-width:220mm;margin:0 0 2mm;font-size:23pt;line-height:1.05;letter-spacing:-.5pt}.risk-pills{display:flex;gap:1.5mm;flex-wrap:wrap}.evidence-total{color:var(--paper-muted);font-size:7pt;white-space:nowrap}.narrative-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-bottom:3mm}.narrative-grid article{min-height:28mm;padding:3mm;border:1px solid var(--paper-line);border-radius:2.5mm;background:white}.narrative-grid span{color:#247647;font:750 6.5pt/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase}.narrative-grid p{margin:2mm 0 0;font-size:8pt;line-height:1.42}.decision-card{border-left:1.2mm solid var(--mint-strong)!important}.flow-strip{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-bottom:3mm;padding:2.5mm 3mm;border-radius:2mm;color:#3e4b43;background:#e9efeb;font-size:7pt;line-height:1.35}.flow-strip div{display:grid;grid-template-columns:13mm 1fr;gap:2mm}.flow-strip b{color:#172019}.evidence-layout{height:91mm;display:grid;gap:3mm;overflow:hidden}.evidence-layout.with-image{grid-template-rows:auto 1fr}.evidence-layout.with-image:not(:has(.structured-list)){grid-template-rows:1fr}.evidence-layout figure{min-height:0;margin:0;padding:2.5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid var(--paper-line);border-radius:2.5mm;background:white;overflow:hidden}.evidence-layout figure img{max-width:100%;max-height:72mm;object-fit:contain;border:1px solid #d6ded8;box-shadow:0 4mm 9mm rgba(18,35,24,.12)}.evidence-layout figure figcaption{margin-top:1.8mm;color:var(--paper-muted);font-size:6.5pt}.structured-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(75mm,1fr));gap:3mm}.structured-card{padding:3mm;border:1px solid var(--paper-line);border-radius:2.5mm;background:white}.structured-label{color:#247647;font:750 6.5pt/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}.structured-card h3{margin:2mm 0 1mm;font-size:9pt;line-height:1.2}.structured-card dl{margin:0;display:grid;gap:1mm}.structured-card dl div{display:grid;grid-template-columns:18mm 1fr;gap:2mm}.structured-card dt{color:var(--paper-muted);font-size:6.8pt}.structured-card dd{margin:0;font-size:7.2pt;line-height:1.3}.operation{padding:1.7mm 0;border-top:1px solid var(--paper-line)}.operation:first-of-type{border-top:0}.operation h3{margin:0 0 1mm;color:#172019;font-size:8pt}.operation p{margin:.5mm 0;font-size:7pt;line-height:1.3}.empty-evidence{display:grid;place-items:center;color:var(--paper-muted);border:1px dashed var(--paper-line);border-radius:3mm;background:white}.performance-metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:3mm;margin:5mm 0}.performance-metrics article{min-height:35mm;padding:3mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border:1px solid var(--paper-line);border-radius:3mm;background:white}.performance-metrics b{font-size:19pt}.performance-metrics span{margin-top:2mm;color:var(--paper-muted);font-size:7pt;text-transform:uppercase}.performance-checks{padding:4mm;border:1px solid var(--paper-line);border-radius:3mm;background:white}.performance-checks h2{margin:0 0 3mm;font-size:13pt}.performance-checks>div{display:grid;grid-template-columns:1fr 1fr;gap:2mm 5mm}.performance-checks article{display:grid;grid-template-columns:4mm 1fr auto;gap:2mm;align-items:center;padding:2mm;border-bottom:1px solid #edf1ee}.performance-checks p{margin:0;font-size:8pt}.performance-checks b{color:var(--paper-muted);font-size:7pt}.check-dot{width:2.5mm;height:2.5mm;border-radius:50%}.check-dot.pass{background:var(--mint-strong)}.check-dot.fail{background:var(--red)}.barriers-page{color:var(--ink);background:var(--canvas)}.barriers-header{display:flex;justify-content:space-between;color:var(--muted);font-size:8pt}.barriers-page>h1{margin:7mm 0 2mm;font-size:28pt}.barriers-lead{max-width:190mm;margin:0 0 5mm;color:var(--muted);font-size:10pt;line-height:1.45}.barrier-flow{display:grid;gap:1.5mm}.barrier-card{min-height:25mm;padding:3mm 4mm;display:grid;grid-template-columns:13mm 1fr 28mm;gap:3mm;align-items:center;border:1px solid var(--line);border-radius:3mm;background:var(--surface)}.barrier-number{color:var(--mint);font:700 12pt/1 ui-monospace,monospace}.barrier-card span{color:var(--mint);font:700 6.5pt/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em}.barrier-card h2{margin:1mm 0;color:var(--ink);font-size:12pt}.barrier-card p{margin:0;color:var(--muted);font-size:7.5pt}.barrier-status{padding:2mm;border-radius:2mm;text-align:center;font-size:7pt}.barrier-status.pass{color:#0b3c21;background:var(--mint)}.barrier-status.fail{color:#4b100c;background:var(--red)}.flow-arrow{height:4mm;color:var(--mint-strong);text-align:center;font-size:11pt;line-height:4mm}.blocking-rule{margin-top:4mm;padding:3.5mm 4mm;display:grid;grid-template-columns:38mm 1fr;align-items:center;border-left:2mm solid var(--amber);background:var(--surface-2)}.blocking-rule span{color:var(--amber);font:700 7pt/1 ui-monospace,monospace;text-transform:uppercase}.blocking-rule p{margin:0;color:var(--muted);font-size:8pt}
.detail-page .evidence-layout{height:78mm}.detail-page .evidence-layout figure img{max-height:62mm}.detail-page .evidence-layout.with-image:has(.structured-list) figure img{max-height:46mm}
</style></head><body>${executivePage}${detailPages.join('')}${performanceMarkup}${barriersMarkup}</body></html>`;

await mkdir(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: outputPath, printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
} finally { await browser.close(); }

console.log(`Quality Report gerado: ${outputPath}`);
console.log(`Gate: ${allApproved ? 'APROVADO' : 'REPROVADO'} | Testes: ${passed}/${total} | Evidências: ${evidenceCount} | Páginas: ${totalPages}`);
