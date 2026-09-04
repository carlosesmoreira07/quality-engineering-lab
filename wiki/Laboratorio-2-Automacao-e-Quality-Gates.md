## Laboratório 2 — Automação Cross-Domain e Quality Gates Determinísticos

### 1. Contexto e Objetivo
O Laboratório 2 implementa a validação ponta a ponta mais crítica do ecossistema de vendas: a sincronização em tempo real entre a gestão de preços no catálogo administrativo e a vitrine/carrinho final do consumidor.

### 2. Risco de Negócio Mapeado
- **RISK-002 (Divergência de Preço Admin → Storefront):** risco de alteração de valor no Admin não propagar corretamente, corromper o cálculo do carrinho ou exibir valores discrepantes no momento do fechamento da compra.

### 3. Controles e Entregas Técnicas
- **Automação Cross-Domain (Playwright):**
  - Execução contínua em `quality/tests/web/cross-domain/admin-price.spec.ts`.
  - O robô autentica no painel administrativo, atualiza o preço mestre do produto (`R$ 199,90`), acessa imediatamente a vitrine pública, adiciona o produto ao carrinho e verifica se o total fecha exatamente sem erro de centavo.
- **Barreira de CI/CD (GitHub Actions):**
  - Workflow determinístico em `.github/workflows/quality-gate.yml`.
  - Bloqueio automático de Pull Requests caso qualquer assertiva falhe, impedindo o merge de código defeituoso na branch principal (`main`).
- **Artefatos e Evidências Auditáveis:**
  - Geração automática de Quality Report executivo em PDF (`quality-report_*.pdf`).
  - Gravação de traces Playwright, screenshots de auditoria e relatórios técnicos HTML para diagnóstico imediato.

### 4. Critério de Decisão
Se houver qualquer divergência centesimal ou falha de renderização, o Quality Gate bloqueia a integração. A evidência anexada à execução comprova o ponto exato da divergência.

---
Próximo laboratório: [Laboratório 3: Performance e Segurança](Laboratorio-3-Performance-e-Seguranca).
