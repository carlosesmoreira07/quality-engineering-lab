# IA aplicada ao fluxo de Quality Engineering

## Objetivo

O QEL-8 usa IA como acelerador de análise, não como decisor. A skill `qe-impact-analysis` conecta uma demanda do Jira à estratégia de riscos e aos controles existentes no repositório, identifica gaps e entrega recomendações para revisão humana.

## Como usar

Com o Atlassian Rovo conectado e o repositório aberto no Codex:

```text
Use $qe-impact-analysis para analisar o impacto de qualidade do QEL-4.
```

A skill fica em `.agents/skills/qe-impact-analysis/`, localização oficial de skills versionadas no repositório. O Codex detecta alterações automaticamente; se ela não aparecer no seletor, reinicie a sessão.

## Fluxo implementado

1. Ler o card Jira em modo somente leitura.
2. Entender objetivo, critérios e impacto nas jornadas do produto.
3. Consultar `CONTEXT.md`, estratégia de qualidade e ADRs.
4. Descobrir metadados e assertions/checks nos testes Playwright, k6 e workflows atuais.
5. Classificar cada relação como `COBERTO`, `PARCIALMENTE COBERTO`, `NÃO COBERTO` ou `NÃO APLICÁVEL`.
6. Priorizar gaps pelo risco e recomendar o menor controle eficaz.
7. Entregar a análise para revisão humana, sem alterar Jira, código, testes ou gates.

Não existe planilha ou índice manual entre riscos e testes. A análise lê as anotações `risk`, assertions, checks, thresholds e limitações diretamente das fontes atuais. A existência de um controle não é apresentada como PASS sem evidência de uma execução verificada.

## Guardrails

- nenhuma decisão crítica ou aprovação de release é delegada à IA;
- nenhuma escrita no Jira, implementação de teste ou alteração de código ocorre durante a análise;
- secrets, `.env`, cookies e authorization headers não entram no contexto ou na saída;
- um vínculo textual com `RISK-*` não basta: o comportamento observado pelo controle precisa ser confirmado;
- a recomendação permanece pequena, priorizada e vinculada a um risco real.

## Avaliação de `mattpocock/skills`

A avaliação foi feita sobre o repositório público e sua licença MIT em 20/08/2026. Nenhuma skill externa foi instalada ou copiada. Foram adotados apenas princípios compatíveis com o card.

| Item | Classificação | Decisão para o laboratório |
|---|---|---|
| Pesquisa com fontes primárias (`research`) | ADOTAR AGORA | Incorporar a disciplina de fontes oficiais e rastreáveis à skill própria; não instalar o workflow dependente de subagente. |
| Glossário e ADRs (`domain-modeling`, `CONTEXT.md`) | ADOTAR AGORA | Usar um glossário pequeno e ADRs somente para decisões duráveis; `docs/quality-strategy.md` continua sendo a fonte de riscos. |
| Diagnóstico disciplinado (`diagnosing-bugs`) | REFERÊNCIA | Redação de secrets e feedback loop são úteis, mas diagnóstico/fix não pertence à análise de impacto. |
| Design de módulos (`codebase-design`) | REFERÊNCIA | Vocabulário de interfaces e seams é útil em futuras mudanças de arquitetura, não neste fluxo consultivo. |
| `code-review` | DEPOIS | Separar aderência a padrões e à especificação é valioso, mas o workflow exige configuração adicional e subagentes. |
| `tdd` | DEPOIS | Red-green em seams acordados pode fortalecer futuras implementações, mas QEL-8 não cria testes. |
| `setup-matt-pocock-skills` | REFERÊNCIA | A estrutura inspira instruções curtas, porém assume configuração própria de tracker; o laboratório já usa Jira via Atlassian Rovo. |
| `to-spec` e `to-tickets` | NÃO ADOTAR | Publicam conteúdo no tracker e trazem convenções que conflitariam com a regra de análise read-only e com o padrão Jira existente. |
| `implement` | NÃO ADOTAR | Implementa, revisa e faz commit automaticamente; é o oposto do limite consultivo desta skill. |
| `improve-codebase-architecture` | NÃO ADOTAR | Relatório HTML, subagentes e grilling ampliariam o escopo sem reduzir um risco atual do QEL-8. |
| Instalação via `npx skills` e atualização externa | NÃO ADOTAR AGORA | Introduziria arquivos e ciclo de atualização de terceiros sem necessidade. Uma skill própria e pequena é suficiente. |
| Plugin nativo Codex do projeto externo | DEPOIS | O próprio projeto informa que ainda está no roadmap; o formato `SKILL.md` é compatível, mas a distribuição nativa não está pronta. |

Referências: [skills oficiais do Codex](https://learn.chatgpt.com/docs/build-skills), [AGENTS.md no Codex](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [mattpocock/skills](https://github.com/mattpocock/skills) e [licença MIT](https://github.com/mattpocock/skills/blob/main/LICENSE).

## Limitações

A análise depende da qualidade do card, da atualidade da estratégia e da clareza dos metadados dos testes. Ela não prova que um controle passou recentemente, não substitui exploração humana e não resolve limitações da baseline. Recomendações precisam ser revisadas antes de virar backlog ou código.
