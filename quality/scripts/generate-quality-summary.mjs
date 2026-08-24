import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const qualityDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDir = path.resolve(qualityDir, '..');
const resultsPath = path.join(qualityDir, 'test-results', 'results.json');
const outputPath = path.join(repositoryDir, 'output', 'pdf', 'qel-4-test-evidence.pdf');
const riskStrategyPath = path.join(repositoryDir, 'docs', 'quality-strategy.md');
const priorityValues = { Baixo: 1, Médio: 2, Alto: 3, Crítico: 4 };

function parseRiskCatalog(strategy) {
  const risks = {};
  for (const line of strategy.split(/\r?\n/)) {
    if (!/^\|\s*RISK-\d{3}\s*\|/.test(line)) continue;
    const [id, name, category, journey, risk, impact, probability, severity, control] = line
      .split('|').slice(1, -1).map((value) => value.trim());
    if (!id || !name || !severity || !priorityValues[severity]) throw new Error(`Linha de risco inválida: ${line}`);
    if (risks[id]) throw new Error(`Risco duplicado em ${riskStrategyPath}: ${id}`);
    risks[id] = { id, name, category, journey, risk, impact, probability, severity, priority: priorityValues[severity], control };
  }
  if (Object.keys(risks).length === 0) throw new Error(`Matriz de riscos não encontrada em ${riskStrategyPath}`);
  return risks;
}

const riskCatalog = parseRiskCatalog(await readFile(riskStrategyPath, 'utf8'));
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
        collected.push({ title: spec.title, file: spec.file ?? suite.file ?? '', tags: spec.tags ?? [], annotations: test.annotations ?? [], duration: lastResult?.duration ?? 0, passed: test.status === 'expected' && lastResult?.status === 'passed', attachments: lastResult?.attachments ?? [] });
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
function resolveAttachmentPath(value) { return !value ? undefined : path.isAbsolute(value) ? value : path.resolve(qualityDir, value); }

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

function suiteKey(test) {
  const normalizedFile = test.file.replaceAll('\\', '/');
  const behavior = annotationValues(test, 'behavior').join(' ');
  if (normalizedFile.includes('/security/') || (annotationValues(test, 'risk').includes('RISK-016') && /bloqueio|fronteira/i.test(behavior))) return 'security';
  return 'functional';
}

function riskScore(test) { return Math.max(0, ...annotationValues(test, 'risk').map((id) => riskCatalog[id]?.priority ?? 0)); }
function orderTests(tests) {
  return [...tests].sort((left, right) => {
    const suiteDifference = (suiteKey(left) === 'functional' ? 1 : 2) - (suiteKey(right) === 'functional' ? 1 : 2);
    return suiteDifference || riskScore(right) - riskScore(left) || left.title.localeCompare(right.title, 'pt-BR');
  });
}

async function canonicalPerformanceSummary() {
  const profile = process.env.PERF_PROFILE || 'smoke';
  const runId = process.env.GITHUB_RUN_ID;

  const entries = await readdir(qualityDir, { withFileTypes: true });
  let candidates = entries
    .filter((entry) => entry.isFile() && /^performance-(smoke|average-load|traffic-variation|post-merge-smoke)-.+-summary\.json$/.test(entry.name))
    .map((entry) => path.join(qualityDir, entry.name));

  if (runId) {
    // Contexto CI: filtra pelo run atual E pelo perfil exato — determinístico
    const exact = candidates.filter((candidate) => {
      const name = path.basename(candidate);
      return name.includes(runId) && name.startsWith(`performance-${profile}-`);
    });
    if (exact.length === 0) {
      console.warn(`[Quality Report] Nenhum summary encontrado para perfil="${profile}" run_id="${runId}".`);
      return undefined;
    }
    candidates = exact;
  } else {
    // Execução local: prefere smoke; avisa se usar outro perfil
    const smokeFiles = candidates.filter((c) => path.basename(c).startsWith('performance-smoke-'));
    if (smokeFiles.length > 0) {
      if (profile !== 'smoke') {
        console.warn(`[Quality Report] Execução local: usando smoke como referência (PERF_PROFILE="${profile}" ignorado sem GITHUB_RUN_ID).`);
      }
      candidates = smokeFiles;
    } else {
      console.warn('[Quality Report] Nenhum summary de smoke encontrado localmente; usando o mais recente disponível.');
    }
  }

  const dated = await Promise.all(candidates.map(async (candidate) => ({ candidate, modified: (await stat(candidate)).mtimeMs })));
  dated.sort((left, right) => right.modified - left.modified);
  if (!dated[0]) return undefined;

  const summary = JSON.parse(await readFile(dated[0].candidate, 'utf8'));
  const checks = Object.values(summary.root_group?.checks ?? {});
  const checkPasses = checks.reduce((sum, check) => sum + (check.passes ?? 0), 0);
  const checkFailures = checks.reduce((sum, check) => sum + (check.fails ?? 0), 0);
  const failedRequestRate = summary.metrics?.http_req_failed?.value ?? 1;
  return {
    passed: summary.qel?.passed ?? (checkFailures === 0 && failedRequestRate === 0),
    profile: summary.qel?.profile ?? profile,
    label: summary.qel?.label ?? 'Saúde rápida',
    businessQuestion: summary.qel?.businessQuestion ?? 'A jornada crítica continua disponível e sem regressão grosseira?',
    duration: summary.qel?.durationMs,
    checks,
    checkPasses,
    checkFailures,
    p95: summary.metrics?.http_req_duration?.['p(95)'],
    failedRequestRate,
    requests: summary.metrics?.http_reqs?.count ?? 0,
    iterations: summary.metrics?.iterations?.count ?? 0
  };
}

