## Visão da solução

```text
EverShop + PostgreSQL
        ↓
Playwright (Web, API e segurança) + k6 (performance)
        ↓
GitHub Actions (barreiras antes e depois do merge)
        ↓
HTML técnico + attachments + métricas + PDF executivo
```

## Componentes e responsabilidades

| Componente | Responsabilidade | Fonte técnica |
|---|---|---|
| Ambiente de referência | Disponibilizar EverShop 2.2.1 e dados reproduzíveis | [SUT](https://github.com/carlosesmoreira07/quality-engineering-lab/tree/main/sut) |
| Automação Playwright | Validar Web, API, integração e autorização em Chromium | [quality](https://github.com/carlosesmoreira07/quality-engineering-lab/tree/main/quality) |
| Performance k6 | Observar disponibilidade, comportamento e tempo de resposta | [performance](https://github.com/carlosesmoreira07/quality-engineering-lab/tree/main/quality/performance) |
| GitHub Actions | Executar barreiras e publicar evidências | [workflows](https://github.com/carlosesmoreira07/quality-engineering-lab/tree/main/.github/workflows) |
| Experimentos | Inserir regressões locais, temporárias e reversíveis | [experiments](https://github.com/carlosesmoreira07/quality-engineering-lab/tree/main/experiments) |
| IA assistiva | Analisar impacto sem decidir ou alterar o produto | [documentação de IA](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/ai-quality-engineering.md) |

## Escolhas de simplicidade

- Chromium único enquanto não houver risco concreto de compatibilidade entre navegadores;
- recursos nativos do Playwright para relatório, trace e screenshot;
- k6 em perfis pequenos, sem plataforma externa de observabilidade;
- Docker Compose para reproduzir o ambiente local e de CI;
- GitHub Actions e controles nativos do GitHub para decisão e segurança do repositório.

As justificativas e alternativas estão nas [Decisões de Arquitetura](Decisoes-de-Arquitetura).

Próximo passo: [Controles e Evidências](Controles-e-Evidencias).
