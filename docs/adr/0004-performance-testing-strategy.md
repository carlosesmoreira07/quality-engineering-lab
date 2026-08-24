# ADR 0004 — Estratégia de testes de performance

## Status

Aceita (evoluída no QEL-13).

## Contexto

O laboratório precisa medir disponibilidade, tempo de resposta e previsibilidade da jornada de descoberta de produto sem confundir resultados locais com capacidade certificada de produção. A baseline não conclui pedidos por ausência de gateways de frete e pagamento configurados.

A primeira versão do QEL-13 introduziu cenários com problemas conceituais:
- `journey` mesclava cenário de negócio (o que testar) com perfil de carga (como carregar) no mesmo arquivo;
- `resilience` denominava "resiliência" sem injeção de falha real, sem métricas de before/during/after;
- `load` focava na rejeição HTTP 400 de pedido incompleto — controle técnico válido, mas não representação da jornada central do cliente;
- o Quality Report selecionava o summary mais recente por `mtimeMs`, permitindo que um perfil manual aparecesse como resultado oficial do Quality Gate.

## Decisão

Adotar k6 OSS `2.1.0`, com cenário de negócio único reutilizado por todos os perfis e separação rigorosa entre cenário e perfil de carga:

**Cenário de negócio:** Home → Catálogo → Busca (GraphQL) → Produto (read-only, sem mutações).

**Perfis:**

1. **Saúde rápida (`smoke`):** taxa constante mínima (1 it/s × 15 s) para detecção rápida de regressões na jornada completa de descoberta. Automático no Quality Gate de PR.

2. **Saúde pós-merge (`post-merge-smoke`):** confirmação pública somente leitura após merge na `main`. Sem GraphQL; apenas Home, catálogo e produto.

3. **Carga esperada (`average-load`):** ramping de 1 a 3 VUs em 40 s para observar estabilidade da jornada completa sob concorrência controlada representando uso normal. Execução manual. Não afirma capacidade de produção.

4. **Variação controlada de tráfego (`traffic-variation`):** ramping 1 → 3 → 1 VUs em 40 s para observar como o tempo de resposta varia com a oscilação de concorrência. Execução manual. Não afirma resiliência a falhas nem mede recuperação.

**Perfis removidos:** `load`, `journey`, `resilience`.

**Correção do Quality Report:** seleção determinística por `PERF_PROFILE` + `GITHUB_RUN_ID` em contexto CI; preferência por smoke localmente. Nunca por `mtimeMs`.

Não são usados Grafana Cloud, dashboards pesados ou ferramentas pagas. A saída k6 e resumos JSON estruturados são as fontes oficiais de decisão.

## Cenários e riscos

- `smoke` controla `RISK-018` (desempenho da descoberta) e `RISK-001` (descoberta de produtos ativos).
- `post-merge-smoke` controla `RISK-018` na camada pública após merge.
- `average-load` controla `RISK-001` e `RISK-018` sob concorrência esperada.
- `traffic-variation` controla `RISK-018` na observação de variação de tráfego.
- `RISK-019` é observado indiretamente pela disponibilidade da aplicação; não há cobertura de concorrência transacional nesta versão.
- `RISK-014` permanece sem cobertura determinística completa até existir checkout com ciclo idempotente completo.

## Thresholds

Latência utiliza percentil 95 (p95), não média. A taxa de erro HTTP inesperado deve ser zero, checks funcionais devem atingir 100% de aprovação e todas as iterações mínimas devem ser concluídas. Os limites de latência são gates de baseline de engenharia calibrados em laboratório — não são SLA ou SLO de produção. Calibrar com pelo menos 3 execuções controladas antes de ajustar.

## Limitações

Resultados dependem do host e dos containers locais/CI. As workloads são intencionalmente mantidas abaixo do rate limit nativo do EverShop (120 req/min por IP) para evitar bloqueios artificiais. A variação de tráfego observa o comportamento conforme a concorrência oscila — não injeta falhas nem mede recuperação.

## Alternativas consideradas

- Carga extrema, soak longo e execução distribuída: rejeitados por gerarem custos desproporcionais e excederem a capacidade do ambiente de referência.
- Grafana Cloud, APMs pagos e dashboards: rejeitados porque a saída JSON estruturada atende aos Quality Gates e ao Quality Report executivo.
- Browser performance com Web Vitals no k6: adiada; foco está na estabilidade dos contratos HTTP da jornada de descoberta.
- Manter `load` com fixture de carrinho: removido porque a rejeição transacional não representa a jornada principal do cliente e introduzia complexidade de fixture desnecessária.
