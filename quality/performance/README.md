# Testes de performance

## Objetivo

Esta camada usa k6 OSS `2.1.0` para avaliar uma referência controlada do EverShop 2.2.1. Os cenários ligam workload, comportamento funcional e thresholds à **disponibilidade e previsibilidade da compra** (`RISK-019`); o **desempenho da descoberta de produtos** (`RISK-018`) e a **descoberta de produtos ativos** (`RISK-001`) fornecem contexto para a navegação do cliente e leitura do catálogo.

**Proteção contra venda acima do estoque** (`RISK-014`) permanece sem cobertura determinística: a versão estável atual não possui frete e pagamento configurados para concluir pedidos e observar movimentação concorrente de estoque com restauração confiável. O teste não força esse experimento nem declara proteção contra overselling.

## Separação de perfis e cenários

A suíte separa claramente os objetivos de teste de performance em três categorias:

| Categoria | Perfil | Workload | Pergunta respondida | Risco |
|---|---|---|---|---|
| **Smoke** (Saúde rápida) | `smoke` | 2 it/s por 10 s (produto + rejeição de pedido) | Existe regressão grosseira de latência, erro ou comportamento na entrada da jornada? | `RISK-018`, `RISK-019` |
| **Smoke** (Saúde pós-merge) | `post-merge-smoke` | 1 it/s por 10 s (Home + catálogo + produto, GET-only) | O commit incorporado na `main` mantém os endpoints públicos saudáveis? | `RISK-018` |
| **Load** (Carga esperada) | `load` | 3 VUs por 20 s contra carrinho isolado temporário | A validação transacional de pedido permanece determinística sob concorrência esperada? | `RISK-019` |
| **Avançado** (Jornada de descoberta) | `journey` | 2 VUs por 15 s em funil multi-etapas (`Home → Catálogo → GraphQL Search → Produto`) com think time | Cada etapa da jornada do cliente atende a limites específicos de latência no funil de descoberta? | `RISK-001`, `RISK-018` |
| **Avançado** (Resiliência sob ramping) | `resilience` | Ramping de VUs em 20 s (1 VU → 3 VUs → 1 VU) em catálogo e produto com think time | A plataforma absorve uma variação controlada de tráfego e se recupera com tempos de resposta estáveis? | `RISK-018`, `RISK-019` |

## Isolamento e rate limits

O EverShop possui limites nativos de 120 chamadas de API por IP a cada 60 segundos e limite restrito de tentativas de autenticação. Para garantir resultados válidos e reprodutíveis:

1. **Workloads dimensionadas:** Todos os perfis mantêm volume total controlado (abaixo de 80 requisições por execução), evitando bloqueios HTTP 429 artificiais.
2. **Isolamento de estado no Load:** O runner cria um único carrinho antes do teste, injeta seu identificador no k6 e executa a limpeza obrigatória em `finally`, inclusive se thresholds falharem.
3. **Leitura não destrutiva nos cenários avançados:** `journey` e `resilience` exercitam endpoints públicos e GraphQL de leitura sem mutações ou dependência de fixtures.

## Métricas e thresholds de decisão

- **Latência (p95):**
  - Leitura de páginas HTML (Home, catálogo, produto): p95 < 800–1000 ms;
  - Consulta pública GraphQL API (`journey`): p95 < 500 ms;
  - Validação transacional de pedido (`smoke`, `load`): p95 < 500 ms;
  - Resiliência sob ramping (`resilience`): p95 global < 800 ms.
- **Taxa de erro HTTP (`http_req_failed`):** 0% para todas as respostas esperadas.
- **Checks funcionais (`checks`):** 100% de aprovação em todos os checkpoints de conteúdo e contrato.
- **Volume mínimo:** Validado por thresholds de `iterations` em cada cenário.

Esses thresholds são referências calibradas de laboratório, não SLA ou SLO de produção.

## Execução

Pré-requisitos: SUT saudável, Node.js 22+ e k6 OSS `2.1.0` disponível no `PATH`.

Na pasta `quality`:

```bash
# Saúde rápida (CI / Gates)
npm run performance:smoke
npm run performance:post-merge-smoke

# Carga esperada (execução manual / controlada)
npm run performance:load

# Cenários avançados de investigação específica
npm run performance:journey
npm run performance:resilience
```

Os resumos estruturados `performance-<perfil>-<execução>-summary.json` registram workload, p95, taxa de erro, checks e duração para consumo no Quality Report executivo e auditoria.
