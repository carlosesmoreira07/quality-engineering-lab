As Architecture Decision Records (ADRs) registram contexto, decisão, alternativas e consequências. Na Wiki elas são apresentadas como **Decisões de Arquitetura**; os arquivos técnicos continuam versionados no repositório e são a fonte oficial dos detalhes.

| Decisão | O que esclarece | Registro técnico |
|---|---|---|
| Ambiente de referência reproduzível | por que EverShop roda como dependência externa fixada | [ADR 0001](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0001-sut-baseline-strategy.md) |
| Fundação da automação | por que Playwright, TypeScript e Chromium foram escolhidos | [ADR 0002](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0002-automation-architecture.md) |
| Barreiras de CI | como Pull Requests são aprovados ou bloqueados | [ADR 0003](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0003-ci-quality-gates.md) |
| Performance proporcional ao risco | por que smoke frequente e carga manual são suficientes hoje | [ADR 0004](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0004-performance-testing-strategy.md) |
| Segurança orientada a risco | como comportamento, código, dependências e secrets são protegidos | [ADR 0005](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0005-security-quality-strategy.md) |
| IA assistiva | por que IA recomenda, mas não altera nem aprova | [ADR 0006](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0006-ai-assisted-quality-engineering.md) |
| Regressões controladas | como provar detecção sem contaminar a versão estável | [ADR 0007](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0007-controlled-regression-experiments.md) |
| Portfolio Showcase | por que a narrativa pública usa site estático e fontes reais | [ADR 0008](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0008-portfolio-showcase.md) |

Novas decisões devem ser registradas somente quando forem duráveis e tiverem alternativas relevantes. Guias de uso e detalhes operacionais pertencem aos READMEs técnicos, não aos ADRs.
