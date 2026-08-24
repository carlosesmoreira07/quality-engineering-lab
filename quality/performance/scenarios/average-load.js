import { check, sleep } from 'k6';
import http from 'k6/http';
import { baselineProduct, targetBaseUrl } from '../config/baseline.js';

/**
 * Carga esperada — Execução manual
 *
 * Pergunta de negócio:
 *   "A jornada de descoberta de produto permanece estável e dentro
 *    dos tempos de referência sob concorrência controlada representando
 *    uso normal do laboratório?"
 *
 * Cenário: Home → Catálogo → Busca (GraphQL) → Produto (read-only)
 * Carga: ramping de 1 a 3 VUs — simula variação de uso esperado, não capacidade de produção.
 * Execução exclusivamente manual via workflow_dispatch; nunca no Quality Gate automático.
 * Riscos controlados: RISK-001 (descoberta de produtos), RISK-018 (desempenho da descoberta)
 *
 * Thresholds são referências de engenharia do laboratório, não SLA ou SLO de produção.
 * Calibrar com pelo menos 3 execuções antes de ajustar limites.
 */

const baseUrl = targetBaseUrl(__ENV);

// Thresholds configuráveis; padrões calibrados em execuções de laboratório
const homeP95    = Number(__ENV.AVG_LOAD_HOME_P95_MS    || 1200);
const catalogP95 = Number(__ENV.AVG_LOAD_CATALOG_P95_MS || 1200);
const searchP95  = Number(__ENV.AVG_LOAD_SEARCH_P95_MS  || 700);
const productP95 = Number(__ENV.AVG_LOAD_PRODUCT_P95_MS || 1200);

export const options = {
  scenarios: {
    average_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 1 }, // Fase 1: 1 VU — referência inicial
        { duration: '20s', target: 3 }, // Fase 2: Ramping para 3 VUs — concorrência esperada
        { duration: '10s', target: 3 }  // Fase 3: Sustentação para observar estabilidade
      ]
    }
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    'http_req_duration{operation:home_step}':    [`p(95)<${homeP95}`],
    'http_req_duration{operation:catalog_step}': [`p(95)<${catalogP95}`],
    'http_req_duration{operation:search_step}':  [`p(95)<${searchP95}`],
    'http_req_duration{operation:product_step}': [`p(95)<${productP95}`],
    checks:     ['rate==1'],
    iterations: ['count>=15']
  }
};

export default function () {
  // Etapa 1: Home da loja
  const home = http.get(`${baseUrl}/`, {
    tags: { operation: 'home_step' }
  });
  check(home, {
    '[Carga] Home responde HTTP 200': (r) => r.status === 200,
    '[Carga] Home exibe conteúdo principal': (r) =>
      r.body.includes('Produtos em destaque')
  });

  sleep(1);

  // Etapa 2: Catálogo de categoria
  const catalog = http.get(`${baseUrl}/accessories`, {
    tags: { operation: 'catalog_step' }
  });
  check(catalog, {
    '[Carga] Catálogo responde HTTP 200': (r) => r.status === 200,
    '[Carga] Catálogo exibe título da categoria': (r) =>
      r.body.includes('Accessories')
  });

  sleep(1);

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
    '[Carga] Busca GraphQL responde HTTP 200': (r) => r.status === 200,
    '[Carga] Busca retorna produto baseline': (r) =>
      r.body.includes(baselineProduct.sku)
  });

  sleep(1);

  // Etapa 4: Página de produto
  const product = http.get(`${baseUrl}${baselineProduct.path}`, {
    tags: { operation: 'product_step' }
  });
  check(product, {
    '[Carga] Produto responde HTTP 200': (r) => r.status === 200,
    '[Carga] Produto exibe nome esperado': (r) =>
      r.body.includes(baselineProduct.name)
  });

  sleep(1);
}
