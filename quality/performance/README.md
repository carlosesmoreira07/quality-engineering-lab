# Testes de performance

## Objetivo

Esta camada usa k6 OSS `2.1.0` para avaliar uma baseline controlada do EverShop 2.2.1. Os cenários ligam workload, comportamento funcional e thresholds ao `RISK-019`; `RISK-018` fornece contexto secundário para a leitura da página de produto.

`RISK-014` permanece sem cobertura determinística: a baseline atual não possui frete e pagamento configurados para concluir pedidos e observar movimentação concorrente de estoque com restauração confiável. O teste não força esse experimento nem declara proteção contra overselling.

## Cenários

| Perfil | Workload | Pergunta respondida |
|---|---|---|
| Smoke | 2 iterações/s por 10 s; cada iteração lê o produto e valida a rejeição de um pedido sem identificador de carrinho | Existe regressão grosseira de latência, erro ou comportamento na entrada da jornada e na validação de pedido? |
| Load | 3 usuários simultâneos por 20 s, com uma validação por usuário a cada segundo, contra um carrinho real incompleto e isolado | A validação transacional permanece rápida e determinística sob concorrência controlada? |

O runner cria um único carrinho para o load, passa somente seu identificador ao k6 e remove o último item em `finally`, inclusive quando um threshold falha. Pelo contrato do EverShop 2.2.1, salvar um carrinho vazio remove o próprio carrinho. VUs não criam nem compartilham mutações de estoque. O volume fica abaixo do limite nativo de 120 chamadas de API por IP a cada 60 segundos; uma resposta 429 continua sendo falha, não resultado esperado. Somente a limpeza respeita `Retry-After` quando necessário, sem repetir requisições medidas.

## Métricas e thresholds

- `http_req_duration` p95: produto abaixo de 1000 ms; validação de pedido abaixo de 500 ms;
- `http_req_failed`: taxa igual a zero para respostas esperadas;
- `checks`: 100% das regras funcionais aprovadas;
- `dropped_iterations`: zero no smoke de taxa constante;
- volume: ao menos 20 iterações no smoke e 54 no load.

Esses limites foram calibrados contra p95 observados de 135–280 ms para produto, 15–30 ms para validação no smoke e 56–125 ms sob três usuários simultâneos, preservando margem para variação do runner. São thresholds de laboratório, não SLA ou SLO de produção, e devem ser refinados somente com histórico comparável.

## Execução

Pré-requisitos: SUT saudável, Node.js 22+ e k6 OSS `2.1.0` disponível no `PATH`.

Na pasta `quality`:

```bash
npm run performance:smoke
npm run performance:load
```

Use `BASE_URL` somente quando o SUT estiver em outro endereço. Os arquivos `performance-<perfil>-<execução>-summary.json` registram workload, p95, taxa de erro, checks e thresholds; a saída padrão do k6 continua visível e fornece a decisão PASS/FAIL.

Resultados locais são baseline de engenharia e não representam capacidade certificada de produção. Na versão 2.2.1, um UUID de carrinho inexistente chega a HTTP 500; por isso o smoke usa a rejeição HTTP 400 definida pelo schema para ausência do identificador, sem tratar erro interno como resposta esperada.
