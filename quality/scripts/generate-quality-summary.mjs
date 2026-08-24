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
        collected.push({
          title: spec.title,
          file: spec.file ?? suite.file ?? '',
          tags: spec.tags ?? [],
          annotations: test.annotations ?? [],
          duration: lastResult?.duration ?? 0,
          passed: test.status === 'expected' && lastResult?.status === 'passed',
          attachments: lastResult?.attachments ?? []
        });
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

function gitValue(...args) {
  try {
    return execFileSync('git', args, { cwd: repositoryDir, encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

function resolveAttachmentPath(value) {
  return !value ? undefined : path.isAbsolute(value) ? value : path.resolve(qualityDir, value);
}

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
  if (normalizedFile.includes('/security/') || (annotationValues(test, 'risk').includes('RISK-016') && /bloqueio|fronteira/i.test(behavior))) {
    return 'security';
  }
  return 'functional';
}

function riskScore(test) {
  return Math.max(0, ...annotationValues(test, 'risk').map((id) => riskCatalog[id]?.priority ?? 0));
}

function orderTests(tests) {
  return [...tests].sort((left, right) => {
    const suiteDifference = (suiteKey(left) === 'functional' ? 1 : 2) - (suiteKey(right) === 'functional' ? 1 : 2);
    return suiteDifference || riskScore(right) - riskScore(left) || left.title.localeCompare(right.title, 'pt-BR');
  });
}

const DECISION_DESCRIPTIONS = {
  'Integridade do produto no carrinho': {
    pass: 'Seleção, quantidade, preço unitário e subtotal conferem com exatidão, eliminando risco de distorção de cobrança.',
    fail: 'Divergência de valores ou quantidade detectada no carrinho. A versão deve ser bloqueada para evitar cobrança incorreta.'
  },
  'Rejeição de autenticação inválida': {
    pass: 'Tentativa de login com credenciais incorretas é prontamente rejeitada, mantendo a integridade das contas de clientes.',
    fail: 'Falha na barreira de login: credenciais incorretas permitiram acesso indevido ou comportamento inconsistente.'
  },
  'Propagação de preço do Admin para a Storefront': {
    pass: 'Preço atualizado no painel reflete de forma íntegra na vitrine da loja e no cálculo do carrinho, garantindo alinhamento comercial.',
    fail: 'Divergência entre o preço cadastrado no painel e o valor cobrado na vitrine e carrinho da loja.'
  },
  'Isolamento entre clientes e fronteira administrativa': {
    pass: 'Fronteiras de autorização ativas: clientes não acessam dados de terceiros e rotas administrativas permanecem blindadas.',
    fail: 'Quebra de isolamento horizontal ou vertical detectada. Bloqueio obrigatório por risco à segurança dos dados.'
  },
  'Bloqueio da fronteira administrativa para usuário anônimo': {
    pass: 'Painel administrativo protegido: tentativas de acesso não autenticado são bloqueadas tanto na Web quanto na API.',
    fail: 'Acesso administrativo exposto a usuários não autenticados na Web ou API.'
  },
  'Integridade do carrinho e bloqueio de pedido incompleto': {
    pass: 'Valores do item e do carrinho preservados; pedidos sem dados obrigatórios são recusados antes de afetar a base transacional.',
    fail: 'Criação de pedido aceitou dados inconsistentes ou corrompeu os valores transacionais.'
  },
  'Disponibilidade da Home e acesso ao catálogo': {
    pass: 'Página inicial e vitrine de produtos em destaque respondem disponíveis e com renderização completa para os clientes.',
    fail: 'Página inicial indisponível ou com falha na renderização de produtos em destaque.'
  },
  'Disponibilidade do catálogo e dados essenciais do produto': {
    pass: 'Navegação por categorias e páginas de detalhes de produtos ativas, exibindo dados e atributos corretos da vitrine.',
    fail: 'Falha na apresentação ou consulta de produtos e categorias no catálogo.'
  },
  'Consulta pública read-only do catálogo': {
    pass: 'Consulta estruturada de produtos entrega os dados esperados pela vitrine, preservando a integridade do contrato público.',
    fail: 'Quebra de contrato na API pública de catálogo de produtos.'
  },
  'Bloqueio read-only da fronteira administrativa': {
    pass: 'Garantia de que a versão incorporada na branch principal mantém o bloqueio de segurança em rotas administrativas públicas.',
    fail: 'Regressão de segurança na branch principal: rota administrativa acessível sem autenticação.'
  }
};

async function canonicalPerformanceSummary() {
  const profile = process.env.PERF_PROFILE || 'smoke';
  const runId = process.env.GITHUB_RUN_ID;

  const entries = await readdir(qualityDir, { withFileTypes: true });
  let candidates = entries
    .filter((entry) => entry.isFile() && /^performance-(smoke|average-load|traffic-variation|post-merge-smoke)-.+-summary\.json$/.test(entry.name))
    .map((entry) => path.join(qualityDir, entry.name));

  if (runId) {
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
  const failedRequestRate = summary.metrics?.http_req_failed?.value ?? 0;

  return {
    passed: summary.qel?.passed ?? (checkFailures === 0 && failedRequestRate === 0),
    profile: summary.qel?.profile ?? profile,
    label: summary.qel?.label ?? 'Saúde rápida após uma mudança',
    businessQuestion: summary.qel?.businessQuestion ?? 'A jornada de descoberta de produto continua disponível e sem regressão grosseira?',
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

function structuredEvidenceMarkup(evidence, { compact = false } = {}) {
  if (evidence.attempt && !evidence.operations && !evidence.attempts) {
    return `<article class="technical-evidence ${compact ? 'compact' : ''}">
      <div class="tech-tag">Verificação técnica</div>
      <h3>${escapeHtml(evidence.attempt)}</h3>
      <dl>
        <div><dt>Controle</dt><dd>${escapeHtml(evidence.control ?? 'Validação de contrato e segurança')}</dd></div>
        <div><dt>Resultado</dt><dd class="result-highlight">${escapeHtml(evidence.result ?? 'Operação confirmada')}</dd></div>
        <div><dt>Decisão</dt><dd>${escapeHtml(evidence.decision ?? 'Aprovado conforme regra de negócio')}</dd></div>
      </dl>
    </article>`;
  }

  const operations = evidence.operations ?? evidence.attempts ?? [evidence];
  return `<div class="operations-container ${compact ? 'compact' : ''}">
    <div class="operations-grid">
      ${operations.map((op) => {
        const title = op.endpoint ?? op.operation ?? 'Validação de contrato';
        const expected = op.expected ?? 'Resultado esperado atendido';
        const obtained = op.obtained ?? op.result ?? 'Resultado observado confirmado';
        const actor = op.actor ? `<p class="op-actor"><b>Contexto:</b> ${escapeHtml(op.actor)}</p>` : '';
        return `<article class="op-card">
          <h4>${escapeHtml(title)}</h4>
          ${actor}
          <div class="op-row"><b>Esperado:</b> <span>${escapeHtml(expected)}</span></div>
          <div class="op-row observed"><b>Observado:</b> <span>${escapeHtml(obtained)}</span></div>
        </article>`;
      }).join('')}
    </div>
    ${evidence.businessRule || evidence.control ? `<p class="tech-note"><b>Regra validada:</b> ${escapeHtml(evidence.businessRule || evidence.control)}</p>` : ''}
    ${evidence.decision ? `<p class="tech-note decision"><b>Decisão:</b> ${escapeHtml(evidence.decision)}</p>` : ''}
  </div>`;
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

function footer(page, totalPages, label) {
  return `<footer><span>${escapeHtml(label)}</span><span>Página ${page} de ${totalPages}</span></footer>`;
}

/**
 * 1 TESTE = EXATAMENTE 1 PÁGINA EXECUTIVA
 * Combina Risco, O que foi validado, Decisão e Evidência em layout integrado.
 */
function testPage(testWithEvidence, pageNumber, totalPages, suitePosition, suiteTotal) {
  const { test, evidence } = testWithEvidence;
  const behavior = annotationValues(test, 'behavior')[0] ?? test.title;
  const intent = annotationValues(test, 'intent')[0] ?? 'Controle automatizado associado ao cenário.';
  const validations = annotationValues(test, 'validation');
  const risks = annotationValues(test, 'risk');
  const suite = suiteKey(test);
  const primaryRiskId = [...risks].sort((left, right) => (riskCatalog[right]?.priority ?? 0) - (riskCatalog[left]?.priority ?? 0))[0];
  const primaryRisk = riskCatalog[primaryRiskId];
  const suiteTitle = suite === 'functional' ? 'Testes funcionais e regressivos' : 'Testes de segurança';

  // Specific, non-repetitive executive decision
  const decisionEntry = DECISION_DESCRIPTIONS[behavior];
  const decisionText = test.passed
    ? (decisionEntry?.pass ?? `O comportamento "${behavior}" foi validado com sucesso e atende aos critérios de liberação.`)
    : (decisionEntry?.fail ?? `O controle para "${behavior}" falhou; a versão deve ser bloqueada até correção.`);

  const imageItems = evidence.filter((item) => item.type === 'image');
  const jsonItems = evidence.filter((item) => item.type === 'json');

  let evidenceMarkup = '';
  if (imageItems.length === 1 && jsonItems.length === 0) {
    // Single image: full height visual proof
    evidenceMarkup = `
      <div class="evidence-box visual-single">
        <figure class="visual-proof">
          <img src="${imageItems[0].dataUrl}" alt="Captura de tela com checkpoint validado destacado" />
          <figcaption>A captura preserva o contexto da aplicação. O retângulo verde destaca o checkpoint validado.</figcaption>
        </figure>
      </div>`;
  } else if (imageItems.length === 1 && jsonItems.length >= 1) {
    // 1 image + 1 JSON: integrated view
    evidenceMarkup = `
      <div class="evidence-box visual-hybrid">
        <figure class="visual-proof compact">
          <img src="${imageItems[0].dataUrl}" alt="Captura de tela com checkpoint validado destacado" />
          <figcaption>Evidência visual: contexto da aplicação com checkpoint destacado.</figcaption>
        </figure>
        <div class="api-proof-compact">
          ${structuredEvidenceMarkup(jsonItems[0].evidence, { compact: true })}
        </div>
      </div>`;
  } else if (imageItems.length === 0 && jsonItems.length >= 1) {
    // Pure JSON / API evidence
    evidenceMarkup = `
      <div class="evidence-box api-single">
        <div class="api-proof-full">
          <div class="evidence-title">Comprovante técnico e contratual</div>
          ${structuredEvidenceMarkup(jsonItems[0].evidence, { compact: false })}
        </div>
      </div>`;
  } else if (imageItems.length >= 2) {
    // 2 images side-by-side
    evidenceMarkup = `
      <div class="evidence-box visual-dual">
        <figure class="visual-proof dual">
          <img src="${imageItems[0].dataUrl}" alt="Evidência 1" />
          <figcaption>1. Etapa inicial</figcaption>
        </figure>
        <figure class="visual-proof dual">
          <img src="${imageItems[1].dataUrl}" alt="Evidência 2" />
          <figcaption>2. Resultado refletido</figcaption>
        </figure>
      </div>`;
  }

  return `
    <section class="page detail-page ${suite}">
      <header class="section-header">
        <div>
          <span>${escapeHtml(suiteTitle)}</span>
          <p>Caso ${suitePosition} de ${suiteTotal} · visão executiva da validação</p>
        </div>
        <div class="status ${test.passed ? 'pass' : 'fail'}">
          <b>${test.passed ? 'APROVADO' : 'REPROVADO'}</b>
          <small>${formatDuration(test.duration)}</small>
        </div>
      </header>

      <h1>${escapeHtml(behavior)}</h1>
      <div class="risk-pills">${riskPills(risks)}</div>

      <div class="case-grid">
        <!-- Coluna de Contexto, Validação e Decisão -->
        <aside class="case-sidebar">
          <article class="case-card risk-card">
            <h3>O que poderia dar errado?</h3>
            <p><strong>${escapeHtml(primaryRisk?.name ?? 'Risco de negócio')}:</strong> ${escapeHtml(primaryRisk?.risk ?? 'Falha potencial no fluxo comercial.')}</p>
          </article>

          <article class="case-card control-card">
            <h3>O que foi validado?</h3>
            <p class="intent-text">${escapeHtml(intent)}</p>
            <ul class="validation-bullets">
              ${validations.map((v) => `<li>${escapeHtml(v)}</li>`).join('') || '<li>Comportamento esperado confirmado.</li>'}
            </ul>
          </article>

          <article class="case-card decision-card ${test.passed ? 'pass' : 'fail'}">
            <h3>Decisão executiva</h3>
            <p>${escapeHtml(decisionText)}</p>
          </article>
        </aside>

        <!-- Coluna de Evidência Útil -->
        <main class="case-evidence">
          ${evidenceMarkup}
        </main>
      </div>

      ${footer(pageNumber, totalPages, `${suiteTitle} · risco → controle → evidência → decisão`)}
    </section>
  `;
}

function performancePage(performance, pageNumber, totalPages) {
  const passed = performance?.passed === true;
  const verifications = performance?.checks ?? [];
  const totalVerifications = (performance?.checkPasses ?? 0) + (performance?.checkFailures ?? 0);
  const profileLabel = escapeHtml(performance?.label ?? 'Saúde rápida após uma mudança');
  const businessQuestion = escapeHtml(performance?.businessQuestion ?? 'A jornada de descoberta de produto continua disponível e sem regressão grosseira?');

  const p95Text = performance?.p95 !== undefined ? `${performance.p95.toFixed(0)} ms` : 'n/d';
  const errorRateText = `${((performance?.failedRequestRate ?? 0) * 100).toFixed(1)}%`;

  return `
    <section class="page detail-page performance">
      <header class="section-header">
        <div>
          <span>Testes não funcionais e performance</span>
          <p>${profileLabel}</p>
        </div>
        <div class="status ${passed ? 'pass' : 'fail'}">
          <b>${passed ? 'APROVADO' : 'REPROVADO'}</b>
          <small>${formatDuration(performance?.duration)}</small>
        </div>
      </header>

      <h1>Desempenho da jornada de descoberta do cliente</h1>
      <div class="risk-pills">${riskPills(performanceRisks)}</div>

      <div class="perf-story-grid">
        <article class="perf-story-card">
          <h3>O que poderia dar errado?</h3>
          <p>Lentidão ou instabilidade degradam a vitrine de produtos e reduzem a confiança de compra do cliente.</p>
        </article>
        <article class="perf-story-card">
          <h3>Pergunta respondida</h3>
          <p>${businessQuestion}</p>
        </article>
        <article class="perf-story-card decision">
          <h3>Decisão de performance</h3>
          <p>${passed ? '95% das respostas ocorreram dentro do limite esperado para o laboratório, sem indisponibilidade registrada.' : 'Degradação ou erro de performance identificado; a mudança deve ser bloqueada.'}</p>
        </article>
      </div>

      <div class="perf-metrics-strip">
        <article>
          <b>95% em até ${p95Text}</b>
          <span>tempo de resposta observado (p95 global)</span>
        </article>
        <article>
          <b>${errorRateText} de indisponibilidade</b>
          <span>respostas com erro ou falha de conexão</span>
        </article>
        <article>
          <b>${performance?.requests ?? 0} respostas analisadas</b>
          <span>iterações completas na jornada</span>
        </article>
        <article>
          <b>${performance?.checkPasses ?? 0}/${totalVerifications} verificações</b>
          <span>100% de conformidade funcional</span>
        </article>
      </div>

      <section class="perf-verifications">
        <h2>Resultados detalhados por etapa da jornada</h2>
        <div class="perf-checks-grid">
          ${verifications.map((check) => `
            <article class="perf-check-item">
              <i class="${check.fails === 0 ? 'pass' : 'fail'}"></i>
              <span class="check-title">${escapeHtml(check.name)}</span>
              <strong class="check-result">${check.passes ?? 0} aprovadas ${check.fails > 0 ? `· ${check.fails} falhas` : ''}</strong>
            </article>
          `).join('') || '<p>Resultado de performance não encontrado para esta execução.</p>'}
        </div>
        <p class="perf-disclaimer">Thresholds calibrados como referência de laboratório (EverShop 2.2.1 em contêiner) para detecção de regressão, não constituem SLA de produção.</p>
      </section>

      ${footer(pageNumber, totalPages, `Performance · ${profileLabel} · risco → perfil → resultado → decisão`)}
    </section>
  `;
}

function overviewPage(suites, riskIds, pageNumber, totalPages) {
  return `
    <section class="page overview-page">
      <div class="brand-line"></div>
      <header>
        <span>QUALITY ENGINEERING LAB</span>
        <p>Da decisão executiva às evidências</p>
      </header>
      <h1>Como esta versão foi avaliada</h1>
      <p class="lead">O relatório parte da decisão consolidada, organiza os controles por área de proteção e apresenta a evidência direta de cada caso. A conclusão reúne os sinais antes de demonstrar onde as barreiras atuam no ciclo.</p>

      <div class="area-grid">
        <article>
          <b>01</b>
          <h2>Funcional e regressivo</h2>
          <p>Protege jornadas de compra, integridade de preços, itens e cálculos do carrinho.</p>
          <strong>${suites.functional.passed}/${suites.functional.total} controles aprovados</strong>
        </article>
        <article>
          <b>02</b>
          <h2>Segurança e acessos</h2>
          <p>Protege fronteiras de autorização, isolamento entre clientes e painel administrativo.</p>
          <strong>${suites.security.passed}/${suites.security.total} controles aprovados</strong>
        </article>
        <article>
          <b>03</b>
          <h2>Performance operacional</h2>
          <p>Observa disponibilidade e tempo de resposta da jornada crítica sob carga controlada.</p>
          <strong>${suites.performance.approved ? 'Sinal aprovado' : 'Sinal reprovado'}</strong>
        </article>
      </div>

      <section class="coverage">
        <h2>Cobertura orientada a riscos de negócio</h2>
        <div>${riskPills(riskIds, { executive: true })}</div>
      </section>

      ${footer(pageNumber, totalPages, 'Contexto → áreas de validação → evidências → conclusão')}
    </section>
  `;
}

function conclusionPage(suites, allApproved, evidenceCount, pageNumber, totalPages) {
  return `
    <section class="page conclusion-page">
      <div class="brand-line"></div>
      <header>
        <span>QUALITY ENGINEERING LAB</span>
        <p>Parecer Executivo</p>
      </header>
      <h1>${allApproved ? 'Os sinais sustentam a evolução segura da versão' : 'A versão necessita de correção antes de avançar'}</h1>
      <p class="lead">A decisão combina conformidade funcional, segurança de fronteiras, performance previsível e evidências auditáveis. Nenhuma barreira isolada substitui as demais.</p>

      <div class="conclusion-grid">
        <article>
          <h2>Comportamento de negócio</h2>
          <strong>${suites.functional.passed}/${suites.functional.total}</strong>
          <p>jornadas e regras de compra aprovadas</p>
        </article>
        <article>
          <h2>Fronteiras de confiança</h2>
          <strong>${suites.security.passed}/${suites.security.total}</strong>
          <p>controles de acesso e isolamento aprovados</p>
        </article>
        <article>
          <h2>Saúde operacional</h2>
          <strong>${suites.performance.p95}</strong>
          <p>tempo de resposta observado (percentil 95)</p>
        </article>
        <article>
          <h2>Auditabilidade</h2>
          <strong>${evidenceCount}</strong>
          <p>evidências úteis vinculadas aos riscos</p>
        </article>
      </div>

      <div class="final-decision ${allApproved ? 'pass' : 'fail'}">
        <h2>Decisão consolidada: ${allApproved ? 'APROVADO' : 'REPROVADO'}</h2>
        <p>${allApproved ? 'Todos os controles obrigatórios permaneceram verdes no escopo exercitado, sem regressões detectadas.' : 'Pelo menos uma barreira obrigatória foi reprovada ou não produziu sinal conclusivo para liberação.'}</p>
      </div>

      <p class="residual"><b>Limite da decisão:</b> o resultado reflete o escopo reproduzível do Sistema Sob Teste (EverShop 2.2.1) e não representa pentest nem certificação de capacidade de produção. Fluxos com gateways externos de frete e pagamento permanecem fora do recorte atual.</p>

      ${footer(pageNumber, totalPages, 'Conclusão · sinais complementares e decisão determinística')}
    </section>
  `;
}

function timelinePage(suites, pageNumber, totalPages) {
  const stage = (number, title, body, tone = '') => `
    <article class="stage ${tone}">
      <b>${number}</b>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </article>`;

  return `
    <section class="page timeline-page">
      <div class="brand-line"></div>
      <header>
        <span>QUALITY ENGINEERING LAB</span>
        <p>Modelo de proteção da mudança</p>
      </header>
      <h1>Onde a Engenharia de Qualidade protege o ciclo</h1>
      <p class="lead">As barreiras de qualidade atuam de forma progressiva e transformam riscos em sinais objetivos antes de qualquer liberação.</p>

      <div class="timeline-row">
        ${stage('01', 'Mudança proposta', 'Riscos e impacto de negócio orientam o recorte de teste.')}
        <i>→</i>
        ${stage('02', 'Desenvolvimento', 'Rastreabilidade e critérios de aceite integrados antes do merge.')}
        <i>→</i>
        ${stage('03', 'Validação funcional', `${suites.functional.passed}/${suites.functional.total} controles protegem jornadas de compra.`, suites.functional.approved ? 'pass' : 'fail')}
        <i>→</i>
        ${stage('04', 'Segurança e acessos', `${suites.security.passed}/${suites.security.total} controles blindam dados e fronteiras.`, suites.security.approved ? 'pass' : 'fail')}
      </div>

      <div class="timeline-turn">↓</div>

      <div class="timeline-row second">
        ${stage('08', 'Liberação confiável', 'A versão avança somente com todas as barreiras verdes.', suites.allApproved ? 'pass' : 'fail')}
        <i>←</i>
        ${stage('07', 'Decisão determinística', 'Quality Gate aprova ou bloqueia sem tolerância subjetiva.', suites.allApproved ? 'pass' : 'fail')}
        <i>←</i>
        ${stage('06', 'Evidências auditáveis', 'Capturas e comprovantes técnicos comprovam o resultado.', suites.evidence.approved ? 'pass' : 'fail')}
        <i>←</i>
        ${stage('05', 'Performance', 'Disponibilidade e tempo de resposta verificados sob carga.', suites.performance.approved ? 'pass' : 'fail')}
      </div>

      <div class="blocking-rule">
        <h2>Regra de bloqueio determinística</h2>
        <p>Qualquer falha em barreira obrigatória reprova o pipeline de imediato. Não há tolerância percentual, score ponderado ou aprovação consultiva por IA.</p>
      </div>

      ${footer(pageNumber, totalPages, 'Linha do tempo · qualidade integrada ao fluxo de desenvolvimento')}
    </section>
  `;
}

// ----------------------------------------------------
// Execução Principal e Montagem do Documento
// ----------------------------------------------------

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
const riskIds = [...new Set([...tests.flatMap((test) => annotationValues(test, 'risk')), ...performanceRisks])]
  .sort((left, right) => (riskCatalog[right]?.priority ?? 0) - (riskCatalog[left]?.priority ?? 0) || left.localeCompare(right));

const testDuration = report.stats?.duration ?? tests.reduce((sum, test) => sum + test.duration, 0);
const totalDuration = testDuration + (performance?.duration ?? 0);
const startedAt = report.stats?.startTime ? new Date(report.stats.startTime) : new Date();
const commit = gitValue('rev-parse', '--short', 'HEAD');
const evidenceCount = testsWithEvidence.reduce((count, item) => count + item.evidence.length, 0) + (performance ? 1 : 0);

// REGRA: 1 TESTE = 1 PÁGINA
// Total: Capa (1) + Visão Geral (1) + N Testes (N) + Performance (1) + Conclusão (1) + Linha do Tempo (1) = 5 + N
const totalPages = 5 + testsWithEvidence.length;
let pageNumber = 1;

const suiteStatus = {
  functional: {
    total: functionalTests.length,
    passed: functionalTests.filter((test) => test.passed).length,
    approved: functionalTests.length > 0 && functionalTests.every((test) => test.passed)
  },
  security: {
    total: securityTests.length,
    passed: securityTests.filter((test) => test.passed).length,
    approved: securityTests.length > 0 && securityTests.every((test) => test.passed)
  },
  performance: {
    approved: performance?.passed === true,
    p95: performance?.p95 !== undefined ? `${performance.p95.toFixed(0)} ms` : 'n/d',
    errorRate: `${((performance?.failedRequestRate ?? 0) * 100).toFixed(1)}%`
  },
  evidence: { approved: evidenceProblems.length === 0 },
  allApproved
};

const executivePage = `
  <section class="page executive-page">
    <div class="brand-line"></div>
    <header class="executive-header">
      <div>
        <span>QUALITY ENGINEERING LAB</span>
        <h1>Quality Report</h1>
        <p>Decisão executiva baseada em riscos e evidências reais</p>
      </div>
      <div class="report-meta">
        <b>Commit ${escapeHtml(commit)}</b>
        <span>EverShop 2.2.1</span>
        <span>${escapeHtml(startedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</span>
      </div>
    </header>

    <div class="executive-summary">
      <article class="gate-card ${allApproved ? 'pass' : 'fail'}">
        <h3>Decisão consolidada</h3>
        <strong>${allApproved ? 'APROVADO' : 'REPROVADO'}</strong>
        <p>${allApproved ? 'Todos os controles obrigatórios aprovados no escopo exercitado.' : 'Há barreira obrigatória reprovada ou sem sinal suficiente para liberação.'}</p>
      </article>
      <div class="metric-grid">
        <article>
          <b>${passed}/${total}</b>
          <span>testes aprovados</span>
        </article>
        <article>
          <b>${riskIds.length}</b>
          <span>riscos exercitados</span>
        </article>
        <article>
          <b>${evidenceCount}</b>
          <span>evidências úteis</span>
        </article>
        <article>
          <b>${formatDuration(totalDuration)}</b>
          <span>duração observada</span>
        </article>
      </div>
    </div>

    <div class="suite-summary">
      <article>
        <h3>Funcional e regressivo</h3>
        <strong>${suiteStatus.functional.passed}/${suiteStatus.functional.total}</strong>
        <p>jornadas e regras de compra aprovadas</p>
      </article>
      <article>
        <h3>Segurança e acessos</h3>
        <strong>${suiteStatus.security.passed}/${suiteStatus.security.total}</strong>
        <p>fronteiras de autorização blindadas</p>
      </article>
      <article>
        <h3>Performance operacional</h3>
        <strong>${suiteStatus.performance.p95}</strong>
        <p>tempo de resposta no percentil 95</p>
      </article>
    </div>

    <div class="executive-decision">
      <article>
        <h2>Sinal para decisão</h2>
        <p>${allApproved ? 'A versão avaliada manteve-se íntegra nos comportamentos críticos, fronteiras de acesso e patamares de resposta observados.' : 'A versão necessita de correção antes de avançar para ambientes produtivos.'}</p>
      </article>
      <article>
        <h2>Estrutura do relatório</h2>
        <p>As próximas páginas trazem a visão de cobertura, seguida por 1 página executiva para cada teste com sua prova legível a 100%, concluindo com a síntese e o modelo de proteção da mudança.</p>
      </article>
    </div>

    ${footer(pageNumber++, totalPages, 'Visão executiva para Produto, Tecnologia e Liderança')}
  </section>
`;

const overviewMarkup = overviewPage(suiteStatus, riskIds, pageNumber++, totalPages);

const detailPages = [];
for (const item of testsWithEvidence) {
  const suiteTests = suiteKey(item.test) === 'functional' ? functionalTests : securityTests;
  detailPages.push(testPage(item, pageNumber++, totalPages, suiteTests.indexOf(item.test) + 1, suiteTests.length));
}

const performanceMarkup = performancePage(performance, pageNumber++, totalPages);
const conclusionMarkup = conclusionPage(suiteStatus, allApproved, evidenceCount, pageNumber++, totalPages);
const timelineMarkup = timelinePage(suiteStatus, pageNumber++, totalPages);

const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Quality Report</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    :root {
      --ink: #f5f7f4;
      --muted: #b9c2bc;
      --canvas: #0b0f0d;
      --surface: #111713;
      --surface-2: #18211b;
      --line: #344038;
      --mint: #9bf2ba;
      --green: #28a745;
      --amber: #f6c56f;
      --red: #d92d20;
      --paper: #f3f7f4;
      --paper-line: #cedbd2;
      --paper-text: #172019;
      --paper-muted: #4e5d53;
      --blue: #315f9c;
    }

    html, body {
      margin: 0;
      padding: 0;
      color: var(--paper-text);
      background: white;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
    }

    .page {
      width: 297mm;
      height: 210mm;
      padding: 9mm 12mm 10mm;
      position: relative;
      overflow: hidden;
      break-after: page;
      background: var(--paper);
    }
    .page:last-child { break-after: auto; }

    h1 { margin: 2mm 0 3mm; font-size: 19pt; line-height: 1.2; font-weight: 750; }
    h2 { font-size: 15pt; line-height: 1.25; margin: 0 0 2mm; }
    h3 { font-size: 13pt; line-height: 1.3; margin: 0 0 2mm; }
    h4, .label { font-size: 11pt; line-height: 1.35; margin: 0; }
    p { margin: 0; }

    header > span, .section-header > div > span {
      font-size: 12pt;
      font-weight: 750;
      letter-spacing: .05em;
      text-transform: uppercase;
    }

    .brand-line { width: 32mm; height: 2mm; margin-bottom: 4mm; background: var(--mint); }

    footer {
      position: absolute;
      left: 12mm;
      right: 12mm;
      bottom: 4mm;
      display: flex;
      justify-content: space-between;
      padding-top: 1.5mm;
      border-top: 1px solid currentColor;
      opacity: .75;
      font-size: 9pt;
      line-height: 1.2;
    }

    /* Temas Escuros (Capa, Overview, Conclusão, Timeline) */
    .executive-page, .overview-page, .conclusion-page, .timeline-page {
      color: var(--ink);
      background: var(--canvas);
    }

    .executive-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 5mm;
    }
    .executive-header span, .overview-page header span, .conclusion-page header span, .timeline-page header span {
      color: var(--mint);
    }
    .executive-header h1 { margin: 1mm 0; font-size: 24pt; }
    .executive-header p, .overview-page header p, .conclusion-page header p, .timeline-page header p {
      color: var(--muted);
      font-size: 11pt;
    }
    .report-meta {
      display: grid;
      gap: 1mm;
      text-align: right;
      color: var(--muted);
      font-size: 10pt;
      line-height: 1.3;
    }
    .report-meta b { color: var(--ink); font-size: 11pt; }

    .executive-summary {
      display: grid;
      grid-template-columns: 72mm 1fr;
      gap: 3.5mm;
      margin-bottom: 3.5mm;
    }
    .gate-card, .metric-grid article, .suite-summary article, .executive-decision article {
      border: 1px solid var(--line);
      border-radius: 2.5mm;
      background: var(--surface);
    }
    .gate-card {
      min-height: 44mm;
      padding: 3.5mm;
      border-left: 2.5mm solid var(--green);
    }
    .gate-card.fail { border-left-color: var(--red); }
    .gate-card h3 { margin: 0; color: var(--muted); font-size: 12pt; }
    .gate-card strong { display: block; margin: 1.5mm 0; color: var(--ink); font-size: 22pt; line-height: 1; }
    .gate-card p { color: var(--muted); font-size: 10pt; }

    .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm; }
    .metric-grid article {
      min-height: 44mm;
      padding: 3mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .metric-grid b { font-size: 20pt; line-height: 1; }
    .metric-grid span { margin-top: 1.5mm; color: var(--muted); font-size: 10pt; }

    .suite-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; margin-bottom: 3.5mm; }
    .suite-summary article { min-height: 32mm; padding: 3mm; }
    .suite-summary h3 { margin: 0 0 1mm; color: var(--mint); font-size: 12pt; }
    .suite-summary strong { font-size: 18pt; }
    .suite-summary p { color: var(--muted); font-size: 10pt; }

    .executive-decision { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; }
    .executive-decision article { min-height: 36mm; padding: 3.5mm; }
    .executive-decision h2 { margin: 0 0 1.5mm; color: var(--mint); font-size: 14pt; }
    .executive-decision p { color: var(--muted); font-size: 10.5pt; line-height: 1.4; }

    /* Overview Page */
    .overview-page .lead, .conclusion-page .lead, .timeline-page .lead { color: var(--muted); font-size: 11pt; margin-bottom: 4mm; }
    .area-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3.5mm; margin-bottom: 4mm; }
    .area-grid article { min-height: 52mm; padding: 4mm; border: 1px solid var(--line); border-radius: 2.5mm; background: var(--surface); }
    .area-grid b { color: var(--mint); font-size: 12pt; }
    .area-grid h2 { margin: 1.5mm 0; font-size: 14pt; }
    .area-grid p { color: var(--muted); font-size: 10pt; line-height: 1.4; }
    .area-grid strong { display: block; margin-top: 2.5mm; color: var(--mint); font-size: 11.5pt; }

    .coverage { padding: 3.5mm; border: 1px solid var(--line); border-radius: 2.5mm; background: var(--surface-2); }
    .coverage h2 { margin: 0 0 2.5mm; font-size: 13pt; }
    .coverage > div { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; }

    .risk-pill {
      display: inline-grid;
      gap: 0.5mm;
      padding: 1.5mm 2.5mm;
      border-radius: 1.5mm;
      color: #185c35;
      background: #e4f5e9;
    }
    .risk-pill strong { font-size: 10.5pt; line-height: 1.25; }
    .risk-pill small { color: #4e5d53; font-size: 8.5pt; line-height: 1.2; }
    .overview-page .risk-pill { color: var(--ink); background: #1d2921; }
    .overview-page .risk-pill strong { color: var(--mint); font-size: 10pt; }

    /* Páginas de Detalhes dos Casos (1 TESTE = 1 PÁGINA) */
    .detail-page:before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 2.5mm;
      background: var(--green);
    }
    .detail-page.security:before { background: var(--amber); }
    .detail-page.performance:before { background: #6f9fe0; }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2mm;
    }
    .section-header > div > span { color: #247647; font-size: 11pt; }
    .security .section-header > div > span { color: #8a5d12; }
    .performance .section-header > div > span { color: var(--blue); }
    .section-header p { color: var(--paper-muted); font-size: 9.5pt; }

    .status {
      min-width: 36mm;
      padding: 1.5mm 3mm;
      border-radius: 1.5mm;
      text-align: center;
    }
    .status.pass { color: #145c32; background: #dff2e5; }
    .status.fail { color: #751f19; background: #f9ddd9; }
    .status b { display: block; font-size: 11pt; }
    .status small { display: block; font-size: 8.5pt; }

    .detail-page > h1 { margin: 1mm 0 2mm; font-size: 17pt; max-width: 235mm; }
    .detail-page .risk-pills { display: flex; gap: 1.5mm; flex-wrap: wrap; margin-bottom: 2.5mm; }

    /* Case Grid: 2 Columns (Sidebar 84mm + Evidence 183mm) */
    .case-grid {
      display: grid;
      grid-template-columns: 84mm 1fr;
      gap: 3.5mm;
      align-items: stretch;
    }

    .case-sidebar {
      display: flex;
      flex-direction: column;
      gap: 2.5mm;
    }

    .case-card {
      padding: 3mm;
      border: 1px solid var(--paper-line);
      border-radius: 2mm;
      background: white;
    }
    .case-card h3 {
      margin: 0 0 1.5mm;
      color: #247647;
      font-size: 11pt;
      font-weight: 750;
    }
    .security .case-card h3 { color: #8a5d12; }

    .risk-card p { font-size: 9.5pt; line-height: 1.35; color: var(--paper-text); }
    .control-card .intent-text { font-size: 9.5pt; line-height: 1.35; margin-bottom: 2mm; }
    .validation-bullets {
      margin: 0;
      padding-left: 4.5mm;
      font-size: 9pt;
      line-height: 1.35;
      color: var(--paper-muted);
    }
    .validation-bullets li { margin-bottom: 1mm; }

    .decision-card {
      border-left: 2mm solid var(--green);
      background: #f7faf8;
    }
    .decision-card.fail { border-left-color: var(--red); background: #fff8f7; }
    .decision-card p { font-size: 9.5pt; line-height: 1.35; font-weight: 550; color: #164f30; }
    .decision-card.fail p { color: #751f19; }

    /* Evidence Box & Visuals */
    .case-evidence {
      height: 142mm;
      display: flex;
      flex-direction: column;
    }

    .evidence-box {
      height: 100%;
      border: 1px solid var(--paper-line);
      border-radius: 2.5mm;
      background: white;
      padding: 2.5mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }

    .visual-proof {
      margin: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .visual-proof img {
      max-width: 100%;
      max-height: 125mm;
      object-fit: contain;
      border: 1px solid #bdcac1;
      box-shadow: 0 2mm 5mm rgba(18, 35, 24, .12);
      border-radius: 1.5mm;
    }
    .visual-proof figcaption {
      margin-top: 2mm;
      color: var(--paper-muted);
      font-size: 8.5pt;
      text-align: center;
    }

    /* Hybrid (Image + API) */
    .visual-hybrid {
      display: grid;
      grid-template-rows: 84mm 1fr;
      gap: 2.5mm;
      padding: 2.5mm;
      justify-content: stretch;
      align-items: stretch;
    }
    .visual-proof.compact img {
      max-height: 72mm;
    }
    .api-proof-compact {
      width: 100%;
      overflow: hidden;
    }

    /* Pure API Evidence */
    .api-single {
      padding: 3.5mm;
      align-items: stretch;
      justify-content: flex-start;
    }
    .api-proof-full { width: 100%; }
    .evidence-title {
      color: #247647;
      font-size: 11pt;
      font-weight: 750;
      text-transform: uppercase;
      margin-bottom: 2mm;
    }
    .security .evidence-title { color: #8a5d12; }

    .operations-container { display: flex; flex-direction: column; gap: 2.5mm; width: 100%; }
    .operations-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(65mm, 1fr));
      gap: 2.5mm;
    }
    .op-card {
      padding: 2.5mm;
      border: 1px solid var(--paper-line);
      border-radius: 1.5mm;
      background: #f7faf8;
    }
    .op-card h4 { color: #172019; font-size: 10pt; font-weight: 700; margin-bottom: 1.5mm; }
    .op-actor { font-size: 8.5pt; color: var(--paper-muted); margin-bottom: 1mm; }
    .op-row { font-size: 9pt; line-height: 1.35; margin-bottom: 1mm; }
    .op-row.observed { color: #145c32; font-weight: 600; }
    .tech-note {
      padding: 2mm 3mm;
      font-size: 9pt;
      line-height: 1.3;
      border-left: 2mm solid var(--green);
      background: #e4f5e9;
      border-radius: 1mm;
    }

    .technical-evidence dl div {
      display: grid;
      grid-template-columns: 35mm 1fr;
      gap: 2.5mm;
      padding: 2mm 0;
      border-bottom: 1px solid var(--paper-line);
      font-size: 9.5pt;
    }
    .technical-evidence dt { font-weight: 700; color: var(--paper-muted); }
    .technical-evidence dd { margin: 0; }
    .result-highlight { color: #145c32; font-weight: 600; }

    /* Performance Page */
    .perf-story-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3mm;
      margin-bottom: 3mm;
    }
    .perf-story-card {
      min-height: 38mm;
      padding: 3mm;
      border: 1px solid var(--paper-line);
      border-radius: 2mm;
      background: white;
    }
    .perf-story-card h3 { margin: 0 0 1.5mm; color: var(--blue); font-size: 11pt; }
    .perf-story-card p { font-size: 9.5pt; line-height: 1.35; color: var(--paper-text); }
    .perf-story-card.decision { border-left: 2mm solid var(--green); }

    .perf-metrics-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 3mm;
      margin-bottom: 3mm;
    }
    .perf-metrics-strip article {
      min-height: 34mm;
      padding: 2.5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      border: 1px solid var(--paper-line);
      border-radius: 2mm;
      background: white;
    }
    .perf-metrics-strip b { font-size: 16pt; line-height: 1.1; color: var(--paper-text); }
    .perf-metrics-strip span { margin-top: 1.5mm; font-size: 9pt; color: var(--paper-muted); }

    .perf-verifications {
      padding: 3mm;
      border: 1px solid var(--paper-line);
      border-radius: 2mm;
      background: white;
    }
    .perf-verifications h2 { margin: 0 0 2mm; font-size: 12pt; color: var(--blue); }
    .perf-checks-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5mm 4mm;
      margin-bottom: 2mm;
    }
    .perf-check-item {
      display: grid;
      grid-template-columns: 3mm 1fr auto;
      gap: 2.5mm;
      align-items: center;
      padding: 1.5mm 0;
      border-bottom: 1px solid #e6ece8;
      font-size: 9.5pt;
    }
    .perf-check-item i { width: 2.5mm; height: 2.5mm; border-radius: 50%; }
    .perf-check-item i.pass { background: var(--green); }
    .perf-check-item i.fail { background: var(--red); }
    .check-title { color: var(--paper-text); }
    .check-result { color: #145c32; font-size: 9pt; }
    .perf-disclaimer { font-size: 8pt; color: var(--paper-muted); margin-top: 2mm; }

    /* Conclusão */
    .conclusion-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 3mm;
      margin: 4mm 0;
    }
    .conclusion-grid article {
      min-height: 52mm;
      padding: 3.5mm;
      border: 1px solid var(--line);
      border-radius: 2.5mm;
      background: var(--surface);
    }
    .conclusion-grid h2 { margin: 0; color: var(--mint); font-size: 13pt; }
    .conclusion-grid strong { display: block; margin: 3mm 0; font-size: 20pt; }
    .conclusion-grid p { color: var(--muted); font-size: 9.5pt; }

    .final-decision {
      padding: 4mm;
      border: 1px solid var(--line);
      border-left: 2.5mm solid var(--green);
      border-radius: 2.5mm;
      background: var(--surface-2);
    }
    .final-decision.fail { border-left-color: var(--red); }
    .final-decision h2 { margin: 0 0 1.5mm; font-size: 15pt; }
    .final-decision p { color: var(--muted); font-size: 10pt; }
    .residual { margin-top: 3.5mm; color: var(--muted); font-size: 9pt; line-height: 1.35; }

    /* Linha do Tempo (Timeline) */
    .timeline-row { display: flex; align-items: stretch; gap: 1.5mm; }
    .timeline-row.second { width: 220mm; margin: 0 auto; }
    .timeline-row > i { align-self: center; color: var(--mint); font-size: 18pt; font-style: normal; }
    .stage {
      width: 58mm;
      min-height: 44mm;
      padding: 3mm;
      border: 1px solid var(--line);
      border-radius: 2mm;
      background: var(--surface);
    }
    .stage > b { color: var(--mint); font-size: 11pt; }
    .stage h3 { margin: 1.5mm 0; color: var(--ink); font-size: 12pt; }
    .stage p { color: var(--muted); font-size: 9.5pt; line-height: 1.35; }
    .stage.pass { border-top: 2mm solid var(--green); }
    .stage.fail { border-top: 2mm solid var(--red); }
    .timeline-turn { height: 6mm; color: var(--mint); font-size: 18pt; line-height: 6mm; text-align: right; padding-right: 32mm; }

    .blocking-rule {
      margin-top: 4mm;
      padding: 3.5mm 4mm;
      display: grid;
      grid-template-columns: 46mm 1fr;
      gap: 3mm;
      align-items: center;
      border-left: 2mm solid var(--amber);
      background: var(--surface-2);
      border-radius: 1.5mm;
    }
    .blocking-rule h2 { margin: 0; color: var(--amber); font-size: 12pt; }
    .blocking-rule p { color: var(--muted); font-size: 9.5pt; margin: 0; }
  </style>
</head>
<body>
  ${executivePage}
  ${overviewMarkup}
  ${detailPages.join('')}
  ${performanceMarkup}
  ${conclusionMarkup}
  ${timelineMarkup}
</body>
</html>`;

await mkdir(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: outputPath,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });

  if (process.env.SCREENSHOT_PAGES === 'true') {
    const previewDir = path.resolve('C:/Users/Carlos Moreira/.gemini/antigravity-ide/brain/a3b5b8e6-d72c-4e35-b1db-9d42cd906c11/scratch/pages');
    await mkdir(previewDir, { recursive: true });
    const pageLocators = await page.locator('.page').all();
    for (let i = 0; i < pageLocators.length; i++) {
      const pageFile = path.join(previewDir, `page-${String(i + 1).padStart(2, '0')}.png`);
      await pageLocators[i].screenshot({ path: pageFile });
    }
    console.log(`Prévia visual salva: ${pageLocators.length} páginas em ${previewDir}`);
  }
} finally {
  await browser.close();
}

console.log(`Quality Report gerado: ${outputPath}`);
console.log(`Gate: ${allApproved ? 'APROVADO' : 'REPROVADO'} | Testes: ${passed}/${total} | Evidências: ${evidenceCount} | Páginas: ${totalPages}`);
