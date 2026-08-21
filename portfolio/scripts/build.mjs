import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const portfolioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(portfolioDir, 'dist');
const sources = ['index.html', 'styles.css', 'script.js', 'assets'];

if (path.dirname(outputDir) !== portfolioDir) {
  throw new Error('Refusing to clean a directory outside portfolio/.');
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const source of sources) {
  const sourcePath = path.join(portfolioDir, source);
  try {
    await stat(sourcePath);
  } catch {
    if (source === 'script.js' || source === 'assets') continue;
    throw new Error(`Required portfolio source is missing: ${source}`);
  }
  await cp(sourcePath, path.join(outputDir, source), { recursive: true });
}

const html = await readFile(path.join(outputDir, 'index.html'), 'utf8');
const localReferences = [...html.matchAll(/(?:href|src)="(?!https?:|#|mailto:)([^"?]+)"/g)].map((match) => match[1]);
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

if (duplicateIds.length > 0) {
  throw new Error(`Duplicate HTML ids: ${[...new Set(duplicateIds)].join(', ')}`);
}

for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
  if (!ids.includes(anchor)) {
    throw new Error(`Broken internal anchor in index.html: #${anchor}`);
  }
}

for (const requiredMarkup of ['<html lang="pt-BR">', '<title>', 'name="description"']) {
  if (!html.includes(requiredMarkup)) {
    throw new Error(`Required accessibility/SEO markup is missing: ${requiredMarkup}`);
  }
}

for (const imageTag of html.matchAll(/<img\b[^>]*>/g)) {
  if (!/\salt="[^"]+"/.test(imageTag[0])) {
    throw new Error(`Every content image must have meaningful alternative text: ${imageTag[0]}`);
  }
}

for (const reference of localReferences) {
  try {
    await stat(path.join(outputDir, reference));
  } catch {
    throw new Error(`Broken local reference in index.html: ${reference}`);
  }
}

console.log(`Portfolio build completed: ${outputDir}`);
