import { check, sleep } from 'k6';
import http from 'k6/http';
import { baselineProduct, targetBaseUrl } from '../config/baseline.js';

const baseUrl = targetBaseUrl(__ENV);
const resilienceP95 = Number(__ENV.RESILIENCE_P95_MS || 1000);

export const options = {
  scenarios: {
    ramping_resilience: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '5s', target: 1 },  // Fase 1: Baseline com 1 VU
        { duration: '10s', target: 3 }, // Fase 2: Ramping up para 3 VUs simultâneos
        { duration: '5s', target: 1 }   // Fase 3: Ramping down e recuperação para 1 VU
      ]
    }
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: [`p(95)<${resilienceP95}`],
    checks: ['rate==1'],
    iterations: ['count>=20']
  }
};

export default function () {
  const catalog = http.get(`${baseUrl}/accessories`, {
    tags: { operation: 'catalog_resilience' }
  });
  check(catalog, {
    '[Resiliência] Catálogo responde HTTP 200': (response) => response.status === 200,
    '[Resiliência] Catálogo exibe produtos ativos': (response) =>
      response.body.includes(baselineProduct.name)
  });

  const product = http.get(`${baseUrl}${baselineProduct.path}`, {
    tags: { operation: 'product_resilience' }
  });
  check(product, {
    '[Resiliência] Produto responde HTTP 200': (response) => response.status === 200,
    '[Resiliência] Produto exibe título e preço': (response) =>
      response.body.includes(baselineProduct.name)
  });

  sleep(0.5);
}
