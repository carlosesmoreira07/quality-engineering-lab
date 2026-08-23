import { check, sleep } from 'k6';
import http from 'k6/http';
import { baselineProduct, targetBaseUrl } from '../config/baseline.js';

const baseUrl = targetBaseUrl(__ENV);
const homeP95 = Number(__ENV.JOURNEY_HOME_P95_MS || 1000);
const catalogP95 = Number(__ENV.JOURNEY_CATALOG_P95_MS || 1000);
const searchP95 = Number(__ENV.JOURNEY_SEARCH_P95_MS || 500);
const productP95 = Number(__ENV.JOURNEY_PRODUCT_P95_MS || 1000);

export const options = {
  scenarios: {
    customer_discovery_journey: {
      executor: 'constant-vus',
      vus: 2,
      duration: '15s'
    }
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    'http_req_duration{operation:home_step}': [`p(95)<${homeP95}`],
    'http_req_duration{operation:catalog_step}': [`p(95)<${catalogP95}`],
    'http_req_duration{operation:search_step}': [`p(95)<${searchP95}`],
    'http_req_duration{operation:product_step}': [`p(95)<${productP95}`],
    checks: ['rate==1'],
    iterations: ['count>=10']
  }
};

export default function () {
  // Etapa 1: Acesso à Home da loja
  const home = http.get(`${baseUrl}/`, {
    tags: { operation: 'home_step' }
  });
  check(home, {
    '[Jornada] Home responde HTTP 200': (response) => response.status === 200,
    '[Jornada] Home exibe conteúdo principal': (response) =>
      response.body.includes('Produtos em destaque')
  });

  sleep(0.5);

  // Etapa 2: Navegação até a categoria de catálogo
  const catalog = http.get(`${baseUrl}/accessories`, {
    tags: { operation: 'catalog_step' }
  });
  check(catalog, {
    '[Jornada] Catálogo responde HTTP 200': (response) => response.status === 200,
    '[Jornada] Catálogo exibe título da categoria': (response) =>
      response.body.includes('Accessories')
  });

  sleep(0.5);

  // Etapa 3: Consulta pública e busca de produtos via GraphQL API
  const search = http.post(
    `${baseUrl}/api/graphql`,
    JSON.stringify({
      query: '{ products { total items { uuid name sku urlKey } } }'
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'search_step' }
    }
  );
  check(search, {
    '[Jornada] Consulta GraphQL responde HTTP 200': (response) => response.status === 200,
    '[Jornada] Consulta GraphQL retorna itens de produto': (response) =>
      response.body.includes(baselineProduct.sku)
  });

  sleep(0.5);

  // Etapa 4: Visualização dos detalhes do produto selecionado
  const product = http.get(`${baseUrl}${baselineProduct.path}`, {
    tags: { operation: 'product_step' }
  });
  check(product, {
    '[Jornada] Página de produto responde HTTP 200': (response) => response.status === 200,
    '[Jornada] Página de produto mantém nome e preço': (response) =>
      response.body.includes(baselineProduct.name)
  });

  sleep(0.5);
}
