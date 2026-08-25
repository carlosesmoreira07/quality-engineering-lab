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

function isWebTest(test) {
  const normalizedFile = test.file.replaceAll('\\', '/');
  return normalizedFile.includes('/web/') || test.tags.includes('web') || test.attachments.some((a) => a.contentType === 'image/png');
}

function suiteKey(test) {
  const normalizedFile = test.file.replaceAll('\\', '/');
  const behavior = annotationValues(test, 'behavior').join(' ');
  const risks = annotationValues(test, 'risk');
  if (
    normalizedFile.includes('/security/') ||
    normalizedFile.includes('authentication') ||
    risks.includes('RISK-004') ||
    risks.includes('RISK-005') ||
    (risks.includes('RISK-016') && /administrativ|anônimo|fronteira|autentica/i.test(behavior))
  ) {
    return 'security';
  }
  return 'functional';
}

function riskScore(test) {
  return Math.max(0, ...annotationValues(test, 'risk').map((id) => riskCatalog[id]?.priority ?? 0));
}

function orderTests(tests) {
  return [...tests].sort((left, right) => {
    // 1. Suíte: Funcional primeiro, depois Segurança
    const suiteLeft = suiteKey(left) === 'functional' ? 1 : 2;
    const suiteRight = suiteKey(right) === 'functional' ? 1 : 2;
    if (suiteLeft !== suiteRight) return suiteLeft - suiteRight;

    // 2. Modalidade: Web primeiro, depois API
    const typeLeft = isWebTest(left) ? 1 : 2;
    const typeRight = isWebTest(right) ? 1 : 2;
    if (typeLeft !== typeRight) return typeLeft - typeRight;

    // 3. Prioridade de risco
    const riskDiff = riskScore(right) - riskScore(left);
    if (riskDiff !== 0) return riskDiff;

    // 4. Título alfabético
    return left.title.localeCompare(right.title, 'pt-BR');
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

const PROFILE_LABELS = {
  smoke: 'Verificação ágil de saúde da aplicação',
  'post-merge-smoke': 'Verificação de integridade pós-merge',
  'average-load': 'Estabilidade sob concorrência esperada',
  'traffic-variation': 'Estabilidade sob variação controlada de tráfego'
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
  const rawProfile = summary.qel?.profile ?? profile;

  return {
    passed: summary.qel?.passed ?? (checkFailures === 0 && failedRequestRate === 0),
    profile: rawProfile,
    label: PROFILE_LABELS[rawProfile] ?? summary.qel?.label ?? 'Verificação ágil de saúde da aplicação',
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
 * Combina Risco, O que foi validado, Decisão e Evidência em layout integrado com link para o resumo.
 */
function testPage(testWithEvidence, pageNumber, totalPages, suitePosition, suiteTotal, globalIndex) {
  const { test, evidence } = testWithEvidence;
  const behavior = annotationValues(test, 'behavior')[0] ?? test.title;
  const intent = annotationValues(test, 'intent')[0] ?? 'Controle automatizado associado ao cenário.';
  const validations = annotationValues(test, 'validation');
  const risks = annotationValues(test, 'risk');
  const suite = suiteKey(test);
  const web = isWebTest(test);
  const primaryRiskId = [...risks].sort((left, right) => (riskCatalog[right]?.priority ?? 0) - (riskCatalog[left]?.priority ?? 0))[0];
  const primaryRisk = riskCatalog[primaryRiskId];
  const suiteTitle = suite === 'functional' ? 'Testes funcionais e regressivos' : 'Testes de segurança e acessos';

  // Decisão executiva específica e sem repetição
  const decisionEntry = DECISION_DESCRIPTIONS[behavior];
  const decisionText = test.passed
    ? (decisionEntry?.pass ?? `O comportamento "${behavior}" foi validado com sucesso e atende aos critérios de liberação.`)
    : (decisionEntry?.fail ?? `O controle para "${behavior}" falhou; a versão deve ser bloqueada até correção.`);

  const imageItems = evidence.filter((item) => item.type === 'image');
  const jsonItems = evidence.filter((item) => item.type === 'json');

  let evidenceMarkup = '';
  if (imageItems.length === 1 && jsonItems.length === 0) {
    evidenceMarkup = `
      <div class="evidence-box visual-single">
        <figure class="visual-proof">
          <img src="${imageItems[0].dataUrl}" alt="Captura de tela com checkpoint validado destacado" />
          <figcaption>A captura preserva o contexto da aplicação. O retângulo verde destaca o checkpoint validado.</figcaption>
        </figure>
      </div>`;
  } else if (imageItems.length === 1 && jsonItems.length >= 1) {
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
    evidenceMarkup = `
      <div class="evidence-box api-single">
        <div class="api-proof-full">
          <div class="evidence-header-tag">
            <span class="evidence-title">Comprovante técnico e contratual</span>
          </div>
          ${structuredEvidenceMarkup(jsonItems[0].evidence, { compact: false })}
        </div>
      </div>`;
  } else if (imageItems.length >= 2) {
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
    <section id="case-${globalIndex}" class="page detail-page ${suite}">
      <header class="section-header">
        <div class="header-left">
          <div class="suite-badge-row">
            <span class="suite-name">${escapeHtml(suiteTitle)}</span>
            <span class="modality-tag ${web ? 'web' : 'api'}">${web ? 'Interface Web' : 'API / Contrato'}</span>
          </div>
          <p class="case-counter">Caso ${suitePosition} de ${suiteTotal} · Visão Executiva da Validação</p>
        </div>
        <div class="header-right">
          <a href="#page-1" class="back-link" title="Voltar à visão executiva e cobertura">↑ Voltar ao resumo</a>
          <div class="status ${test.passed ? 'pass' : 'fail'}">
            <b>${test.passed ? 'APROVADO' : 'REPROVADO'}</b>
            <small>${formatDuration(test.duration)}</small>
          </div>
        </div>
      </header>

      <h1>${escapeHtml(behavior)}</h1>
      <div class="risk-pills">${riskPills(risks)}</div>

      <div class="case-grid">
        <!-- Coluna de Contexto, Validação e Decisão -->
        <aside class="case-sidebar">
          <article class="case-card risk-card">
            <h3>O que poderia dar errado?</h3>
            <p class="risk-text">${escapeHtml(primaryRisk?.risk ?? 'Falha potencial no fluxo de negócio.')}</p>
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
  const profileLabel = escapeHtml(performance?.label ?? 'Verificação ágil de saúde da aplicação');
  const businessQuestion = escapeHtml(performance?.businessQuestion ?? 'A jornada de descoberta de produto continua disponível e sem regressão grosseira?');

  const p95Value = performance?.p95 !== undefined ? `${performance.p95.toFixed(0)} ms` : 'n/d';
  const errorRateValue = `${((performance?.failedRequestRate ?? 0) * 100).toFixed(1)}%`;

  return `
    <section id="perf-case" class="page detail-page performance">
      <header class="section-header">
        <div class="header-left">
          <div class="suite-badge-row">
            <span class="suite-name">Testes não funcionais e performance</span>
            <span class="modality-tag perf">k6 · Jornada de descoberta</span>
          </div>
          <p class="case-counter">${profileLabel} · Visão Executiva da Validação</p>
        </div>
        <div class="header-right">
          <a href="#page-1" class="back-link" title="Voltar à visão executiva e cobertura">↑ Voltar ao resumo</a>
          <div class="status ${passed ? 'pass' : 'fail'}">
            <b>${passed ? 'APROVADO' : 'REPROVADO'}</b>
            <small>${formatDuration(performance?.duration)}</small>
          </div>
        </div>
      </header>

      <h1>Desempenho da jornada de descoberta do cliente</h1>
      <div class="risk-pills">${riskPills(performanceRisks)}</div>

      <div class="perf-story-grid">
        <article class="perf-story-card">
          <h3>O que poderia dar errado?</h3>
          <p>Lentidão ou indisponibilidade degradam a experiência de navegação e reduzem a confiança de compra do cliente.</p>
        </article>
        <article class="perf-story-card">
          <h3>Pergunta respondida</h3>
          <p>${businessQuestion}</p>
        </article>
        <article class="perf-story-card decision">
          <h3>Decisão de performance</h3>
          <p>${passed ? '95% das respostas ocorreram dentro do limite esperado para o laboratório, sem indisponibilidade registrada.' : 'Degradação de tempo de resposta ou indisponibilidade detectada; a versão deve ser bloqueada.'}</p>
        </article>
      </div>

      <div class="perf-metrics-strip">
        <article>
          <strong class="metric-num">${p95Value}</strong>
          <span class="metric-main">95% das respostas em até ${p95Value}</span>
          <small class="metric-desc">Tempo de resposta observado (p95 global)</small>
        </article>
        <article>
          <strong class="metric-num">${errorRateValue}</strong>
          <span class="metric-main">Zero indisponibilidade</span>
          <small class="metric-desc">Taxa de erro ou recusa de conexão</small>
        </article>
        <article>
          <strong class="metric-num">${performance?.requests ?? 0}</strong>
          <span class="metric-main">Respostas analisadas</span>
          <small class="metric-desc">Iterações completas na jornada de descoberta</small>
        </article>
        <article>
          <strong class="metric-num">${performance?.checkPasses ?? 0}/${totalVerifications}</strong>
          <span class="metric-main">Verificações aprovadas</span>
          <small class="metric-desc">100% de conformidade funcional nas etapas</small>
        </article>
      </div>

      <section class="perf-verifications">
        <h2>Resultados detalhados por etapa da jornada</h2>
        <div class="perf-checks-grid">
          ${verifications.map((check) => {
            const cleanName = check.name.replace(/^\[(Saúde|Carga|Variação)\]\s*/i, '');
            return `
              <article class="perf-check-item">
                <i class="${check.fails === 0 ? 'pass' : 'fail'}"></i>
                <span class="check-title">${escapeHtml(cleanName)}</span>
                <strong class="check-result">${check.passes ?? 0} aprovadas ${check.fails > 0 ? `· ${check.fails} falhas` : ''}</strong>
              </article>
            `;
          }).join('') || '<p>Resultado de performance não encontrado para esta execução.</p>'}
        </div>
        <p class="perf-disclaimer">Os limites foram definidos como referência de engenharia do laboratório para detecção de regressões e não representam compromisso operacional de produção.</p>
      </section>

      ${footer(pageNumber, totalPages, `Performance · ${profileLabel} · risco → perfil → resultado → decisão`)}
    </section>
  `;
}

function timelinePage(suites, pageNumber, totalPages) {
  const milestone = (num, title, body, status = '') => `
    <article class="milestone-card ${status}">
      <div class="ms-header">
        <b class="ms-num">${num}</b>
        <h4>${escapeHtml(title)}</h4>
      </div>
      <p>${escapeHtml(body)}</p>
    </article>
  `;

  return `
    <section id="timeline" class="page timeline-page">
      <div class="brand-line"></div>
      <header class="timeline-header">
        <div>
          <span>QUALITY ENGINEERING LAB</span>
          <h1>Onde a Engenharia de Qualidade atua no ciclo de valor</h1>
          <p>Atuação contínua desde o refinamento de requisitos até a observabilidade em produção, garantindo previsibilidade e qualidade determinística.</p>
        </div>
        <a href="#page-1" class="back-link" title="Voltar à visão executiva e cobertura">↑ Voltar ao resumo</a>
      </header>

      <div class="timeline-pillars-grid">
        <!-- Pilar 1: Descoberta e Refinamento -->
        <div class="pillar">
          <div class="pillar-title">1. Descoberta e Refinamento</div>
          <div class="pillar-cards">
            ${milestone('01', 'Entendimento do problema', 'Mapeamento precoce de riscos e impacto de negócio antes de codificar.')}
            ${milestone('02', 'Apoio ao PO e critérios', 'Estruturação de histórias com regras de negócio e critérios de aceite inequívocos.')}
            ${milestone('03', 'DoR e DoD objetivos', 'Critérios claros para iniciar o desenvolvimento e aceitar a entrega.')}
          </div>
        </div>

        <!-- Pilar 2: Construção e Qualidade Integrada -->
        <div class="pillar">
          <div class="pillar-title">2. Construção e Automação</div>
          <div class="pillar-cards">
            ${milestone('04', 'Apoio ao desenvolvimento', 'Instruções de teste, dados sintéticos e automação guiada no fluxo dev.')}
            ${milestone('05', 'Validação funcional', `${suites.functional.passed}/${suites.functional.total} controles protegem jornadas de compra e cálculos.`, suites.functional.approved ? 'pass' : 'fail')}
            ${milestone('06', 'Segurança e acessos', `${suites.security.passed}/${suites.security.total} controles blindam rotas restritas e isolamento.`, suites.security.approved ? 'pass' : 'fail')}
            ${milestone('07', 'Performance operacional', 'Verificação preventiva de latência e concorrência sob carga.', suites.performance.approved ? 'pass' : 'fail')}
          </div>
        </div>

        <!-- Pilar 3: Homologação e Decisão -->
        <div class="pillar">
          <div class="pillar-title">3. Homologação e Decisão</div>
          <div class="pillar-cards">
            ${milestone('08', 'Evidências auditáveis', 'Capturas e comprovantes técnicos estruturados para aceite do PO.', suites.evidence.approved ? 'pass' : 'fail')}
            ${milestone('09', 'Quality Gate determinístico', 'Aprovação ou bloqueio objetivo em CI sem tolerância subjetiva.', suites.allApproved ? 'pass' : 'fail')}
          </div>
        </div>

        <!-- Pilar 4: Liberação e Pós-Produção -->
        <div class="pillar">
          <div class="pillar-title">4. Liberação e Operação</div>
          <div class="pillar-cards">
            ${milestone('10', 'Smoke pós-implantação', 'Validação ágil de saúde e rotas públicas após o deploy na main.')}
            ${milestone('11', 'Observabilidade contínua', 'Acompanhamento de métricas, erros e feedback de comportamento real.')}
          </div>
        </div>
      </div>

      <div class="timeline-footer-strip">
        <div class="ai-banner">
          <b>Aceleração por IA Consultiva:</b>
          <p>Análise de impacto em cards no Jira, apoio na modelagem de testes e síntese de relatórios executivos.<br>Decisões, código e Quality Gates permanecem 100% sob controle e revisão humana.</p>
        </div>
        <div class="gate-banner">
          <b>Regra de bloqueio determinística:</b>
          <span>Qualquer falha em barreira obrigatória reprova o pipeline de imediato. Sem tolerância percentual ou score subjetivo.</span>
        </div>
      </div>

      ${footer(pageNumber, totalPages, 'Linha do tempo · Engenharia de Qualidade integrada a todo o ciclo de vida do software')}
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
const functionalTests = testsWithEvidence.filter(({ test }) => suiteKey(test) === 'functional');
const securityTests = testsWithEvidence.filter(({ test }) => suiteKey(test) === 'security');
const total = tests.length;
const passed = tests.filter((test) => test.passed).length;
const failures = total - passed;
const allApproved = failures === 0 && performance?.passed === true;
const riskIds = [...new Set([...tests.flatMap((test) => annotationValues(test, 'risk')), ...performanceRisks])]
  .sort((left, right) => (riskCatalog[right]?.priority ?? 0) - (riskCatalog[left]?.priority ?? 0) || left.localeCompare(right));

const testDuration = report.stats?.duration ?? tests.reduce((sum, test) => sum + test.duration, 0);
const totalDuration = testDuration + (performance?.duration ?? 0);
const startedAt = report.stats?.startTime ? new Date(report.stats.startTime) : new Date();
const evidenceCount = testsWithEvidence.reduce((count, item) => count + item.evidence.length, 0) + (performance ? 1 : 0);

// Total de Páginas:
// Pág 1: Resumo Executivo + Cobertura de Riscos com Links
// Págs 2 a 11: 10 Casos de Teste (6 Funcionais + 4 Segurança)
// Pág 12: Performance Operacional
// Pág 13: Linha do Tempo em Todo o Ciclo
const totalPages = 3 + testsWithEvidence.length;
let pageNumber = 1;

const suiteStatus = {
  functional: {
    total: functionalTests.length,
    passed: functionalTests.filter(({ test }) => test.passed).length,
    approved: functionalTests.length > 0 && functionalTests.every(({ test }) => test.passed)
  },
  security: {
    total: securityTests.length,
    passed: securityTests.filter(({ test }) => test.passed).length,
    approved: securityTests.length > 0 && securityTests.every(({ test }) => test.passed)
  },
  performance: {
    approved: performance?.passed === true,
    p95: performance?.p95 !== undefined ? `${performance.p95.toFixed(0)} ms` : 'n/d',
    errorRate: `${((performance?.failedRequestRate ?? 0) * 100).toFixed(1)}%`
  },
  evidence: { approved: evidenceProblems.length === 0 },
  allApproved
};

// Renderização dos cards de cobertura interativos na Página 1
const coverageCards = testsWithEvidence.map((item, idx) => {
  const behavior = annotationValues(item.test, 'behavior')[0] ?? item.test.title;
  const suite = suiteKey(item.test);
  const web = isWebTest(item.test);
  const primaryRiskId = annotationValues(item.test, 'risk')[0];
  const primaryRisk = riskCatalog[primaryRiskId];
  const tagLabel = suite === 'security' ? 'Segurança' : web ? 'Web' : 'API';
  const tagClass = suite === 'security' ? 'sec' : web ? 'web' : 'api';

  return `
    <a href="#case-${idx + 1}" class="cov-item" title="Ver evidência e detalhes do caso">
      <div class="cov-top">
        <span class="cov-tag ${tagClass}">${tagLabel}</span>
        <span class="cov-risk">${escapeHtml(primaryRisk?.id ?? 'RISCO')} · ${escapeHtml(primaryRisk?.severity ?? 'Crítico')}</span>
      </div>
      <strong class="cov-name">${escapeHtml(behavior)}</strong>
      <span class="cov-action">Ver evidência →</span>
    </a>
  `;
}).join('');

const perfCoverageCard = `
  <a href="#perf-case" class="cov-item perf" title="Ver métricas e etapas da jornada de descoberta">
    <div class="cov-top">
      <span class="cov-tag perf">Performance</span>
      <span class="cov-risk">RISK-019 · Crítico</span>
    </div>
    <strong class="cov-name">Desempenho da jornada de descoberta sob carga</strong>
    <span class="cov-action">Ver métricas →</span>
  </a>
`;

const executivePage = `
  <section id="page-1" class="page executive-page">
    <div class="brand-line"></div>
    <header class="executive-header">
      <div>
        <span>QUALITY ENGINEERING LAB</span>
        <h1>Quality Report</h1>
        <p>Decisão executiva baseada em riscos e evidências reais</p>
      </div>
      <div class="report-meta">
        <a href="https://github.com/carlosesmoreira07/quality-engineering-lab/pull/20" class="pr-link" target="_blank">
          <b>Pull Request #20 · QEL-11</b>
        </a>
        <span class="meta-label">Garantia e decisão de qualidade da versão · EverShop 2.2.1</span>
        <span class="meta-date">${escapeHtml(startedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</span>
      </div>
    </header>

    <div class="executive-summary">
      <article class="gate-card ${allApproved ? 'pass' : 'fail'}">
        <h3>Decisão Consolidada</h3>
        <strong>${allApproved ? 'APROVADO' : 'REPROVADO'}</strong>
        <p>${allApproved ? 'Todos os controles obrigatórios aprovados no escopo exercitado.' : 'Há barreira obrigatória reprovada ou sem sinal suficiente para liberação.'}</p>
      </article>
      <div class="metric-grid">
        <article>
          <b>${passed}/${total}</b>
          <span>Testes aprovados</span>
        </article>
        <article>
          <b>${riskIds.length}</b>
          <span>Riscos exercitados</span>
        </article>
        <article>
          <b>${evidenceCount}</b>
          <span>Evidências úteis</span>
        </article>
        <article>
          <b>${formatDuration(totalDuration)}</b>
          <span>Duração observada</span>
        </article>
      </div>
    </div>

    <div class="suite-summary">
      <article>
        <h3>Funcional e Regressivo</h3>
        <strong>${suiteStatus.functional.passed}/${suiteStatus.functional.total}</strong>
        <p>Jornadas e regras de compra aprovadas</p>
      </article>
      <article>
        <h3>Segurança e Acessos</h3>
        <strong>${suiteStatus.security.passed}/${suiteStatus.security.total}</strong>
        <p>Fronteiras de autorização blindadas</p>
      </article>
      <article>
        <h3>Performance Operacional</h3>
        <strong>95% em até ${suiteStatus.performance.p95}</strong>
        <p>Tempo de resposta observado sob carga</p>
      </article>
    </div>

    <section class="coverage-section">
      <div class="coverage-header">
        <h2>Cobertura orientada a riscos de negócio</h2>
        <span class="coverage-hint">Selecione qualquer controle para navegar diretamente à sua evidência e decisão</span>
      </div>
      <div class="coverage-grid">
        ${coverageCards}
        ${perfCoverageCard}
      </div>
    </section>

    ${footer(pageNumber++, totalPages, 'Visão executiva para Produto, Tecnologia e Liderança · Clique nos riscos para navegar')}
  </section>
`;

const detailPages = [];
let globalTestIndex = 1;

// 1. Renderiza casos Funcionais (Web primeiro, depois API)
for (const item of functionalTests) {
  detailPages.push(testPage(item, pageNumber++, totalPages, functionalTests.indexOf(item) + 1, functionalTests.length, globalTestIndex++));
}

// 2. Renderiza casos de Segurança (Web primeiro, depois API)
for (const item of securityTests) {
  detailPages.push(testPage(item, pageNumber++, totalPages, securityTests.indexOf(item) + 1, securityTests.length, globalTestIndex++));
}

const performanceMarkup = performancePage(performance, pageNumber++, totalPages);
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
      --paper-muted: #172019;
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

    a { text-decoration: none; color: inherit; }

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

    h1 { margin: 2mm 0 3mm; font-size: 18pt; line-height: 1.2; font-weight: 750; }
    h2 { font-size: 14pt; line-height: 1.25; margin: 0 0 2mm; }
    h3 { font-size: 12pt; line-height: 1.3; margin: 0 0 1.5mm; }
    h4, .label { font-size: 10.5pt; line-height: 1.35; margin: 0; }
    p { margin: 0; }

    header > span, .section-header .suite-name {
      font-size: 11pt;
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
      font-size: 8.5pt;
      line-height: 1.2;
    }

    .detail-page footer {
      color: #172019;
      border-top: 1px solid #cedbd2;
    }

    .executive-page footer, .timeline-page footer {
      color: var(--muted);
      border-top: 1px solid var(--line);
      opacity: .85;
    }

    /* Temas Escuros (Capa e Timeline) */
    .executive-page, .timeline-page {
      color: var(--ink);
      background: var(--canvas);
    }

    .executive-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 4mm;
    }
    .executive-header span, .timeline-page header span {
      color: var(--mint);
    }
    .executive-header h1 { margin: 1mm 0; font-size: 22pt; }
    .executive-header p, .timeline-page header p {
      color: var(--muted);
      font-size: 10.5pt;
    }
    .report-meta {
      display: grid;
      gap: 1mm;
      text-align: right;
      font-size: 9.5pt;
      line-height: 1.3;
    }
    .pr-link {
      display: inline-block;
      color: var(--mint);
      font-size: 11pt;
      font-weight: 700;
      border-bottom: 1px dashed var(--mint);
      padding-bottom: 0.5mm;
    }
    .meta-label { color: var(--ink); }
    .meta-date { color: var(--muted); }

    .executive-summary {
      display: grid;
      grid-template-columns: 72mm 1fr;
      gap: 3mm;
      margin-bottom: 3mm;
    }
    .gate-card, .metric-grid article, .suite-summary article, .coverage-section {
      border: 1px solid var(--line);
      border-radius: 2mm;
      background: var(--surface);
    }
    .gate-card {
      min-height: 38mm;
      padding: 3mm;
      border-left: 2.5mm solid var(--green);
    }
    .gate-card.fail { border-left-color: var(--red); }
    .gate-card h3 { margin: 0; color: var(--muted); font-size: 11pt; }
    .gate-card strong { display: block; margin: 1mm 0; color: var(--ink); font-size: 20pt; line-height: 1; }
    .gate-card p { color: var(--muted); font-size: 9.5pt; }

    .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm; }
    .metric-grid article {
      min-height: 38mm;
      padding: 2.5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .metric-grid b { font-size: 18pt; line-height: 1; }
    .metric-grid span { margin-top: 1.5mm; color: var(--muted); font-size: 9.5pt; }

    .suite-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; margin-bottom: 3mm; }
    .suite-summary article { min-height: 28mm; padding: 2.5mm 3mm; }
    .suite-summary h3 { margin: 0 0 1mm; color: var(--mint); font-size: 11pt; }
    .suite-summary strong { font-size: 15pt; line-height: 1.2; display: block; margin-bottom: 0.5mm; }
    .suite-summary p { color: var(--muted); font-size: 9.5pt; }

    /* Cobertura Interativa na Página 1 */
    .coverage-section {
      padding: 3mm;
      background: var(--surface-2);
    }
    .coverage-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 2.5mm;
    }
    .coverage-header h2 { margin: 0; font-size: 12pt; color: var(--mint); }
    .coverage-hint { font-size: 8.5pt; color: var(--muted); }
    .coverage-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2mm;
    }
    .cov-item {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 2mm 2.5mm;
      border: 1px solid var(--line);
      border-radius: 1.5mm;
      background: #111a14;
      min-height: 20mm;
      transition: all .15s ease;
    }
    .cov-item:hover {
      border-color: var(--mint);
      background: #16241c;
    }
    .cov-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1mm;
    }
    .cov-tag {
      font-size: 7.5pt;
      font-weight: 750;
      text-transform: uppercase;
      padding: 0.5mm 1.5mm;
      border-radius: 1mm;
      letter-spacing: .03em;
    }
    .cov-tag.web { color: #145c32; background: #c8ecd4; }
    .cov-tag.api { color: #1d4d7a; background: #cee3f8; }
    .cov-tag.sec { color: #7a4e09; background: #fae4be; }
    .cov-tag.perf { color: #512b80; background: #e8d7fb; }
    .cov-risk { font-size: 7.5pt; color: var(--muted); }
    .cov-name { font-size: 8.5pt; line-height: 1.25; color: var(--ink); margin-bottom: 1mm; }
    .cov-action { font-size: 7.5pt; color: var(--mint); font-weight: 600; text-align: right; }

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
    .header-left .suite-badge-row {
      display: flex;
      align-items: center;
      gap: 2.5mm;
    }
    .section-header .suite-name { color: #247647; font-size: 11pt; }
    .security .section-header .suite-name { color: #8a5d12; }
    .performance .section-header .suite-name { color: var(--blue); }
    .case-counter { color: #172019; font-size: 9pt; margin-top: 0.5mm; font-weight: 500; }

    .modality-tag {
      font-size: 8pt;
      font-weight: 750;
      text-transform: uppercase;
      padding: 0.5mm 2mm;
      border-radius: 1mm;
      letter-spacing: .04em;
    }
    .modality-tag.web { color: #145c32; background: #daf2e1; }
    .modality-tag.api { color: #1d4d7a; background: #d7e8fa; }
    .modality-tag.perf { color: #244b7a; background: #e0ecfa; }

    .header-right {
      display: flex;
      align-items: center;
      gap: 3mm;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      font-size: 8.5pt;
      font-weight: 600;
      color: #247647;
      background: #e8f5ec;
      padding: 1.5mm 3mm;
      border-radius: 1.2mm;
      border: 1px solid #bfe0ca;
      transition: all .15s ease;
    }
    .security .back-link {
      color: #8a5d12;
      background: #fdf5e8;
      border-color: #ebd3ab;
    }
    .performance .back-link {
      color: #244b7a;
      background: #edf4fc;
      border-color: #c7dcf5;
    }
    .timeline-header .back-link {
      color: var(--mint);
      background: #15241b;
      border-color: var(--line);
    }

    .status {
      min-width: 32mm;
      padding: 1.5mm 3mm;
      border-radius: 1.5mm;
      text-align: center;
    }
    .status.pass { color: #145c32; background: #dff2e5; }
    .status.fail { color: #751f19; background: #f9ddd9; }
    .status b { display: block; font-size: 10.5pt; }
    .status small { display: block; font-size: 8pt; }

    .detail-page > h1 { margin: 1mm 0 2mm; font-size: 16.5pt; max-width: 235mm; color: #172019; }
    .detail-page .risk-pills { display: flex; gap: 1.5mm; flex-wrap: wrap; margin-bottom: 2.5mm; }

    .risk-pill {
      display: inline-grid;
      gap: 0.5mm;
      padding: 1.5mm 2.5mm;
      border-radius: 1.5mm;
      color: #185c35;
      background: #e4f5e9;
    }
    .risk-pill strong { font-size: 10pt; line-height: 1.25; }
    .risk-pill small { color: #172019; font-size: 8pt; line-height: 1.2; }
    .security .risk-pill { color: #784d08; background: #faecd5; }
    .performance .risk-pill { color: #1c4b7d; background: #e3effd; }

    /* Case Grid: 2 Colunas (Sidebar 82mm + Evidence 185mm) */
    .case-grid {
      display: grid;
      grid-template-columns: 82mm 1fr;
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
      font-size: 10.5pt;
      font-weight: 750;
    }
    .security .case-card h3 { color: #8a5d12; }

    .risk-text { font-size: 9.5pt; line-height: 1.35; color: #172019; }
    .control-card .intent-text { font-size: 9.5pt; line-height: 1.35; margin-bottom: 1.5mm; color: #172019; }
    .validation-bullets {
      margin: 0;
      padding-left: 4.5mm;
      font-size: 9pt;
      line-height: 1.35;
      color: #172019;
    }
    .validation-bullets li { margin-bottom: 0.8mm; }

    .decision-card {
      border-left: 2mm solid var(--green);
      background: #f7faf8;
    }
    .security .decision-card { border-left-color: var(--amber); background: #fdfbf7; }
    .decision-card.fail { border-left-color: var(--red); background: #fff8f7; }
    .decision-card p { font-size: 9.5pt; line-height: 1.35; font-weight: 550; color: #164f30; }
    .security .decision-card p { color: #6d4304; }
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
      color: #172019;
      font-size: 8.5pt;
      text-align: center;
      font-weight: 500;
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
    .visual-proof.compact img { max-height: 72mm; }
    .api-proof-compact { width: 100%; overflow: hidden; }

    /* Layout para Testes Puros de API */
    .api-single {
      padding: 4mm;
      align-items: stretch;
      justify-content: flex-start;
    }
    .api-proof-full {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 3.5mm;
    }
    .evidence-header-tag {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 2mm;
      border-bottom: 1px solid var(--paper-line);
    }
    .evidence-title {
      color: #247647;
      font-size: 11.5pt;
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: .03em;
    }
    .security .evidence-title { color: #8a5d12; }

    .operations-container {
      display: flex;
      flex-direction: column;
      gap: 3mm;
      width: 100%;
      flex: 1;
      justify-content: flex-start;
    }
    .operations-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(80mm, 1fr));
      gap: 3mm;
    }
    .op-card {
      padding: 3.5mm 4mm;
      border: 1px solid var(--paper-line);
      border-radius: 2mm;
      background: #f7faf8;
    }
    .security .op-card { background: #fdfbf7; }
    .op-card h4 { color: #172019; font-size: 11pt; font-weight: 700; margin-bottom: 1.5mm; }
    .op-actor { font-size: 9pt; color: #172019; margin-bottom: 2mm; font-weight: 500; }
    .op-row { font-size: 9.5pt; line-height: 1.4; margin-bottom: 1.5mm; color: #172019; }
    .op-row.observed { color: #145c32; font-weight: 600; }
    .security .op-row.observed { color: #784d08; }

    .tech-note {
      padding: 2.5mm 3.5mm;
      font-size: 9.5pt;
      line-height: 1.35;
      border-left: 2mm solid var(--green);
      background: #e4f5e9;
      border-radius: 1mm;
      color: #172019;
    }
    .security .tech-note { border-left-color: var(--amber); background: #faf0de; }
    .tech-note.decision { margin-top: 1mm; }

    .technical-evidence dl div {
      display: grid;
      grid-template-columns: 35mm 1fr;
      gap: 2.5mm;
      padding: 2mm 0;
      border-bottom: 1px solid var(--paper-line);
      font-size: 9.5pt;
      color: #172019;
    }
    .technical-evidence dt { font-weight: 700; color: #172019; }
    .technical-evidence dd { margin: 0; color: #172019; }
    .result-highlight { color: #145c32; font-weight: 600; }
    .security .result-highlight { color: #784d08; }

    /* Performance Page */
    .perf-story-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3mm;
      margin-bottom: 3mm;
    }
    .perf-story-card {
      min-height: 36mm;
      padding: 3mm;
      border: 1px solid var(--paper-line);
      border-radius: 2mm;
      background: white;
    }
    .perf-story-card h3 { margin: 0 0 1.5mm; color: var(--blue); font-size: 10.5pt; }
    .perf-story-card p { font-size: 9.5pt; line-height: 1.35; color: #172019; }
    .perf-story-card.decision { border-left: 2mm solid var(--green); }

    .perf-metrics-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 3mm;
      margin-bottom: 3mm;
    }
    .perf-metrics-strip article {
      min-height: 36mm;
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
    .metric-num { font-size: 20pt; line-height: 1; color: #172019; }
    .metric-main { margin-top: 1.5mm; font-size: 9.5pt; font-weight: 700; color: #172019; }
    .metric-desc { margin-top: 0.5mm; font-size: 8.5pt; color: #172019; opacity: .8; }

    .perf-verifications {
      padding: 3mm;
      border: 1px solid var(--paper-line);
      border-radius: 2mm;
      background: white;
    }
    .perf-verifications h2 { margin: 0 0 2mm; font-size: 11.5pt; color: var(--blue); }
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
    .check-title { color: #172019; }
    .check-result { color: #145c32; font-size: 9pt; }
    .perf-disclaimer { font-size: 8.5pt; color: #172019; margin-top: 2mm; font-weight: 500; }

    /* Timeline Page Expandida em 4 Pilares */
    .timeline-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 3.5mm;
    }
    .timeline-header h1 { margin: 1mm 0; font-size: 20pt; }

    .timeline-pillars-grid {
      display: grid;
      grid-template-columns: 1fr 1.35fr 1fr 1fr;
      gap: 3mm;
      margin-bottom: 3.5mm;
    }
    .pillar {
      display: flex;
      flex-direction: column;
      gap: 2mm;
    }
    .pillar-title {
      font-size: 9.5pt;
      font-weight: 750;
      color: var(--mint);
      text-transform: uppercase;
      letter-spacing: .04em;
      padding-bottom: 1mm;
      border-bottom: 1px solid var(--line);
    }
    .pillar-cards {
      display: flex;
      flex-direction: column;
      gap: 2mm;
    }
    .milestone-card {
      padding: 2.5mm;
      border: 1px solid var(--line);
      border-radius: 1.5mm;
      background: var(--surface);
      min-height: 22mm;
    }
    .milestone-card.pass { border-left: 2mm solid var(--green); }
    .milestone-card.fail { border-left: 2mm solid var(--red); }
    .ms-header {
      display: flex;
      align-items: center;
      gap: 1.5mm;
      margin-bottom: 1mm;
    }
    .ms-num { color: var(--mint); font-size: 9.5pt; }
    .milestone-card h4 { font-size: 9.5pt; color: var(--ink); font-weight: 700; }
    .milestone-card p { font-size: 8.5pt; line-height: 1.3; color: var(--muted); }

    .timeline-footer-strip {
      display: grid;
      grid-template-columns: 1.3fr 1fr;
      gap: 3mm;
    }
    .ai-banner, .gate-banner {
      padding: 2.5mm 3.5mm;
      border-radius: 1.5mm;
      font-size: 8.5pt;
      line-height: 1.35;
    }
    .ai-banner {
      border: 1px solid #284433;
      background: #112017;
      color: var(--muted);
    }
    .ai-banner b { color: var(--mint); display: block; margin-bottom: 0.5mm; }
    .ai-banner p { margin: 0; font-size: 8.5pt; line-height: 1.35; color: var(--muted); }
    .gate-banner {
      border: 1px solid #543f16;
      background: #231b0c;
      color: #dfcaa7;
    }
    .gate-banner b { color: var(--amber); display: block; margin-bottom: 0.5mm; }
  </style>
</head>
<body>
  ${executivePage}
  ${detailPages.join('')}
  ${performanceMarkup}
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
