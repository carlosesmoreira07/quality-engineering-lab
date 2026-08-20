---
name: qe-impact-analysis
description: Analisa o impacto de qualidade de um card Jira ou demanda, relacionando riscos da estratégia, controles automatizados existentes, gaps e recomendações priorizadas para revisão humana. Use quando pedirem análise de impacto, cobertura por risco, testes afetados ou quality impact analysis. Não use para implementar testes, alterar código, atualizar Jira ou decidir um Quality Gate automaticamente.
---

# QE Impact Analysis

Produza uma análise consultiva e rastreável. Leia fontes atuais; não mantenha uma matriz manual risco-teste e não trate a conclusão da IA como decisão final.

## Entradas

- Chave ou URL de um card Jira, preferencialmente; ou texto integral da demanda.
- Repositório atual com estratégia de qualidade, testes e metadados.
- Escopo adicional informado pela pessoa, se houver.

Se houver uma chave Jira e o Atlassian Rovo estiver disponível, leia o card por ele. Não altere campos, comentários, sprint ou status. Se o conector não estiver disponível, solicite o texto da demanda; não invente critérios.

## Fluxo

1. Leia `CONTEXT.md`, `AGENTS.md`, `docs/quality-strategy.md` e os ADRs relevantes quando existirem.
2. Leia título, objetivo, critérios de aceite e restrições da demanda. Separe fatos explícitos de inferências.
3. Descreva o impacto funcional e técnico em linguagem de negócio: jornadas, dados, fronteiras de confiança, integrações e características não funcionais afetadas.
4. Relacione o impacto aos riscos existentes da estratégia. Proponha um novo risco somente quando nenhum risco atual representar a falha; marque-o como sugestão para revisão humana, sem editar a estratégia.
5. Descubra controles no estado atual do repositório. Pesquise dinamicamente:
   - anotações, tags, nomes e assertions dos testes Playwright;
   - cenários, checks e thresholds k6;
   - workflows de CI e Quality Gates;
   - documentação técnica e ADRs que expliquem intenção ou limitação.
6. Abra os arquivos candidatos e confirme o comportamento realmente observado. Uma menção a `RISK-*`, um nome de teste ou uma nota documental, isoladamente, não comprova cobertura.
7. Classifique cada risco ou comportamento com os critérios abaixo.
8. Priorize gaps pelo risco da estratégia, impacto da demanda, capacidade de detecção e custo do controle. Recomende a menor camada capaz de observar a falha.
9. Entregue o resultado no formato definido e termine com perguntas ou decisões que exigem validação humana.

Use `rg`/`rg --files` para descoberta. Exclua dependências, resultados gerados, reports e `.env` da busca sempre que possível. Nunca mostre senha, token, cookie, cabeçalho de autorização, secret ou dado pessoal desnecessário.

## Classificação de cobertura

- **COBERTO**: existe controle executável que alcança o comportamento relevante, contém assertion/check capaz de detectar a falha e usa uma camada adequada. Cite o arquivo e o sinal observado.
- **PARCIALMENTE COBERTO**: o controle cobre apenas parte da regra, um caminho adjacente ou uma camada insuficiente. Declare exatamente o que está e o que não está protegido.
- **NÃO COBERTO**: nenhum controle executável encontrado detecta a falha relevante. Documentação ou plano futuro não contam como controle.
- **NÃO APLICÁVEL**: a demanda não aciona o risco ou a baseline deliberadamente não oferece a capacidade necessária. Cite a justificativa; não use esta classe para esconder um gap viável.

Não confunda existência de teste com resultado recente aprovado. Só declare PASS quando houver evidência de execução fornecida ou verificada nesta análise. Caso contrário, diga `controle existente; execução não verificada`.

## Formato de saída

### Demanda e confiança

- Card, objetivo em uma frase e fontes consultadas.
- Confiança `alta`, `média` ou `baixa`, com a principal incerteza.

### Impacto de qualidade

Liste somente jornadas, regras, dados, integrações ou fronteiras materialmente afetadas.

### Riscos e cobertura

| Risco | Relação com a mudança | Classificação | Controle e evidência |
|---|---|---|---|

Cite caminhos do repositório e descreva a assertion/check relevante. Evite colar código.

### Gaps e recomendações

| Prioridade | Gap | Controle sugerido | Por que esta camada |
|---|---|---|---|

Inclua somente recomendações que reduzam um risco identificado. Não gere casos decorativos nem percentuais de cobertura.

### Revisão humana

Liste as decisões que uma pessoa precisa confirmar. Termine com: `Análise consultiva: nenhuma mudança em código, testes, Jira ou Quality Gate foi executada.`

## Limites

- Não crie, edite ou execute automaticamente testes ou código.
- Não altere Jira, estratégia, ADRs, CI ou Quality Gates.
- Não declare cobertura total por associação lexical.
- Não transforme recomendação em requisito sem aceite humano.
- Não use IA como aprovador de release ou gate de merge.
