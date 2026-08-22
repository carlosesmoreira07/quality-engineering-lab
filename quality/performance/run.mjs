import { spawnSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baselineProduct } from './config/baseline.js';

const qualityDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = process.argv[2];
const k6Binary = process.env.K6_BIN || 'k6';
const executionId = process.env.GITHUB_RUN_ID || Date.now();
const summaryFile = `performance-${profile}-${executionId}-${process.pid}-summary.json`;
const temporarySummary = path.join(os.tmpdir(), summaryFile);

if (!['smoke', 'load'].includes(profile)) {
  throw new Error('Perfil inválido. Use smoke ou load.');
}

const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const cartIdPattern = /^[0-9a-f]{32}$/i;
const itemIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let fixture;
let exitCode = 1;
const startedAt = Date.now();

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function createIncompleteCart() {
  const response = await fetch(`${baseUrl}/api/carts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ sku: baselineProduct.sku, qty: 1 }] })
  });
  const body = await response.json();
  const cartId = body?.data?.cartId;
  const itemId = body?.data?.items?.[0]?.uuid;
  if (!response.ok || !cartIdPattern.test(cartId) || !itemIdPattern.test(itemId)) {
    throw new Error(`Não foi possível preparar o carrinho controlado: HTTP ${response.status}.`);
  }
  return { cartId, itemId };
}

async function removeFixture({ cartId, itemId }) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const itemResponse = await fetch(`${baseUrl}/api/cart/${cartId}/items/${itemId}`, {
      method: 'DELETE'
    });
    if (itemResponse.ok) return;
    if (itemResponse.status !== 429 || attempt === 3) {
      throw new Error(`Falha ao remover item controlado: HTTP ${itemResponse.status}.`);
    }

    const retryAfterSeconds = Number(itemResponse.headers.get('retry-after')) || 60;
    console.log('Rate limit alcançado durante a limpeza; aguardando a janela segura.');
    await wait(retryAfterSeconds * 1000);
  }
}

try {
  if (profile === 'load') fixture = await createIncompleteCart();
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
        ...(fixture ? { PERF_CART_ID: fixture.cartId } : {})
      },
      stdio: 'inherit'
    }
  );
  if (execution.error) throw execution.error;
  exitCode = execution.status ?? 1;
  const summary = JSON.parse(await readFile(temporarySummary, 'utf8'));
  summary.qel = {
    profile,
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
  if (fixture) {
    try {
      await removeFixture(fixture);
      console.log('Dados controlados de performance removidos.');
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      exitCode = 1;
    }
  }
  await rm(temporarySummary, { force: true });
}

process.exitCode = exitCode;
