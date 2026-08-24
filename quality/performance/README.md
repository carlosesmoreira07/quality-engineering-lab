# Testes de performance

## Objetivo

Esta camada usa k6 OSS `2.1.0` para avaliar uma referência controlada do EverShop 2.2.1.
Os cenários ligam workload, comportamento funcional e thresholds ao **desempenho da descoberta de produtos** (`RISK-018`) e à **descoberta de produtos ativos** (`RISK-001`).

**Proteção contra venda acima do estoque** (`RISK-014`) permanece sem cobertura determinística: a versão estável atual não possui frete e pagamento configurados para concluir pedidos e observar movimentação concorrente de estoque com restauração confiável.

## Cenário de negócio

Todos os perfis reutilizam a mesma jornada read-only:

**Home → Catálogo → Busca (GraphQL) → Produto**

Nenhum perfil executa mutações, autenticação ou checkout. O smoke e o average-load percorrem as 4 etapas; o traffic-variation percorre 3 etapas (sem GraphQL) para manter o volume de requisições abaixo do rate limit sob concorrência.

## Perfis e perguntas de negócio

| Perfil | Label executivo | Workload | Pergunta respondida | Risco |
|---|---|---|---|---|
| `smoke` | Saúde rápida | `constant-arrival-rate`, 1 it/s × 15 s | Existe regressão grosseira de latência, erro ou comportamento na jornada de descoberta? | `RISK-018`, `RISK-001` |
| `post-merge-smoke` | Saúde pós-merge | `constant-arrival-rate`, 1 it/s × 10 s (Home + catálogo + produto, GET-only) | O commit incorporado na `main` mantém os endpoints públicos saudáveis? | `RISK-018` |
| `average-load` | Carga esperada | `ramping-vus`, 1 → 3 VUs em 40 s | A jornada permanece estável sob concorrência controlada representando uso normal do laboratório? | `RISK-001`, `RISK-018` |
| `traffic-variation` | Variação controlada de tráfego | `ramping-vus`, 1 → 3 → 1 VUs em 40 s | Como o tempo de resposta varia quando a concorrência sobe e desce de forma controlada? | `RISK-018` |

## Isolamento e rate limits

O EverShop possui limites nativos de 120 chamadas de API por IP a cada 60 segundos. Para garantir resultados válidos e reprodutíveis:

1. **Workloads dimensionadas:** Todos os perfis mantêm volume total controlado, evitando bloqueios HTTP 429 artificiais.
2. **Leitura não destrutiva:** Todos os cenários exercitam endpoints públicos e GraphQL de leitura. Não há mutações, fixtures de carrinho ou dependência de estado externo.

## Métricas e thresholds

- **Latência (p95):**
  - Páginas HTML (Home, catálogo, produto): p95 < 1000–1200 ms dependendo do perfil;
  - Consulta pública GraphQL: p95 < 600–700 ms;
  - Global (traffic-variation): p95 < 1500 ms.
- **Taxa de erro HTTP (`http_req_failed`):** 0% para todas as respostas esperadas.
- **Checks funcionais (`checks`):** 100% de aprovação em todos os checkpoints de conteúdo.
- **Volume mínimo:** Validado por thresholds de `iterations` em cada cenário.

Esses thresholds são referências calibradas de laboratório — não são SLA, SLO ou certificação de capacidade de produção. Calibrar com pelo menos 3 execuções controladas antes de ajustar limites.

### Justificativa dos valores de referência

Os thresholds foram definidos observando o comportamento da baseline do EverShop 2.2.1 em ambiente Docker local. O patamar de 1000 ms para páginas HTML é conservador e compatível com o overhead do runtime de contêiner. O GraphQL usa 600–700 ms por ser uma consulta estruturada com resposta menor. O traffic-variation usa 1500 ms como referência global porque integra variação de VUs e pode apresentar picos transitórios — sem isso, o threshold seria violado por pulsos normais de ramping, não por degradação real.

## Execução

Pré-requisitos: SUT saudável, Node.js 22+ e k6 OSS `2.1.0` disponível no `PATH`.

Na pasta `quality`:

```bash
# Saúde rápida (CI / Quality Gate automático)
npm run performance:smoke
npm run performance:post-merge-smoke

# Execução manual (via workflow_dispatch ou local)
npm run performance:average-load
npm run performance:traffic-variation
```

Os resumos estruturados `performance-<perfil>-<execução>-summary.json` registram perfil, pergunta de negócio, p95, taxa de erro, checks e duração. O Quality Report usa `PERF_PROFILE` e `GITHUB_RUN_ID` para selecionar o summary correto de forma determinística — nunca por timestamp de modificação.

## Seleção determinística do summary no Quality Report

| Contexto | Lógica de seleção |
|---|---|
| PR / CI (`GITHUB_RUN_ID` presente) | Busca `performance-<PERF_PROFILE>-<GITHUB_RUN_ID>-*-summary.json` — exato e único |
| Execução local (sem `GITHUB_RUN_ID`) | Prefere `performance-smoke-*`; avisa se não encontrar |

Isso garante que o resultado exibido no Quality Report sempre corresponde ao perfil realmente executado naquele run.