function riskPills(risks, { executive = false } = {}) {
  return risks.map((id) => {
    const risk = riskCatalog[id];
    if (!risk) throw new Error(`Risco ${id} não existe na matriz ${riskStrategyPath}`);
    return `<span class="risk-pill"><strong>${escapeHtml(risk.name)}</strong>${executive ? '' : `<small>${escapeHtml(risk.category)} · ${escapeHtml(risk.id)} · ${escapeHtml(risk.severity)}</small>`}</span>`;
  }).join('');
}

function structuredEvidenceMarkup(evidence) {
  if (evidence.attempt && !evidence.operations && !evidence.attempts) {
    return `<article class="technical-evidence"><h3>${escapeHtml(evidence.attempt)}</h3><dl><div><dt>Controle</dt><dd>${escapeHtml(evidence.control)}</dd></div><div><dt>Resultado observado</dt><dd>${escapeHtml(evidence.result)}</dd></div><div><dt>Decisão</dt><dd>${escapeHtml(evidence.decision)}</dd></div></dl></article>`;
  }
  const operations = evidence.operations ?? evidence.attempts ?? [evidence];
  return `<div class="operations">${operations.map((operation) => `<article><h3>${escapeHtml(operation.endpoint ?? operation.operation ?? 'Validação técnica')}</h3>${operation.actor ? `<p><b>Contexto:</b> ${escapeHtml(operation.actor)}</p>` : ''}<p><b>Esperado:</b> ${escapeHtml(operation.expected)}</p><p><b>Observado:</b> ${escapeHtml(operation.obtained)}</p></article>`).join('')}</div>${evidence.control ? `<p class="technical-conclusion"><b>Controle:</b> ${escapeHtml(evidence.control)}</p>` : ''}${evidence.decision ? `<p class="technical-conclusion"><b>Decisão:</b> ${escapeHtml(evidence.decision)}</p>` : ''}`;
}

async function evidenceItems(test) {
  const items = [];
  for (const attachment of test.attachments) {
    if (!attachment.name.startsWith('evidencia-')) continue;
    if (attachment.contentType === 'image/png') {
      const dataUrl = await imageDataUrl(attachment);
      if (dataUrl) items.push({ type: 'image', name: attachment.name, dataUrl });
    } else if (attachment.contentType === 'application/json') {
      const evidence = await jsonEvidence(attachment);
      if (evidence) items.push({ type: 'json', name: attachment.name, evidence });
    }
  }
  return items;
}

function footer(page, totalPages, label) { return `<footer><span>${escapeHtml(label)}</span><span>Página ${page} de ${totalPages}</span></footer>`; }

