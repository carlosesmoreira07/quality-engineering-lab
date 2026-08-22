# Experimentos controlados de regressão

Este laboratório demonstra, de forma isolada e reversível, que controles já existentes detectam regressões relevantes. Cada execução conta a mesma história: estado esperado **GREEN** → variante controlada **RED** → estado restaurado **GREEN**. O SUT padrão não é alterado.

| Experimento | Risco | Regressão temporária | Controle existente |
|---|---|---|---|
| EXP-001 | Integridade do preço apresentado na compra (`RISK-002`) | preço apresentado como `$36.00` no lugar de `$35.00` na página do produto | `product-cart.spec.ts` |
| EXP-002 | Desempenho da descoberta de produtos (`RISK-018`) | atraso local de 1.250 ms na página do produto | cenário k6 `smoke.js`, com `p(95)<1000` inalterado |
| EXP-003 | Proteção do acesso administrativo a pedidos (`RISK-016`) | resposta local `200` para cancelamento anônimo que deveria retornar `401` | `authorization-boundaries.spec.ts` |

As variantes existem somente em um proxy HTTP efêmero em `127.0.0.1`. O proxy é encerrado antes da terceira fase. O EXP-003 não encaminha nem executa o cancelamento: ele simula, na borda local, o efeito observável de um bypass de autorização sem alterar dados.

## Execução local

Pré-requisitos: SUT saudável em `http://localhost:3000`, dependências de `quality/`, Chromium do Playwright e k6 disponível.

Execute a partir de `quality/`:

```bash
npm run experiment:functional
npm run experiment:performance
npm run experiment:security
npm run experiment:all
```

É possível apontar para outra versão estável saudável com `BASE_URL`. Os comandos locais retornam sucesso somente quando observam GREEN → RED → GREEN. Evidências concisas são gravadas em `experiments/results/` e não são versionadas.

No GitHub Actions, o workflow **Controlled Regression Experiments** aceita execução exclusivamente manual (`workflow_dispatch`). O job permanece vermelho porque propaga o código real do controle que reprovou a variante; o JSON diferencia explicitamente `productGateDuringVariant: REPROVADO` de `experimentResult: DETECÇÃO APROVADA`. Assim, o mesmo check configurado como obrigatório bloquearia um merge, embora a detecção seja o resultado esperado do experimento.

## Análise de impacto assistida por IA

A skill `qe-impact-analysis` foi aplicada consultivamente ao EXP-001. Ela relacionou a alteração observável à **integridade do preço apresentado na compra** (`RISK-002`) e confirmou que a asserção existente no fluxo de produto/carrinho é um controle adequado. Nenhum teste, threshold, Jira ou Quality Gate foi modificado pela análise.

## Limitações

- As variantes comprovam a capacidade de detecção dos controles escolhidos; não representam cobertura integral dos riscos.
- O proxy modela efeitos observáveis específicos e não injeta defeitos no código-fonte ou na imagem do SUT.
- A execução manual vermelha deve ser interpretada junto ao artifact estruturado do experimento.
