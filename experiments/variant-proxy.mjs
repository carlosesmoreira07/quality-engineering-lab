import http from 'node:http';

const mode = process.argv[2];
const target = new URL(process.env.EXPERIMENT_TARGET_URL ?? 'http://localhost:3000');
const port = Number(process.env.EXPERIMENT_PORT ?? 3101);
const publicOrigin = process.env.EXPERIMENT_PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const publicHostname = new URL(publicOrigin).hostname;
const productPath = '/accessories/stainless-steel-thermos-yellow';

if (!['functional-price', 'performance-latency', 'security-authorization'].includes(mode)) {
  throw new Error(`Unsupported experiment variant: ${mode ?? '<missing>'}`);
}

let affectedRequests = 0;

function forward(request, response) {
  const upstreamUrl = new URL(request.url ?? '/', target);
  const headers = { ...request.headers, host: target.host };
  delete headers['accept-encoding'];

  const send = () => {
    const upstream = http.request(
      upstreamUrl,
      { method: request.method, headers },
      (upstreamResponse) => {
        if (mode === 'functional-price' && upstreamUrl.pathname === productPath) {
          const chunks = [];
          upstreamResponse.on('data', (chunk) => chunks.push(chunk));
          upstreamResponse.on('end', () => {
            const original = Buffer.concat(chunks);
            const contentType = String(upstreamResponse.headers['content-type'] ?? '');
            const changed = /text\/html|application\/json/.test(contentType)
              ? Buffer.from(
                  original
                    .toString('utf8')
                    .replaceAll(target.origin, publicOrigin)
                    .replaceAll('$35.00', '$36.00'),
                )
              : original;

            if (!changed.equals(original)) affectedRequests += 1;

            const responseHeaders = { ...upstreamResponse.headers };
            delete responseHeaders['content-encoding'];
            delete responseHeaders['transfer-encoding'];
            delete responseHeaders.etag;
            responseHeaders['content-length'] = String(changed.length);
            response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
            response.end(changed);
          });
          return;
        }

        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      },
    );

    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
      response.end('Experiment proxy could not reach the healthy SUT.');
    });

    request.pipe(upstream);
  };

  if (mode === 'performance-latency' && upstreamUrl.pathname === productPath) {
    affectedRequests += 1;
    setTimeout(send, 1_250);
    return;
  }

  send();
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', target);

  if (requestUrl.pathname === '/__experiment/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ready', mode }));
    return;
  }

  if (
    mode === 'security-authorization' &&
    request.method === 'POST' &&
    /^\/api\/orders\/[^/]+\/cancel$/.test(requestUrl.pathname)
  ) {
    affectedRequests += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'accepted-by-controlled-variant' }));
    return;
  }

  forward(request, response);
});

server.listen(port, publicHostname, () => {
  console.log(`EXPERIMENT_PROXY_READY ${port}`);
});

function shutdown() {
  console.log(`EXPERIMENT_PROXY_STOP affected_requests=${affectedRequests}`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