function testSummaryPage(test, pageNumber, totalPages, suitePosition, suiteTotal, evidenceTotal) {
  const behavior = annotationValues(test, 'behavior')[0] ?? test.title;
  const intent = annotationValues(test, 'intent')[0] ?? 'Controle automatizado associado ao cenário.';
  const flow = annotationValues(test, 'flow')[0] ?? 'Execução do controle automatizado e confirmação do resultado.';
  const validations = annotationValues(test, 'validation');
  const risks = annotationValues(test, 'risk');
  const suite = suiteKey(test);
  const primaryRisk = [...risks].sort((left, right) => (riskCatalog[right]?.priority ?? 0) - (riskCatalog[left]?.priority ?? 0))[0];
  const suiteTitle = suite === 'functional' ? 'Testes funcionais e regressivos' : 'Testes de segurança';
  return `<section class="page detail-page ${suite}"><header class="section-header"><div><span>${escapeHtml(suiteTitle)}</span><p>Caso ${suitePosition} de ${suiteTotal} · visão da validação</p></div><div class="status ${test.passed ? 'pass' : 'fail'}"><b>${test.passed ? 'APROVADO' : 'REPROVADO'}</b><small>${formatDuration(test.duration)}</small></div></header><h1>${escapeHtml(behavior)}</h1><div class="risk-pills">${riskPills(risks)}</div><div class="story-grid"><article><h3>Risco de negócio</h3><p>${escapeHtml(riskCatalog[primaryRisk]?.risk ?? 'Risco associado ao cenário.')}</p></article><article><h3>Controle aplicado</h3><p>${escapeHtml(intent)}</p></article><article class="decision"><h3>Decisão</h3><p>${test.passed ? 'O comportamento exercitado está protegido pelo controle e pode avançar.' : 'A mudança deve ser bloqueada até que o comportamento seja corrigido.'}</p></article></div><div class="verification-grid"><article><h3>Fluxo exercitado</h3><p>${escapeHtml(flow)}</p></article><article><h3>Validações decisivas</h3><ul>${validations.map((validation) => `<li>${escapeHtml(validation)}</li>`).join('') || '<li>Resultado esperado confirmado pelo cenário automatizado.</li>'}</ul></article></div><div class="evidence-callout"><b>${evidenceTotal} ${evidenceTotal === 1 ? 'evidência útil acompanha' : 'evidências úteis acompanham'} este caso</b><span>A próxima página apresenta a prova produzida após a validação.</span></div>${footer(pageNumber, totalPages, `${suiteTitle} · risco → controle → evidência → decisão`)}</section>`;
}

function evidencePage(test, item, pageNumber, totalPages, evidencePosition, evidenceTotal) {
  const behavior = annotationValues(test, 'behavior')[0] ?? test.title;
  const suite = suiteKey(test);
  const suiteTitle = suite === 'functional' ? 'Evidência funcional' : 'Evidência de segurança';
  const evidenceMarkup = item.type === 'image'
    ? `<figure class="visual-proof"><img src="${item.dataUrl}" alt="Tela completa com o checkpoint validado destacado"><figcaption>A captura preserva o contexto da aplicação. O retângulo verde destaca somente o checkpoint aprovado; a tela original permaneceu inalterada.</figcaption></figure>`
    : `<section class="api-proof"><div class="technical-label">Evidência técnica legível</div>${structuredEvidenceMarkup(item.evidence)}</section>`;
  return `<section class="page evidence-page ${suite}"><header class="section-header"><div><span>${suiteTitle}</span><p>${escapeHtml(behavior)}</p></div><div class="status ${test.passed ? 'pass' : 'fail'}"><b>${test.passed ? 'APROVADO' : 'REPROVADO'}</b><small>Evidência ${evidencePosition} de ${evidenceTotal}</small></div></header><h1>Prova da validação</h1>${evidenceMarkup}${footer(pageNumber, totalPages, 'Evidência produzida pela execução · leitura em zoom 100%')}</section>`;
}

function performancePage(performance, pageNumber, totalPages) {
  const passed = performance?.passed === true;
  const verifications = performance?.checks ?? [];
  const totalVerifications = (performance?.checkPasses ?? 0) + (performance?.checkFailures ?? 0);
  const profileLabel = escapeHtml(performance?.label ?? 'Saúde rápida');
  const businessQuestion = escapeHtml(performance?.businessQuestion ?? 'A jornada crítica continua disponível e sem regressão grosseira?');
  return `<section class="page detail-page performance"><header class="section-header"><div><span>Testes não funcionais e performance</span><p>${profileLabel} · ${businessQuestion}</p></div><div class="status ${passed ? 'pass' : 'fail'}"><b>${passed ? 'APROVADO' : 'REPROVADO'}</b><small>${formatDuration(performance?.duration)}</small></div></header><h1>Disponibilidade e tempo de resposta da jornada de descoberta</h1><div class="risk-pills">${riskPills(performanceRisks)}</div><div class="story-grid"><article><h3>Risco de negócio</h3><p>Degradação pode comprometer descoberta, visualização do produto e confiança na compra.</p></article><article><h3>Perfil executado</h3><p>${businessQuestion}</p></article><article class="decision"><h3>Sinal para decisão</h3><p>${passed ? 'Disponibilidade e tempo de resposta permaneceram dentro da referência do laboratório.' : 'O sinal de performance está ausente ou reprovado; a mudança deve ser bloqueada.'}</p></article></div><div class="performance-metrics"><article><b>${performance?.p95 !== undefined ? `${performance.p95.toFixed(0)} ms` : 'n/d'}</b><span>tempo de resposta observado (p95)</span></article><article><b>${((performance?.failedRequestRate ?? 1) * 100).toFixed(1)}%</b><span>indisponibilidade observada</span></article><article><b>${performance?.requests ?? 0}</b><span>respostas observadas</span></article><article><b>${performance?.checkPasses ?? 0}/${totalVerifications}</b><span>verificações aprovadas</span></article></div><section class="verification-list"><h2>Resultados que sustentam a decisão</h2><div>${verifications.map((check) => `<article><i class="${check.fails === 0 ? 'pass' : 'fail'}"></i><p>${escapeHtml(check.name)}</p><b>${check.passes ?? 0} aprovadas · ${check.fails ?? 0} falhas</b></article>`).join('') || '<p>Resultado de performance não encontrado para esta execução.</p>'}</div></section>${footer(pageNumber, totalPages, `Performance · ${profileLabel} · risco → perfil → resultado → decisão`)}</section>`;
}

