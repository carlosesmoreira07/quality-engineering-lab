import { check, sleep } from 'k6';
import http from 'k6/http';
import { baselineProduct, targetBaseUrl } from '../config/baseline.js';

/**
 * Variação controlada de tráfego — Execução manual
 *
 * Pergunta de negócio:
 *   "Como o tempo de resposta da jornada de descoberta varia
 *    quando a concorrência sobe e desce de forma controlada?"
 *
 * Cenário: Home → Catálogo → Produto (read-only — sem GraphQL para manter volume baixo)
 * Carga: ramping 1 → 3 → 1 VUs em 40 s — observa padrão de tempo de resposta, não capacidade.
 * Execução exclusivamente manual via workflow_dispatch; nunca no Quality Gate automático.
 * Riscos controlados: RISK-018 (desempenho da descoberta de produtos)
 *
 * ATENÇÃO: este perfil NÃO é um teste de resiliência a falhas.
 * Não há injeção de falha, indisponibilidade forçada ou métricas de recuperação.
 * O objetivo é observar se o tempo de resposta permanece previsível conforme
 * a concorrência oscila dentro do intervalo esperado do laboratório.
 *
 * Thresholds são referências de engenharia do laboratório, não SLA ou SLO de produção.
 */

const baseUrl = targetBaseUrl(__ENV);

// Threshold único global — rastreia p95 agregado durante toda a variação de carga
const responseP95 = Number(__ENV.TRAFFIC_VAR_P95_MS || 1500);

export const options = {
  scenarios: {
    traffic_variation: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 1 }, // Fase 1: 1 VU — referência de base
        { duration: '15s', target: 3 }, // Fase 2: Ramping para 3 VUs — pico controlado
        { duration: '10s', target: 3 }, // Fase 3: Sustentação — observa estabilidade no pico
        { duration: '5s',  target: 1 }  // Fase 4: Retorno — observa comportamento no declínio
      ]
    }
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: [`p(95)<${responseP95}`],
    checks:     ['rate==1'],
    iterations: ['count>=20']
  }
};

export default function () {
  // Etapa 1: Home da loja
  const home = http.get(`${baseUrl}/`, {
    tags: { operation: 'home_step' }
  });
  check(home, {
    '[Variação] Home responde HTTP 200': (r) => r.status === 200,
    '[Variação] Home exibe conteúdo principal': (r) =>
      r.body.includes('Produtos em destaque')
  });

  sleep(0.5);

  // Etapa 2: Catálogo de categoria
  const catalog = http.get(`${baseUrl}/accessories`, {
    tags: { operation: 'catalog_step' }
  });
  check(catalog, {
    '[Variação] Catálogo responde HTTP 200': (r) => r.status === 200,
    '[Variação] Catálogo mantém produto baseline': (r) =>
      r.body.includes(baselineProduct.name)
  });

  sleep(0.5);

  // Etapa 3: Página de produto
  const product = http.get(`${baseUrl}${baselineProduct.path}`, {
    tags: { operation: 'product_step' }
  });
  check(product, {
    '[Variação] Produto responde HTTP 200': (r) => r.status === 200,
    '[Variação] Produto exibe nome esperado': (r) =>
      r.body.includes(baselineProduct.name)
  });

  sleep(0.5);
}
