

## Pergunta de negócio

A jornada de descoberta de produto (Home → Catálogo → Busca → Produto) continua disponível, correta e com tempo de resposta previsível no perfil observado?

O foco é **Desempenho da descoberta de produtos** (`RISK-018`) e **Descoberta de produtos ativos** (`RISK-001`). A **Disponibilidade e previsibilidade da compra** (`RISK-019`) é observada indiretamente pela disponibilidade contínua da camada de aplicação.

## Perfis

| Categoria | Perfil | Uso | Pergunta de negócio respondida |
|---|---|---|---|
| Saúde rápida | `smoke` | Automático em todo PR — Quality Gate | "A jornada de descoberta continua disponível e sem regressão grosseira de latência ou erro?" |
| Saúde rápida | `post-merge-smoke` | Automático após merge na `main` | "O commit incorporado na main mantém os endpoints públicos saudáveis?" |
| Carga esperada | `average-load` | Execução manual via workflow_dispatch | "A jornada permanece estável sob concorrência controlada representando uso normal?" |
| Variação controlada de tráfego | `traffic-variation` | Execução manual via workflow_dispatch | "Como o tempo de resposta varia quando a concorrência sobe e desce de forma controlada?" |

## Cenário de negócio reutilizado

Todos os perfis exercitam a mesma jornada read-only:

**Home → Catálogo → Busca (GraphQL) → Produto**

`smoke` e `post-merge-smoke` percorrem as 4 etapas.  
`traffic-variation` percorre 3 etapas (Home → Catálogo → Produto) para manter volume baixo durante a variação.

Nenhum perfil executa mutações, autenticação ou checkout. Dados de estoque e pedidos não são afetados.

## Thresholds e limites

Os valores de p95 são referências calibradas de engenharia do laboratório — não representam SLA, SLO ou capacidade certificada de produção. A carga máxima é 3 VUs simultâneos, mantida abaixo do rate limit nativo do EverShop (120 req/min por IP).

## Perfis removidos

| Perfil anterior | Motivo da remoção |
|---|---|
| `load` | Focava exclusivamente na rejeição HTTP 400 de pedido incompleto — não respondia pergunta central do uso do cliente |
| `journey` | Mesclava cenário de negócio com perfil de carga no mesmo arquivo; absorvido pelo `average-load` com separação clara |
| `resilience` | Nomeava "resiliência" sem injeção de falha, sem métricas de recuperação; renomeado para `traffic-variation` com linguagem honesta |

## Limite importante

**Proteção contra venda acima do estoque** (`RISK-014`) ainda não possui cobertura determinística. A versão estável atual não conclui a compra com frete e pagamento configurados de forma que permita observar e restaurar o estoque com segurança.

Fontes: [guia técnico de performance](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/quality/performance/README.md) e [decisão de arquitetura](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0004-performance-testing-strategy.md).