function overviewPage(suites, riskIds, pageNumber, totalPages) {
  return `<section class="page overview-page"><div class="brand-line"></div><header><span>QUALITY ENGINEERING LAB</span><p>Da decisão executiva às evidências</p></header><h1>Como esta versão foi avaliada</h1><p class="lead">O relatório começa pela decisão, organiza os controles por área e apresenta uma prova legível para cada caso. A conclusão consolida os sinais antes de mostrar onde as barreiras atuam no ciclo.</p><div class="area-grid"><article><b>01</b><h2>Funcional e regressivo</h2><p>Protege jornadas e regras de negócio percebidas pelo cliente.</p><strong>${suites.functional.passed}/${suites.functional.total} aprovados</strong></article><article><b>02</b><h2>Segurança</h2><p>Protege identidade, isolamento e fronteiras administrativas.</p><strong>${suites.security.passed}/${suites.security.total} aprovados</strong></article><article><b>03</b><h2>Performance</h2><p>Observa disponibilidade e tempo de resposta da jornada crítica.</p><strong>${suites.performance.approved ? 'Sinal aprovado' : 'Sinal reprovado'}</strong></article></div><section class="coverage"><h2>Cobertura orientada ao negócio</h2><div>${riskPills(riskIds, { executive: true })}</div></section>${footer(pageNumber, totalPages, 'Contexto → áreas de validação → evidências → conclusão')}</section>`;
}

function conclusionPage(suites, allApproved, evidenceCount, pageNumber, totalPages) {
  return `<section class="page conclusion-page"><div class="brand-line"></div><header><span>QUALITY ENGINEERING LAB</span><p>Conclusão</p></header><h1>${allApproved ? 'Os sinais sustentam a evolução da versão' : 'A versão precisa de correção antes de avançar'}</h1><p class="lead">A decisão combina comportamento, segurança, performance e evidências auditáveis. Nenhuma área isolada substitui as demais.</p><div class="conclusion-grid"><article><h2>Comportamento de negócio</h2><strong>${suites.functional.passed}/${suites.functional.total}</strong><p>controles funcionais e regressivos aprovados</p></article><article><h2>Fronteiras de confiança</h2><strong>${suites.security.passed}/${suites.security.total}</strong><p>controles de segurança aprovados</p></article><article><h2>Saúde operacional</h2><strong>${suites.performance.p95}</strong><p>tempo de resposta observado no percentil 95</p></article><article><h2>Auditabilidade</h2><strong>${evidenceCount}</strong><p>evidências úteis vinculadas aos controles</p></article></div><div class="final-decision ${allApproved ? 'pass' : 'fail'}"><h2>Decisão consolidada: ${allApproved ? 'APROVADO' : 'REPROVADO'}</h2><p>${allApproved ? 'Os controles obrigatórios permaneceram verdes no escopo exercitado.' : 'Pelo menos uma barreira obrigatória não produziu sinal suficiente para liberar a mudança.'}</p></div><p class="residual"><b>Limite da decisão:</b> o resultado não representa pentest nem cobertura integral do produto. Frete, pagamento e cancelamento completos permanecem fora do escopo atual.</p>${footer(pageNumber, totalPages, 'Conclusão · sinais complementares e decisão determinística')}</section>`;
}

