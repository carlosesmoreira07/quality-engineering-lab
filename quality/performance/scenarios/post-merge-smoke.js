import { check } from 'k6';
import http from 'k6/http';
import { baselineProduct, targetBaseUrl } from '../config/baseline.js';

const baseUrl = targetBaseUrl(__ENV);
const responseP95 = Number(__ENV.POST_MERGE_SMOKE_P95_MS || 1000);

export const options = {
  scenarios: {
    post_merge_smoke: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 1,
      maxVUs: 2
    }
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: [`p(95)<${responseP95}`],
    checks: ['rate==1'],
    dropped_iterations: ['count==0'],
    iterations: ['count>=10']
  }
};

export default function () {
  const home = http.get(`${baseUrl}/`, {
    tags: { operation: 'home_read' }
  });
  check(home, {
    'Home responde HTTP 200': (response) => response.status === 200,
    'Home mantém conteúdo principal': (response) => response.body.includes('Produtos em destaque')
  });

  const catalog = http.get(`${baseUrl}/accessories`, {
    tags: { operation: 'catalog_read' }
  });
  check(catalog, {
    'catálogo responde HTTP 200': (response) => response.status === 200,
    'catálogo mantém produto baseline': (response) => response.body.includes(baselineProduct.name)
  });

  const product = http.get(`${baseUrl}${baselineProduct.path}`, {
    tags: { operation: 'product_read' }
  });
  check(product, {
    'produto responde HTTP 200': (response) => response.status === 200,
    'produto mantém nome esperado': (response) => response.body.includes(baselineProduct.name)
  });
}
