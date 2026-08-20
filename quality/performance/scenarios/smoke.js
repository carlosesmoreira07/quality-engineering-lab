import { check } from 'k6';
import http from 'k6/http';
import {
  baselineProduct,
  targetBaseUrl
} from '../config/baseline.js';

const baseUrl = targetBaseUrl(__ENV);
const productP95 = Number(__ENV.SMOKE_PRODUCT_P95_MS || 1000);
const orderValidationP95 = Number(__ENV.SMOKE_ORDER_P95_MS || 500);

export const options = {
  scenarios: {
    performance_smoke: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 2,
      maxVUs: 4
    }
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    'http_req_duration{operation:product_view}': [`p(95)<${productP95}`],
    'http_req_duration{operation:order_validation}': [`p(95)<${orderValidationP95}`],
    checks: ['rate==1'],
    dropped_iterations: ['count==0'],
    iterations: ['count>=20']
  }
};

export default function () {
  const product = http.get(`${baseUrl}${baselineProduct.path}`, {
    tags: { operation: 'product_view' }
  });
  check(product, {
    'produto responde HTTP 200': (response) => response.status === 200,
    'produto esperado permanece visível': (response) =>
      response.body.includes(baselineProduct.name)
  });

  const order = http.post(
    `${baseUrl}/api/orders`,
    JSON.stringify({}),
    {
      headers: { 'Content-Type': 'application/json' },
      responseCallback: http.expectedStatuses(400),
      tags: { operation: 'order_validation' }
    }
  );
  check(order, {
    'pedido sem carrinho é rejeitado': (response) => response.status === 400,
    'rejeição mantém resposta estruturada': (response) => response.body.includes('error')
  });
}