function timelinePage(suites, pageNumber, totalPages) {
  const stage = (number, title, body, tone = '') => `<article class="stage ${tone}"><b>${number}</b><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></article>`;
  return `<section class="page timeline-page"><div class="brand-line"></div><header><span>QUALITY ENGINEERING LAB</span><p>Modelo de proteção da mudança</p></header><h1>Onde a Engenharia de Qualidade protege o ciclo</h1><p class="lead">As barreiras entram em momentos diferentes e transformam riscos em sinais objetivos antes da liberação.</p><div class="timeline-row">${stage('01', 'Mudança proposta', 'Riscos e comportamento esperado orientam o recorte.')}<i>→</i>${stage('02', 'Desenvolvimento', 'Controles e rastreabilidade acompanham a implementação.')}<i>→</i>${stage('03', 'Validação funcional', `${suites.functional.passed}/${suites.functional.total} controles protegem jornadas.`, suites.functional.approved ? 'pass' : 'fail')}<i>→</i>${stage('04', 'Validação de segurança', `${suites.security.passed}/${suites.security.total} controles protegem acessos.`, suites.security.approved ? 'pass' : 'fail')}</div><div class="timeline-turn">↓</div><div class="timeline-row second">${stage('07', 'Liberação', 'A versão avança somente com todas as barreiras verdes.', suites.allApproved ? 'pass' : 'fail')}<i>←</i>${stage('06', 'Evidências e decisão', 'HTML técnico e PDF tornam o resultado auditável.', suites.evidence.approved ? 'pass' : 'fail')}<i>←</i>${stage('05', 'Validação de performance', 'Disponibilidade e tempo de resposta sustentam a decisão.', suites.performance.approved ? 'pass' : 'fail')}</div><div class="blocking-rule"><h2>Regra de bloqueio</h2><p>Qualquer falha obrigatória deixa o workflow vermelho. Não há score, tolerância percentual ou aprovação por IA.</p></div>${footer(pageNumber, totalPages, 'Linha do tempo · qualidade integrada ao fluxo de desenvolvimento')}</section>`;
}

const report = JSON.parse(await readFile(resultsPath, 'utf8'));
const tests = orderTests(flattenSuites(report.suites));
if (tests.length === 0) throw new Error(`Nenhum teste encontrado em ${resultsPath}`);
const testsWithEvidence = await Promise.all(tests.map(async (test) => ({ test, evidence: await evidenceItems(test) })));
const evidenceProblems = [];
for (const { test, evidence } of testsWithEvidence) {
  if (evidence.length === 0) evidenceProblems.push(`${test.title}: nenhuma evidência útil`);
  if (test.tags.includes('@web') && !evidence.some((item) => item.type === 'image')) evidenceProblems.push(`${test.title}: teste Web sem evidência visual`);
  if (test.tags.includes('@api') && !evidence.some((item) => item.type === 'json' || item.type === 'image')) evidenceProblems.push(`${test.title}: teste API sem evidência técnica`);
}
if (evidenceProblems.length > 0) throw new Error(`Quality Report bloqueado por evidência incompleta:\n- ${evidenceProblems.join('\n- ')}`);

const performance = await canonicalPerformanceSummary();
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
const evidenceCount = testsWithEvidence.reduce((count, item) => count + item.evidence.length, 0) + (performance ? 1 : 0);
const testPageCount = testsWithEvidence.reduce((count, item) => count + 1 + item.evidence.length, 0);
const totalPages = 5 + testPageCount;
let pageNumber = 1;
const suiteStatus = {
  functional: { total: functionalTests.length, passed: functionalTests.filter((test) => test.passed).length, approved: functionalTests.length > 0 && functionalTests.every((test) => test.passed) },
  security: { total: securityTests.length, passed: securityTests.filter((test) => test.passed).length, approved: securityTests.length > 0 && securityTests.every((test) => test.passed) },
  performance: { approved: performance?.passed === true, p95: performance?.p95 !== undefined ? `${performance.p95.toFixed(0)} ms` : 'n/d', errorRate: `${((performance?.failedRequestRate ?? 1) * 100).toFixed(1)}%` },
  evidence: { approved: evidenceProblems.length === 0 },
  allApproved
};

