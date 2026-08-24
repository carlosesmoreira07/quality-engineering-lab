import { spawnSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qualityDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = process.argv[2];
const k6Binary = process.env.K6_BIN || 'k6';
const executionId = process.env.GITHUB_RUN_ID || Date.now();
const summaryFile = `performance-${profile}-${executionId}-${process.pid}-summary.json`;
const temporarySummary = path.join(os.tmpdir(), summaryFile);

const VALID_PROFILES = ['smoke', 'post-merge-smoke', 'average-load', 'traffic-variation'];

if (!VALID_PROFILES.includes(profile)) {
  throw new Error(`Perfil inválido. Use: ${VALID_PROFILES.join(', ')}.`);
}

/** Mapa de metadados executivos por perfil */
const PROFILE_METADATA = {
  'smoke': {
    label: 'Saúde rápida',
    businessQuestion: 'A jornada de descoberta de produto continua disponível e sem regressão grosseira?'
  },
  'post-merge-smoke': {
    label: 'Saúde pós-merge',
    businessQuestion: 'O commit incorporado na main mantém os endpoints públicos saudáveis?'
  },
  'average-load': {
    label: 'Carga esperada',
    businessQuestion: 'A jornada de descoberta permanece estável sob concorrência controlada representando uso normal?'
  },
  'traffic-variation': {
    label: 'Variação controlada de tráfego',
    businessQuestion: 'Como o tempo de resposta varia quando a concorrência sobe e desce de forma controlada?'
  }
};

const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
let exitCode = 1;
const startedAt = Date.now();

try {
  const execution = spawnSync(
    k6Binary,
    [
      'run',
      '--summary-export',
      temporarySummary,
      `performance/scenarios/${profile}.js`
    ],
    {
      cwd: qualityDir,
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        // Expõe o perfil ativo para que generate-quality-summary.mjs possa
        // selecionar o summary correto de forma determinística
        PERF_PROFILE: profile
      },
      stdio: 'inherit'
    }
  );
  if (execution.error) throw execution.error;
  exitCode = execution.status ?? 1;

  const summary = JSON.parse(await readFile(temporarySummary, 'utf8'));
  const meta = PROFILE_METADATA[profile];
  summary.qel = {
    profile,
    label: meta.label,
    businessQuestion: meta.businessQuestion,
    passed: exitCode === 0,
    exitCode,
    durationMs: Date.now() - startedAt,
    generatedAt: new Date().toISOString()
  };
  await writeFile(path.join(qualityDir, summaryFile), `${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await rm(temporarySummary, { force: true });
}

process.exitCode = exitCode;
