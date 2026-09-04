## Laboratório 3 — Performance com K6 e Segurança de Autorização

### 1. Contexto e Objetivo
O Laboratório 3 expande a garantia de qualidade para além do teste funcional: certifica que a aplicação suporta picos de demanda com latência previsível e que suas APIs transacionais estão blindadas contra acessos e mutações não autorizadas.

### 2. Riscos de Negócio Mapeados
- **RISK-004 (Degradação sob Carga):** lentidão excessiva ou indisponibilidade na vitrine e fechamento de pedidos durante eventos promocionais ou picos de tráfego.
- **RISK-005 (Violação de Autorização e Acesso Anônimo):** execução de mutações administrativas por agentes sem autenticação adequada ou elevação indevida de privilégios.

### 3. Controles e Entregas Técnicas
- **Engenharia de Performance com K6:**
  - Cenários de carga e smoke automatizados em `quality/performance/scenarios/smoke.js`.
  - Definição explícita de thresholds (SLA):
    * Visualização de produto (`product_view`): p95 < 1000 ms.
    * Validação de pedido (`order_validation`): p95 < 500 ms.
    * Taxa de requisições com falha (`http_req_failed`): taxa = 0.
    * Checks de integridade: 100% de sucesso.
- **Segurança Contínua de APIs:**
  - Suíte em `quality/tests/api/security/authorization-boundaries.spec.ts`.
  - Validação de isolamento de tenants e verificação rigorosa de resposta `HTTP 401 Unauthorized` para tentativas de mutação anônima no catálogo.

### 4. Critério de Decisão
Se a latência ultrapassar os limites definidos pelo SLA ou se uma tentativa de mutação não autorizada responder com sucesso (`200`), o Quality Gate reprova imediatamente o pipeline.

---
Consulte também: [CI/CD e Barreiras da Qualidade](CI-CD-e-Barreiras-da-Qualidade) e [Controles e Evidências](Controles-e-Evidencias).