const executivePage = `<section class="page executive-page"><div class="brand-line"></div><header class="executive-header"><div><span>QUALITY ENGINEERING LAB</span><h1>Quality Report</h1><p>Decisão executiva baseada em riscos e evidências reais</p></div><div class="report-meta"><b>Commit ${escapeHtml(commit)}</b><span>EverShop 2.2.1</span><span>${escapeHtml(startedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</span></div></header><div class="executive-summary"><article class="gate-card ${allApproved ? 'pass' : 'fail'}"><h3>Decisão consolidada</h3><strong>${allApproved ? 'APROVADO' : 'REPROVADO'}</strong><p>${allApproved ? 'Controles obrigatórios aprovados no escopo exercitado.' : 'Há barreira obrigatória reprovada ou sem sinal suficiente.'}</p></article><div class="metric-grid"><article><b>${passed}/${total}</b><span>testes aprovados</span></article><article><b>${riskIds.length}</b><span>riscos exercitados</span></article><article><b>${evidenceCount}</b><span>evidências úteis</span></article><article><b>${formatDuration(totalDuration)}</b><span>duração observada</span></article></div></div><div class="suite-summary"><article><h3>Funcional e regressivo</h3><strong>${suiteStatus.functional.passed}/${suiteStatus.functional.total}</strong><p>jornadas e regras aprovadas</p></article><article><h3>Segurança</h3><strong>${suiteStatus.security.passed}/${suiteStatus.security.total}</strong><p>fronteiras de confiança aprovadas</p></article><article><h3>Performance</h3><strong>${suiteStatus.performance.p95}</strong><p>tempo de resposta observado (p95)</p></article></div><div class="executive-decision"><article><h2>Sinal para decisão</h2><p>${allApproved ? 'A versão estável permaneceu saudável nos comportamentos, fronteiras e condições operacionais exercitados.' : 'A versão precisa de correção antes de avançar.'}</p></article><article><h2>Leitura do relatório</h2><p>As próximas páginas mostram áreas de validação, riscos, controles e uma prova legível para cada caso, seguidas pela conclusão e pelo modelo de proteção da mudança.</p></article></div>${footer(pageNumber++, totalPages, 'Visão executiva para Produto, Tecnologia e Liderança')}</section>`;
const overviewMarkup = overviewPage(suiteStatus, riskIds, pageNumber++, totalPages);
const detailPages = [];
for (const { test, evidence } of testsWithEvidence) {
  const suiteTests = suiteKey(test) === 'functional' ? functionalTests : securityTests;
  detailPages.push(testSummaryPage(test, pageNumber++, totalPages, suiteTests.indexOf(test) + 1, suiteTests.length, evidence.length));
  for (let index = 0; index < evidence.length; index += 1) detailPages.push(evidencePage(test, evidence[index], pageNumber++, totalPages, index + 1, evidence.length));
}
const performanceMarkup = performancePage(performance, pageNumber++, totalPages);
const conclusionMarkup = conclusionPage(suiteStatus, allApproved, evidenceCount, pageNumber++, totalPages);
const timelineMarkup = timelinePage(suiteStatus, pageNumber++, totalPages);

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Quality Report</title><style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}:root{--ink:#f5f7f4;--muted:#b9c2bc;--canvas:#0b0f0d;--surface:#111713;--surface-2:#18211b;--line:#344038;--mint:#9bf2ba;--green:#28a745;--amber:#f6c56f;--red:#d92d20;--paper:#f3f7f4;--paper-line:#cedbd2;--paper-text:#172019;--paper-muted:#4e5d53;--blue:#315f9c}html,body{margin:0;padding:0;color:var(--paper-text);background:white;font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:13pt;line-height:1.5}.page{width:297mm;height:210mm;padding:10mm 13mm 12mm;position:relative;overflow:hidden;break-after:page;background:var(--paper)}.page:last-child{break-after:auto}h1{margin:4mm 0;font-size:22pt;line-height:1.18}h2{font-size:18pt;line-height:1.25}h3{font-size:16pt;line-height:1.3}h4,.label{font-size:14pt;line-height:1.4}p{margin:0}header>span,.section-header>div>span{font-size:14pt;font-weight:750;letter-spacing:.05em;text-transform:uppercase}.brand-line{width:32mm;height:2mm;margin-bottom:5mm;background:var(--mint)}footer{position:absolute;left:13mm;right:13mm;bottom:5mm;display:flex;justify-content:space-between;padding-top:2mm;border-top:1px solid currentColor;opacity:.72;font-size:10pt;line-height:1.2}.executive-page,.overview-page,.conclusion-page,.timeline-page{color:var(--ink);background:var(--canvas)}.executive-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7mm}.executive-header span,.overview-page header span,.conclusion-page header span,.timeline-page header span{color:var(--mint)}.executive-header h1{margin:1mm 0;font-size:22pt}.executive-header p,.overview-page header p,.conclusion-page header p,.timeline-page header p{color:var(--muted)}.report-meta{display:grid;gap:1mm;text-align:right;color:var(--muted);font-size:11pt;line-height:1.35}.report-meta b{color:var(--ink)}.executive-summary{display:grid;grid-template-columns:70mm 1fr;gap:4mm;margin-bottom:4mm}.gate-card,.metric-grid article,.suite-summary article,.executive-decision article{border:1px solid var(--line);border-radius:3mm;background:var(--surface)}.gate-card{min-height:48mm;padding:4mm;border-left:2mm solid var(--green)}.gate-card.fail{border-left-color:var(--red)}.gate-card h3{margin:0;color:var(--muted);font-size:14pt}.gate-card strong{display:block;margin:2mm 0;color:var(--ink);font-size:22pt;line-height:1}.gate-card p{color:var(--muted)}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}.metric-grid article{min-height:48mm;padding:4mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.metric-grid b{font-size:22pt;line-height:1}.metric-grid span{margin-top:2mm;color:var(--muted);font-size:13pt}.suite-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-bottom:4mm}.suite-summary article{min-height:35mm;padding:4mm}.suite-summary h3{margin:0 0 1mm;color:var(--mint);font-size:14pt}.suite-summary strong{font-size:20pt}.suite-summary p{color:var(--muted)}.executive-decision{display:grid;grid-template-columns:1fr 1fr;gap:3mm}.executive-decision article{min-height:42mm;padding:4mm}.executive-decision h2{margin:0 0 2mm;color:var(--mint);font-size:18pt}.executive-decision p{color:var(--muted)}.overview-page>h1,.conclusion-page>h1,.timeline-page>h1{margin:5mm 0 2mm}.overview-page .lead,.conclusion-page .lead,.timeline-page .lead{color:var(--muted)}.area-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.area-grid article{min-height:58mm;padding:5mm;border:1px solid var(--line);border-radius:3mm;background:var(--surface)}.area-grid b{color:var(--mint);font-size:14pt}.area-grid h2{margin:2mm 0}.area-grid p{color:var(--muted)}.area-grid strong{display:block;margin-top:3mm;color:var(--mint);font-size:14pt}.coverage{margin-top:5mm;padding:4mm;border:1px solid var(--line);border-radius:3mm;background:var(--surface-2)}.coverage h2{margin:0 0 3mm}.coverage>div{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm}.risk-pill{display:inline-grid;gap:1mm;padding:2mm 3mm;border-radius:2mm;color:#185c35;background:#e4f5e9}.risk-pill strong{font-size:14pt;line-height:1.3}.risk-pill small{color:#4e5d53;font-size:10pt;line-height:1.3}.overview-page .risk-pill{color:var(--ink);background:#1d2921}.overview-page .risk-pill strong{color:var(--mint);font-size:13pt}.section-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3mm}.section-header>div>span{color:#247647}.security .section-header>div>span{color:#8a5d12}.performance .section-header>div>span{color:var(--blue)}.section-header p{color:var(--paper-muted)}.status{min-width:42mm;padding:2mm 4mm;border-radius:2mm;text-align:center}.status.pass{color:#145c32;background:#dff2e5}.status.fail{color:#751f19;background:#f9ddd9}.status b{display:block;font-size:14pt}.status small{display:block;font-size:11pt}.detail-page:before,.evidence-page:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3mm;background:var(--green)}.detail-page.security:before,.evidence-page.security:before{background:var(--amber)}.detail-page.performance:before{background:#6f9fe0}.detail-page>h1,.evidence-page>h1{max-width:245mm;margin:2mm 0 3mm}.risk-pills{display:flex;gap:2mm;flex-wrap:wrap;margin-bottom:5mm}.story-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-bottom:5mm}.story-grid article{min-height:56mm;padding:4mm;border:1px solid var(--paper-line);border-radius:3mm;background:white}.story-grid h3,.verification-grid h3{margin:0 0 2mm;color:#247647;font-size:16pt}.story-grid p,.verification-grid p,.verification-grid li{font-size:13pt;line-height:1.5}.story-grid .decision{border-left:2mm solid var(--green)}.verification-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.verification-grid article{min-height:50mm;padding:4mm;border-radius:3mm;background:#e7eee9}.verification-grid ul{margin:0;padding-left:6mm}.evidence-callout{margin-top:5mm;padding:3mm 4mm;display:flex;justify-content:space-between;gap:5mm;color:#164f30;border-left:2mm solid var(--green);background:#ddf1e3}.evidence-callout b{font-size:14pt}.evidence-page .section-header{margin-bottom:2mm}.evidence-page>h1{margin:2mm 0 4mm}.visual-proof{height:143mm;margin:0;padding:4mm;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid var(--paper-line);border-radius:3mm;background:white}.visual-proof img{max-width:100%;max-height:127mm;object-fit:contain;border:1px solid #bdcac1;box-shadow:0 3mm 8mm rgba(18,35,24,.16)}.visual-proof figcaption{margin-top:3mm;color:var(--paper-muted);font-size:13pt;line-height:1.5;text-align:center}.api-proof{min-height:142mm;padding:6mm;border:1px solid var(--paper-line);border-radius:3mm;background:white}.technical-label{margin-bottom:3mm;color:#247647;font-size:14pt;font-weight:750;text-transform:uppercase}.technical-evidence h3,.operations h3{margin:0 0 3mm;font-size:16pt}.technical-evidence dl{display:grid;gap:4mm;margin:0}.technical-evidence dl div{display:grid;grid-template-columns:45mm 1fr;gap:4mm;padding:3mm 0;border-bottom:1px solid var(--paper-line)}.technical-evidence dt{color:var(--paper-muted);font-size:14pt;font-weight:700}.technical-evidence dd{margin:0;font-size:13pt;line-height:1.5}.operations{display:grid;grid-template-columns:repeat(auto-fit,minmax(70mm,1fr));gap:4mm}.operations article{padding:4mm;border:1px solid var(--paper-line);border-radius:2mm;background:#f7faf8}.operations p{margin:1mm 0;font-size:13pt;line-height:1.5}.technical-conclusion{margin-top:4mm;padding:3mm 4mm;border-left:2mm solid var(--green);background:#e4f5e9}.performance-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin:5mm 0}.performance-metrics article{min-height:43mm;padding:4mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border:1px solid var(--paper-line);border-radius:3mm;background:white}.performance-metrics b{font-size:22pt;line-height:1}.performance-metrics span{margin-top:2mm;font-size:13pt}.verification-list{padding:4mm;border:1px solid var(--paper-line);border-radius:3mm;background:white}.verification-list h2{margin:0 0 3mm}.verification-list>div{display:grid;grid-template-columns:1fr 1fr;gap:2mm 5mm}.verification-list article{display:grid;grid-template-columns:4mm 1fr auto;gap:3mm;align-items:center;padding:2mm;border-bottom:1px solid #e6ece8}.verification-list i{width:3mm;height:3mm;border-radius:50%}.verification-list i.pass{background:var(--green)}.verification-list i.fail{background:var(--red)}.verification-list p,.verification-list b{font-size:13pt}.conclusion-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin:6mm 0}.conclusion-grid article{min-height:66mm;padding:5mm;border:1px solid var(--line);border-radius:3mm;background:var(--surface)}.conclusion-grid h2{margin:0;color:var(--mint);font-size:16pt}.conclusion-grid strong{display:block;margin:4mm 0;font-size:22pt}.conclusion-grid p{color:var(--muted)}.final-decision{padding:5mm;border:1px solid var(--line);border-left:2mm solid var(--green);border-radius:3mm;background:var(--surface-2)}.final-decision.fail{border-left-color:var(--red)}.final-decision h2{margin:0 0 2mm}.final-decision p,.residual{color:var(--muted)}.residual{margin-top:4mm}.timeline-row{display:flex;align-items:stretch;gap:2mm}.timeline-row.second{width:205mm;margin:0 auto}.timeline-row>i{align-self:center;color:var(--mint);font-size:22pt;font-style:normal}.stage{width:60mm;min-height:53mm;padding:4mm;border:1px solid var(--line);border-radius:3mm;background:var(--surface)}.stage>b{color:var(--mint);font-size:14pt}.stage h3{margin:2mm 0;color:var(--ink);font-size:16pt}.stage p{color:var(--muted);font-size:13pt}.stage.pass{border-top:2mm solid var(--green)}.stage.fail{border-top:2mm solid var(--red)}.timeline-turn{height:8mm;color:var(--mint);font-size:22pt;line-height:8mm;text-align:right;padding-right:28mm}.blocking-rule{margin-top:5mm;padding:4mm 5mm;display:grid;grid-template-columns:48mm 1fr;gap:4mm;align-items:center;border-left:2mm solid var(--amber);background:var(--surface-2)}.blocking-rule h2{margin:0;color:var(--amber);font-size:16pt}.blocking-rule p{color:var(--muted)}
.detail-page .risk-pills{margin-bottom:3mm}.detail-page .story-grid{margin-bottom:3mm}.detail-page .story-grid article{min-height:49mm;padding:3.5mm}.detail-page .verification-grid article{min-height:44mm;padding:3.5mm}.detail-page .evidence-callout{margin-top:3mm;padding:2mm 3mm}.performance .story-grid article{min-height:42mm}.performance .performance-metrics{margin:3mm 0}.performance .performance-metrics article{min-height:34mm;padding:3mm}.performance .verification-list{padding:3mm}.performance .verification-list h2{margin-bottom:1mm}.performance .verification-list article{padding:1mm}.performance .verification-list p,.performance .verification-list b{font-size:12pt}
</style></head><body>${executivePage}${overviewMarkup}${detailPages.join('')}${performanceMarkup}${conclusionMarkup}${timelineMarkup}</body></html>`;

await mkdir(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: outputPath, printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
} finally {
  await browser.close();
}

console.log(`Quality Report gerado: ${outputPath}`);
console.log(`Gate: ${allApproved ? 'APROVADO' : 'REPROVADO'} | Testes: ${passed}/${total} | Evidências: ${evidenceCount} | Páginas: ${totalPages}`);
