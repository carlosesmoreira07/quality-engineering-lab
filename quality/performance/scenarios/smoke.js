import { check, sleep } from 'k6';
import http from 'k6/http';
import { baselineProduct, targetBaseUrl } from '../config/baseline.js';

/**
 * Saúde rápida — Quality Gate automático (PR e CI)
 *
 * Pergunta de negócio:
 *   "A jornada de descoberta de produto continua disponível
 *    e sem regressão grosseira de latência ou erro?"
 *
 * Cenário: Home → Catálogo → Busca (GraphQL) → Produto
 * Carga mínima: 1 iteração/s por 15 s — detecta regressão sem estressar o ambiente.
 * Riscos controlados: RISK-018 (desempenho da descoberta), RISK-001 (descoberta de produtos ativos)
 *
 * Thresholds são referências de engenharia do laboratório, não SLA ou SLO de produção.
 */

const baseUrl = targetBaseUrl(__ENV);

// Thresholds configuráveis por ambiente; padrões calibrados em execução local de laboratório
// Execução 1 (2026-08-24): home p95=1.62s, catalog p95=1.09s, product p95=1.60s, graphql p95=0.49s
// Referências conservadoras com margem para variação de cold start em container Docker
const homeP95    = Number(__ENV.SMOKE_HOME_P95_MS    || 2000);
const catalogP95 = Number(__ENV.SMOKE_CATALOG_P95_MS || 2000);
const searchP95  = Number(__ENV.SMOKE_SEARCH_P95_MS  || 800);
const productP95 = Number(__ENV.SMOKE_PRODUCT_P95_MS || 2000);

export const options = {
  scenarios: {
    health_check: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1s',
      duration: '15s',
      preAllocatedVUs: 4,
      maxVUs: 5
    }
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    'http_req_duration{operation:home_step}':    [`p(95)<${homeP95}`],
    'http_req_duration{operation:catalog_step}': [`p(95)<${catalogP95}`],
    'http_req_duration{operation:search_step}':  [`p(95)<${searchP95}`],
    'http_req_duration{operation:product_step}': [`p(95)<${productP95}`],
    checks:             ['rate==1'],
    dropped_iterations: ['count==0'],
    iterations:         ['count>=10']
  }
};

export default function () {
  // Etapa 1: Home da loja
  const home = http.get(`${baseUrl}/`, {
    tags: { operation: 'home_step' }
  });
  check(home, {
    '[Saúde] Home responde HTTP 200': (r) => r.status === 200,
    '[Saúde] Home exibe conteúdo principal': (r) =>
      r.body.includes('Produtos em destaque')
  });

  sleep(0.5);

  // Etapa 2: Catálogo de categoria
  const catalog = http.get(`${baseUrl}/accessories`, {
    tags: { operation: 'catalog_step' }
  });
  check(catalog, {
    '[Saúde] Catálogo responde HTTP 200': (r) => r.status === 200,
    '[Saúde] Catálogo exibe título da categoria': (r) =>
      r.body.includes('Accessories')
  });

  sleep(0.5);

  // Etapa 3: Busca de produtos via GraphQL (leitura pública)
  const search = http.post(
    `${baseUrl}/api/graphql`,
    JSON.stringify({ query: '{ products { total items { uuid name sku urlKey } } }' }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'search_step' }
    }
  );
  check(search, {
    '[Saúde] Busca GraphQL responde HTTP 200': (r) => r.status === 200,
    '[Saúde] Busca retorna produto baseline': (r) =>
      r.body.includes(baselineProduct.sku)
  });

  sleep(0.5);

  // Etapa 4: Página de produto
  const product = http.get(`${baseUrl}${baselineProduct.path}`, {
    tags: { operation: 'product_step' }
  });
  check(product, {
    '[Saúde] Produto responde HTTP 200': (r) => r.status === 200,
    '[Saúde] Produto exibe nome esperado': (r) =>
      r.body.includes(baselineProduct.name)
  });

  sleep(0.5);
}
