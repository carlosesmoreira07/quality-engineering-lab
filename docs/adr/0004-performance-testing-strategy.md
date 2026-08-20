# ADR 0004 — Estratégia de testes de performance

## Status

Aceita

## Contexto

O QEL-6 precisa medir degradação e previsibilidade de uma jornada crítica sem confundir carga local com capacidade de produção. A baseline não conclui pedidos por ausência de frete e pagamento configurados.

## Decisão

Adotar k6 OSS `2.1.0`, foco HTTP/API e dois cenários pequenos: smoke frequente e load manual de validação concorrente de pedido. O smoke integra o Quality Gate do PR; o load permanece disponível apenas por execução manual. Não são usados Grafana Cloud, dashboards ou browser performance.

## Cenários

- Smoke: página de produto e rejeição estruturada de pedido sem identificador de carrinho, sob baixa taxa constante;
- Load: três usuários simultâneos, em volume inferior ao rate limit nativo, contra um carrinho real incompleto, isolado e removido após o teste.

Os cenários controlam `RISK-019`. `RISK-018` é contexto secundário. `RISK-014` permanece sem cobertura confiável até existir checkout capaz de criar pedido e movimentar estoque de forma restaurável.

## Thresholds

Latência usa p95, não média. Taxa de erro HTTP deve ser zero, checks funcionais devem passar integralmente, o smoke não pode descartar iterações e ambos os perfis devem atingir o volume mínimo. Os limites de latência são gates de baseline do laboratório, não SLA ou SLO de produção.

## Limitações

Resultados dependem do host e dos containers locais/CI. O load valida concorrência controlada na rejeição transacional, não capacidade máxima, pedido completo ou overselling.

## Alternativas consideradas

- Carga extrema, soak, spike e execução distribuída: adiados por não responderem ao risco atual com custo proporcional;
- Grafana Cloud e dashboards: rejeitados porque a saída e o summary JSON do k6 são suficientes nesta etapa;
- Browser performance: adiada por o objetivo atual estar nos contratos HTTP e na regra transacional.
