# Performance

## Pergunta de negócio

A descoberta de produtos e a entrada da compra continuam disponíveis, corretas e previsíveis no perfil observado?

O foco principal é **Disponibilidade e previsibilidade da compra** (`RISK-019`), **Desempenho da descoberta de produtos** (`RISK-018`) e **Descoberta de produtos ativos** (`RISK-001`).

## Perfis existentes

| Categoria | Perfil | Uso | Decisão |
|---|---|---|---|
| Smoke | `smoke` | execução curta e frequente no PR | detecta regressão grosseira de latência, erro ou comportamento |
| Smoke | `post-merge-smoke` | confirmação pós-merge na `main` | valida disponibilidade pública somente leitura |
| Carga esperada | `load` | execução manual com concorrência controlada | observa se a validação transacional permanece previsível sob 3 VUs |
| Cenário avançado | `journey` | simulação de funil de descoberta do cliente | valida latência por etapa (`Home → Catálogo → GraphQL Search → Produto`) com think time |
| Cenário avançado | `resilience` | ramping controlado de usuários virtuais | avalia estabilidade e recuperação de tempo de resposta em variações de carga |

As leituras usam percentil 95 (p95) de tempo de resposta, taxa de erro HTTP zero, 100% das verificações funcionais aprovadas e volume mínimo. Os valores são referências de engenharia do laboratório, não SLA, SLO ou certificação de capacidade de produção.

## Limite importante

**Proteção contra venda acima do estoque** (`RISK-014`) ainda não possui cobertura determinística. A versão estável atual não conclui a compra com frete e pagamento configurados de forma que permita observar e restaurar o estoque com segurança.

Fontes: [guia técnico de performance](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/quality/performance/README.md) e [decisão de arquitetura](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0004-performance-testing-strategy.md).
