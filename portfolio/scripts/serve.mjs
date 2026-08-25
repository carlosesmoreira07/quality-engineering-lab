import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const portfolioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(portfolioDir, 'dist');
const port = Number(process.env.PORT ?? 4173);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml']
]);

const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let file = path.resolve(root, relative);

  if (!file.startsWith(`${root}${path.sep}`) && file !== root && file !== path.join(root, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    let fileStat = await stat(file);
    if (fileStat.isDirectory()) {
      file = path.join(file, 'index.html');
      fileStat = await stat(file);
    }
    if (!fileStat.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'content-type': mime.get(path.extname(file)) ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, 'localhost', () => {
  console.log(`Portal de Evidências preview: http://localhost:${port}`);
});
