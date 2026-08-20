import { check, sleep } from 'k6';
import http from 'k6/http';
import { targetBaseUrl } from '../config/baseline.js';

const baseUrl = targetBaseUrl(__ENV);
const cartId = __ENV.PERF_CART_ID;
const orderValidationP95 = Number(__ENV.LOAD_ORDER_P95_MS || 500);

if (!cartId) {
  throw new Error('PERF_CART_ID é obrigatório; execute pelo script npm performance:load.');
}

export const options = {
  scenarios: {
    concurrent_order_validation: {
      executor: 'constant-vus',
      vus: 3,
      duration: '20s'
    }
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    'http_req_duration{operation:order_validation}': [`p(95)<${orderValidationP95}`],
    checks: ['rate==1'],
    iterations: ['count>=54']
  }
};

export default function () {
  const order = http.post(
    `${baseUrl}/api/orders`,
    JSON.stringify({ cart_id: cartId }),
    {
      headers: { 'Content-Type': 'application/json' },
      responseCallback: http.expectedStatuses(400),
      tags: { operation: 'order_validation' }
    }
  );

  check(order, {
    'pedido incompleto permanece rejeitado sob concorrência': (response) =>
      response.status === 400,
    'resultado transacional permanece explícito': (response) =>
      response.body.includes('error')
  });

  sleep(1);
}
