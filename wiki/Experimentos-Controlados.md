## Por que existem

Um controle verde mostra que o comportamento esperado foi observado. Um experimento controlado complementa essa evidência ao demonstrar que o mesmo controle fica vermelho quando uma regressão específica é introduzida.

## Modelo

**Versão estável saudável → regressão temporária detectada → versão estável restaurada**

As variantes existem somente em um proxy local e efêmero. Elas não alteram testes, critérios, imagem ou dados permanentes do ambiente de referência.

| Experimento | Risco de negócio | Sinal esperado |
|---|---|---|
| Preço divergente | Integridade do preço apresentado na compra (`RISK-002`) | controle de produto/carrinho reprova |
| Resposta lenta | Desempenho da descoberta de produtos (`RISK-018`) | limite de tempo de resposta reprova |
| Acesso anônimo indevido | Proteção do acesso administrativo a pedidos (`RISK-016`) | controle de autorização reprova |

O workflow é manual. Durante a variante, o check permanece vermelho por desenho; o artifact informa separadamente que a capacidade de detecção foi aprovada.

Fontes: [guia dos experimentos](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/experiments/README.md) e [decisão de arquitetura](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0007-controlled-regression-experiments.md).
