# ADR 0004 — Estratégia de testes de performance

## Status

Aceita (evoluída no QEL-13).

## Contexto

O laboratório precisa medir disponibilidade, tempo de resposta e previsibilidade da jornada sem confundir testes locais com capacidade certificada de produção. A baseline não conclui pedidos por ausência de gateways de frete e pagamento configurados.

## Decisão

Adotar k6 OSS `2.1.0`, com foco em contratos HTTP/API e separação rigorosa de perfis por objetivo de teste:

1. **Smoke (Saúde rápida):** taxa constante para detecção rápida de regressões no PR (`smoke`) e confirmação pública somente leitura após merge (`post-merge-smoke`);
2. **Load (Carga esperada):** três usuários simultâneos contra carrinho incompleto isolado e temporário para avaliar concorrência transacional;
3. **Cenários avançados (Investigação específica):**
   - **Jornada de Descoberta (`journey`):** simulação de funil do cliente (`Home → Catálogo → GraphQL Search → Produto`) com think time e medição de thresholds específicos por etapa;
   - **Resiliência sob Ramping (`resilience`):** variação controlada de usuários virtuais (ramping up e recovery down) para avaliar absorção de oscilações de tráfego.

Não são usados Grafana Cloud, dashboards pesados ou ferramentas pagas. A saída k6 e resumos JSON estruturados são as fontes oficiais de decisão.

## Cenários e riscos

- `smoke` e `post-merge-smoke` controlam `RISK-018` e `RISK-019`.
- `load` controla `RISK-019` sob concorrência na rejeição transacional.
- `journey` controla `RISK-001` e `RISK-018` ao validar latência por etapa no funil de descoberta.
- `resilience` controla `RISK-018` e `RISK-019` na recuperação de tempo de resposta sob variação de carga.
- `RISK-014` permanece sem cobertura determinística completa até existir checkout com ciclo idempotente completo.

## Thresholds

Latência utiliza percentil 95 (p95), não média. A taxa de erro HTTP inesperado deve ser zero, checks funcionais devem atingir 100% de aprovação e todas as iterações mínimas devem ser concluídas. Os limites de latência são gates de baseline de engenharia, não SLA ou SLO de produção.

## Limitações

Resultados dependem do host e dos containers locais/CI. As workloads são intencionalmente mantidas abaixo do rate limit nativo do EverShop (120 req/min por IP) para evitar bloqueios artificiais.

## Alternativas consideradas

- Carga extrema, soak longo e execução distribuída: rejeitados por gerarem custos desproporcionais e excederem a capacidade do ambiente de referência;
- Grafana Cloud, APMs pagos e dashboards: rejeitados porque a saída JSON estruturada atende aos Quality Gates e ao Quality Report executivo;
- Browser performance com Web Vitals no k6: adiada por o foco estar na estabilidade dos contratos HTTP e da regra transacional.
