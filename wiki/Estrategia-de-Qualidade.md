

## Princípio central

O nome do risco de negócio vem primeiro. Identificadores como `RISK-002` permanecem apenas como referência técnica para rastreabilidade entre estratégia, testes e relatórios.

Exemplo: **Integridade do preço apresentado na compra** (`RISK-002`).

## O que orienta a prioridade

A estratégia considera impacto, probabilidade e relevância para as jornadas de comércio eletrônico. Os riscos de maior atenção envolvem:

- integridade de preço, itens e totais;
- proteção de conta e privacidade de pedidos;
- prevenção de pedidos duplicados e dados incompletos;
- consistência entre Administração, vitrine, estoque e compra;
- disponibilidade e previsibilidade da jornada crítica.

A [matriz versionada de riscos](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/quality-strategy.md) é a fonte única para nomes, severidades, categorias e identificadores. A Wiki não a duplica.

## Como um controle é escolhido

| Camada | Pergunta principal |
|---|---|
| Web funcional | O cliente percebe a jornada e o resultado corretos? |
| API e integração | Regras, contratos e persistência permanecem íntegros? |
| Segurança | Identidades e privilégios continuam isolados? |
| Performance | A jornada permanece disponível e previsível sob o perfil observado? |
| Exploração humana | Há estados novos, ambíguos ou visuais que exigem investigação? |

Um risco não implica automaticamente um teste E2E. A menor camada capaz de observar a falha com diagnóstico confiável é preferida; camadas são combinadas somente quando oferecem sinais diferentes.

## Rastreabilidade sem ruído

Playwright mantém annotations técnicas de risco e k6 documenta o comportamento, o perfil, as verificações e os limites de decisão. Relatórios apresentam o nome orientado ao negócio e deixam o ID em posição secundária.

Próximo passo: [Arquitetura e Capacidades](Arquitetura-e-Capacidades).
