import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const experimentsDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryDir = path.dirname(experimentsDir);
const qualityDir = path.join(repositoryDir, 'quality');
const resultsDir = path.join(experimentsDir, 'results');
const proxyScript = path.join(experimentsDir, 'variant-proxy.mjs');
const targetUrl = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const proxyPort = Number(process.env.EXPERIMENT_PORT ?? 3101);
const proxyUrl = `http://localhost:${proxyPort}`;

const definitions = {
  'EXP-001': {
    title: 'Preço inconsistente no Storefront',
    risk: 'RISK-002',
    variant: 'functional-price',
    control: [
      process.execPath,
      'node_modules/@playwright/test/cli.js',
      'test',
      'tests/web/storefront/product-cart.spec.ts',
    ],
    expectedDetection: 'A asserção existente rejeita o preço divergente antes da inclusão no carrinho.',
  },
  'EXP-002': {
    title: 'Latência excessiva na página de produto',
    risk: 'RISK-018',
    variant: 'performance-latency',
    control: [process.execPath, 'performance/run.mjs', 'smoke'],
    expectedDetection: 'O threshold existente de p(95)<1000 ms reprova a mesma carga smoke.',
  },
  'EXP-003': {
    title: 'Bypass de autorização no cancelamento de pedido',
    risk: 'RISK-016',
    variant: 'security-authorization',
    control: [
      process.execPath,
      'node_modules/@playwright/test/cli.js',
      'test',
      'tests/api/security/authorization-boundaries.spec.ts',
      '--grep',
      'bloqueia acesso administrativo anônimo',
    ],
    expectedDetection: 'O controle existente rejeita resposta diferente de 401 para operação anônima.',
  },
};

function executeControl(definition, baseUrl) {
  const [command, ...args] = definition.control;
  const result = spawnSync(command, args, {
    cwd: qualityDir,
    env: { ...process.env, BASE_URL: baseUrl },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);

  return {
    exitCode: result.status ?? 1,
    output,
  };
}

async function assertHealthy(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Healthy SUT is not available at ${url}: ${error.message}`);
  }
}

async function startProxy(variant) {
  const logs = [];
  const child = spawn(process.execPath, [proxyScript, variant], {
    cwd: repositoryDir,
    env: {
      ...process.env,
      EXPERIMENT_TARGET_URL: targetUrl,
      EXPERIMENT_PORT: String(proxyPort),
      EXPERIMENT_PUBLIC_ORIGIN: proxyUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Experiment proxy readiness timeout.')), 10_000);

    const inspect = (chunk) => {
      const text = chunk.toString();
      logs.push(text);
      if (text.includes('EXPERIMENT_PROXY_READY')) {
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Experiment proxy exited before readiness with code ${code}.`));
    });
  });

  await ready;
  return { child, logs };
}

async function stopProxy(proxy) {
  if (proxy.child.exitCode !== null) return;

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    proxy.child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    proxy.child.kill('SIGTERM');
  });
}

async function persistResult(id, definition, phases, proxyLogs) {
  const detected =
    phases.baseline.exitCode === 0 &&
    phases.variant.exitCode !== 0 &&
    phases.restored.exitCode === 0;
  const result = {
    experiment: id,
    title: definition.title,
    risk: definition.risk,
    control: definition.control.slice(1).join(' '),
    expectedDetection: definition.expectedDetection,
    productGateDuringVariant: phases.variant.exitCode === 0 ? 'APROVADO' : 'REPROVADO',
    experimentResult: detected ? 'DETECÇÃO APROVADA' : 'DETECÇÃO REPROVADA',
    phases: {
      baseline: { expected: 'GREEN', result: phases.baseline.exitCode === 0 ? 'GREEN' : 'RED', exitCode: phases.baseline.exitCode },
      variant: { expected: 'RED', result: phases.variant.exitCode === 0 ? 'GREEN' : 'RED', exitCode: phases.variant.exitCode },
      restored: { expected: 'GREEN', result: phases.restored.exitCode === 0 ? 'GREEN' : 'RED', exitCode: phases.restored.exitCode },
    },
    decision: detected
      ? 'O controle detectou a regressão e a baseline saudável foi restaurada.'
      : 'O experimento não demonstrou a capacidade de detecção esperada.',
  };

  await mkdir(resultsDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(resultsDir, `${id}.json`), `${JSON.stringify(result, null, 2)}\n`),
    writeFile(path.join(resultsDir, `${id}-baseline.log`), phases.baseline.output),
    writeFile(path.join(resultsDir, `${id}-variant.log`), phases.variant.output),
    writeFile(path.join(resultsDir, `${id}-restored.log`), phases.restored.output),
    writeFile(path.join(resultsDir, `${id}-proxy.log`), proxyLogs.join('')),
  ]);

  console.log(
    `\n${id} | ${definition.risk} | GREEN → ${phases.variant.exitCode === 0 ? 'GREEN' : 'RED'} → ${phases.restored.exitCode === 0 ? 'GREEN' : 'RED'} | ${result.experimentResult}`,
  );

  return { detected, variantExitCode: phases.variant.exitCode };
}

async function runExperiment(id) {
  const definition = definitions[id];
  console.log(`\n=== ${id} — ${definition.title} (${definition.risk}) ===`);
  await assertHealthy(targetUrl);

  console.log('\n[1/3] Baseline saudável — controle deve aprovar');
  const baseline = executeControl(definition, targetUrl);
  if (baseline.exitCode !== 0) {
    throw new Error(`${id}: baseline failed; controlled regression was not activated.`);
  }

  console.log('\n[2/3] Variante controlada — controle deve reprovar');
  const proxy = await startProxy(definition.variant);
  let variant;
  try {
    variant = executeControl(definition, proxyUrl);
  } finally {
    await stopProxy(proxy);
  }

  console.log('\n[3/3] Baseline restaurada — controle deve aprovar');
  const restored = executeControl(definition, targetUrl);
  return persistResult(id, definition, { baseline, variant, restored }, proxy.logs);
}

const requested = process.argv[2] ?? 'all';
const selected = requested.toLowerCase() === 'all' ? Object.keys(definitions) : [requested.toUpperCase()];

if (selected.some((id) => !definitions[id])) {
  throw new Error(`Unknown experiment '${requested}'. Use EXP-001, EXP-002, EXP-003 or all.`);
}

const outcomes = [];
for (const id of selected) outcomes.push(await runExperiment(id));

if (outcomes.some((outcome) => !outcome.detected)) {
  process.exitCode = 1;
} else if (process.env.EXPERIMENT_PROPAGATE_CONTROL_FAILURE === 'true') {
  process.exitCode = outcomes.find((outcome) => outcome.variantExitCode !== 0)?.variantExitCode ?? 1;
  console.log('\nManual Quality Gate intentionally remains RED: the product control rejected the controlled variant.');
}
