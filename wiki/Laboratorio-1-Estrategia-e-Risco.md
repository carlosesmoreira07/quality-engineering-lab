## Laboratório 1 — Estratégia Baseada em Risco e SUT Baseline

### 1. Contexto e Objetivo
O Laboratório 1 estabelece os alicerces da Engenharia de Qualidade orientada a riscos de negócio. Em vez de testar funcionalidades de forma dispersa, a disciplina começa pela análise de impacto financeiro e operacional sobre as jornadas críticas de um comércio eletrônico real (SUT EverShop 2.2.1).

### 2. Riscos de Negócio Mapeados
- **Integridade Transacional:** divergências entre vitrine, carrinho e fechamento de pedidos.
- **Proteção Financeira:** preservação exata de valores monetários, descontos e taxas calculadas.
- **Isolamento de Contas:** integridade de pedidos e dados de clientes sem vazamento entre sessões.
- **Continuidade Operacional:** resiliência da infraestrutura de microsserviços e banco de dados relacional.

### 3. Controles e Entregas Técnicas
- **Matriz de Riscos Versionada:** catalogação formal de probabilidades, impactos e camadas recomendadas de observação em `docs/quality-strategy.md`.
- **Decisão Arquitetural (ADR-0001):** adoção de um Sistema Sob Teste (SUT) realista e reproduzível localmente e no CI, evitando ambientes mockados frágeis.
- **Rastreabilidade Técnica:** padronização de annotations de risco nos testes do Playwright (`risk: 'RISK-00X'`), permitindo auditar a cobertura sem matrizes manuais paralelas.

### 4. Critério de Decisão
Nenhum controle existe isolado da estratégia: um teste só é implementado quando responde a um dano concreto que precisa ser prevenido antes do deploy em produção.

---
Próximo laboratório: [Laboratório 2: Automação e Quality Gates](Laboratorio-2-Automacao-e-Quality-Gates).
