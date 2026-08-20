# ADR 0006 — IA assistiva na análise de impacto de qualidade

## Status

Aceita.

## Contexto

O QEL-8 precisa demonstrar valor prático de IA conectando Jira, estratégia baseada em riscos e automação existente. A solução deve permanecer revisável e evitar uma plataforma paralela, índice manual risco-teste ou decisão autônoma de qualidade.

## Decisão

Adotar uma skill de repositório chamada `qe-impact-analysis`, armazenada em `.agents/skills`, com instruções declarativas e sem scripts próprios. O fluxo lê o card Jira via Atlassian Rovo em modo somente leitura, consulta a estratégia e descobre controles no estado atual dos testes Playwright, cenários k6 e workflows.

Cada risco é classificado como `COBERTO`, `PARCIALMENTE COBERTO`, `NÃO COBERTO` ou `NÃO APLICÁVEL`. A classificação exige confirmação do comportamento observado por assertions, checks ou gates; associação textual isolada não comprova cobertura. A saída recomenda controles por prioridade e termina em revisão humana.

A IA não escreve no Jira, implementa testes, altera código ou participa do Quality Gate. `AGENTS.md` registra guardrails duráveis e `CONTEXT.md` define apenas o vocabulário necessário; a estratégia de riscos continua em `docs/quality-strategy.md`.

## Alternativas consideradas

- API paga, backend, LangChain, embeddings, banco vetorial, RAG, Ollama ou chatbot: rejeitados por custo e complexidade sem ganho necessário para o MVP;
- planilha ou catálogo manual risco-teste: rejeitado porque diverge dos metadados vivos do repositório;
- instalar integralmente `mattpocock/skills`: rejeitado por sobreposição de workflows, escrita automática no tracker e custo de atualização;
- usar a conclusão da IA como gate: rejeitado por não ser determinística nem apropriada para decisão crítica sem revisão.

## Consequências

O laboratório ganha uma análise repetível e versionada usando as ferramentas já disponíveis. A qualidade do resultado depende do card, da estratégia e dos metadados existentes, e a skill pode exigir refinamento quando novas camadas de teste surgirem. Toda recomendação continua consultiva e pode ser recusada ou ajustada por uma pessoa.
