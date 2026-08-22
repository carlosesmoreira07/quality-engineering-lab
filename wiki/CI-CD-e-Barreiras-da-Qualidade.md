# CI/CD e Barreiras da Qualidade

## Dois momentos, duas decisões

### Antes do merge: Quality Gate

Pull Requests para `main` precisam demonstrar:

1. dependências sem nova vulnerabilidade alta ou crítica;
2. tipos e configuração aprovados;
3. ambiente de referência iniciado e saudável;
4. controles funcionais, API e segurança aprovados;
5. performance smoke aprovada;
6. evidências obrigatórias produzidas.

Qualquer falha obrigatória deixa o workflow vermelho. Não existe score, tolerância percentual ou aprovação por IA.

### Depois do merge: confirmação de saúde

Todo push na `main` executa um smoke pequeno, read-only e repetível. Ele confirma Home, catálogo/produto, consulta pública, bloqueio administrativo anônimo e disponibilidade básica. Não cria carrinho, pedido, produto ou estoque e não substitui o Quality Gate do PR.

## Onde cada barreira entra

```text
Mudança proposta
  → desenvolvimento
  → validação funcional/API
  → segurança
  → performance
  → evidências e decisão
  → merge
  → smoke de saúde da main
```

## Controles complementares

CodeQL também analisa Pull Requests e pushes na `main`. O deploy do Portfolio usa um workflow separado e não interfere na decisão de qualidade do produto.

Fontes: [Quality Gate](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/.github/workflows/quality-gate.yml), [Post-merge Smoke](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/.github/workflows/post-merge-smoke.yml) e [CodeQL](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/.github/workflows/codeql.yml).
