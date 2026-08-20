# Exemplos controlados de análise de impacto de qualidade

Execuções manuais da skill `qe-impact-analysis` em 20/08/2026. As duas análises leram os cards via Atlassian Rovo e inspecionaram a branch do QEL-8 após o merge do QEL-7. Nenhum teste foi executado: os resultados abaixo confirmam controles existentes, não um PASS recente.

## Caso A — QEL-4, cobertura existente

**Demanda:** implementar a fundação de automação funcional e API somente para riscos priorizados, com separação de camadas, dados reproduzíveis e evidências úteis.

**Impacto identificado:** arquitetura Playwright, controles Web/API, dados sintéticos, rastreabilidade por risco e reporting nativo.

| Risco | Classificação | Controle encontrado |
|---|---|---|
| RISK-002 | COBERTO | `product-cart.spec.ts` verifica preço no carrinho; `admin-price.spec.ts` verifica propagação Admin → Storefront → carrinho. |
| RISK-004 | PARCIALMENTE COBERTO | `authentication.spec.ts` detecta rejeição de credencial inválida, mas não exercita todo o ciclo de sessão descrito pelo risco. |
| RISK-006 / RISK-007 | COBERTO | Controles Web e API verificam produto, quantidade, preço, subtotal e total. |
| RISK-010 | PARCIALMENTE COBERTO | `order-integrity.spec.ts` rejeita pedido incompleto; criação e persistência de pedido completo continuam limitadas pela baseline. |
| RISK-013 | COBERTO | O cenário cross-domain altera o preço no Admin e confirma sua propagação e cálculo final. |

**Resultado da validação da skill:** encontrou as anotações de risco, abriu os cenários e diferenciou cobertura completa de caminhos parciais. O caso confirma que a skill não transforma o status concluído do Jira em cobertura total.

**Revisão humana sugerida:** decidir se o ciclo completo de sessão e a criação de pedido devem virar controles futuros quando a baseline oferecer pré-condições reproduzíveis.

## Caso B — QEL-6, gap real

**Demanda:** definir métricas e thresholds justificados para jornadas críticas e detectar degradações relevantes de performance.

**Impacto identificado:** leitura de produto, validação transacional de pedido, concorrência controlada, p95, taxa de erro, checks funcionais e volume mínimo.

| Risco | Classificação | Controle encontrado ou gap |
|---|---|---|
| RISK-019 | COBERTO | `smoke.js` e `load.js` verificam latência, erro, checks e determinismo da rejeição transacional sob workload controlado. |
| RISK-018 | PARCIALMENTE COBERTO | O smoke mede a página de um produto, mas não cobre descoberta ampla de catálogo nem browser performance. |
| RISK-014 | NÃO COBERTO | O load não conclui pedido, não disputa estoque e não observa overselling; a limitação está explícita no ADR 0004 e no README de performance. |

**Resultado da validação da skill:** evitou inferir cobertura de estoque a partir da palavra “concorrência” e identificou que o workload atual usa um carrinho incompleto sem mutação de estoque.

**Recomendação priorizada:** antes de criar teste de overselling, disponibilizar checkout reproduzível com frete/pagamento, estoque restaurável e cleanup seguro; depois exercitar concorrência no menor nível que observe a movimentação real. A decisão e a implementação dependem de revisão humana.

Análise consultiva: nenhuma mudança em código, testes, Jira ou Quality Gate foi executada pelos casos.
