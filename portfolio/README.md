# Portal de Evidências de Qualidade

Portal executivo de evidências determinísticas, relatórios e histórico auditável de qualidade do Quality Engineering Lab.

O código-fonte da aplicação estática fica em `portfolio/` e a saída descartável é gerada em `portfolio/dist/`, sem framework, backend ou dependências de runtime.

## Estrutura de Rotas

- `/`: Página inicial com destaque para a **ÚLTIMA EXECUÇÃO** e tabela das execuções dos últimos 7 dias.
- `/latest/`: Visão detalhada da última execução com download do Quality Report em PDF e links para o CI.
- `/runs/`: Listagem histórica completa das execuções dentro da janela deslizante semanal.
- `/runs/<run-id>/`: Permalinks individuais para cada execução histórica.

## Preview local

Na raiz do repositório:

```bash
node portfolio/scripts/build.mjs
node portfolio/scripts/serve.mjs
```

Abra `http://localhost:4173`. O build ingere automaticamente o manifesto estruturado `output/quality-summary.json` (se gerado) e filtra as execuções para a janela deslizante de 7 dias.

## Publicação

O workflow **Nightly Quality Validation** e as atualizações de documentação compilam `portfolio/dist/` e realizam o deploy direto para o GitHub Pages (`actions/deploy-pages`).
