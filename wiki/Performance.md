# Performance

## Pergunta de negócio

A descoberta de produtos e a entrada da compra continuam disponíveis, corretas e previsíveis no perfil observado?

O foco principal é **Disponibilidade e previsibilidade da compra** (`RISK-019`). **Desempenho da descoberta de produtos** (`RISK-018`) oferece contexto para a página de produto.

## Perfis existentes

| Perfil | Uso | Decisão |
|---|---|---|
| Smoke | execução curta e frequente | detecta regressão grosseira de erro, comportamento ou tempo de resposta |
| Carga controlada | execução manual com baixa concorrência | observa se a validação transacional permanece previsível |

As leituras usam percentil 95 de tempo de resposta, ausência de erro HTTP inesperado, verificações funcionais e volume mínimo. Os valores são referências do laboratório, não SLA, SLO ou certificação de capacidade de produção.

## Limite importante

**Proteção contra venda acima do estoque** (`RISK-014`) ainda não possui cobertura determinística. A versão estável atual não conclui a compra com frete e pagamento configurados de forma que permita observar e restaurar o estoque com segurança.

Fontes: [guia técnico de performance](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/quality/performance/README.md) e [decisão de arquitetura](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0004-performance-testing-strategy.md).
