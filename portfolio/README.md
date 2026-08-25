# Central de Evidências de Qualidade

Hub público de evidências determinísticas, relatórios e histórico auditável de qualidade do Quality Engineering Lab.

O código-fonte da aplicação estática fica em `portfolio/` e a saída descartável é gerada em `portfolio/dist/`, sem framework, backend ou dependências de runtime.

## Estrutura atual

**Página única** (`/index.html`), reunindo em um único lugar:

- destaque para a última execução com métricas dos três pilares (funcional, segurança e performance);
- ações diretas: visualização do PDF em modal, abertura do Playwright Report em nova aba e link para o GitHub Actions;
- histórico das execuções recentes em tabela (desktop) e cards (mobile).

Os artefatos de cada execução (PDFs, Playwright Reports) são armazenados em `portfolio/dist/runs/<run-id>/` e referenciados diretamente pela página — não como rotas navegáveis independentes.

O PDF `quality-report-latest.pdf` permanece como alias estável para o relatório mais recente.

## Preview local

Na raiz do repositório:

```bash
node portfolio/scripts/build.mjs
node portfolio/scripts/serve.mjs
```

Abra `http://localhost:4173`. O build ingere o manifesto `output/quality-summary.json` (quando disponível) e aplica a janela deslizante de 7 dias.

## Publicação

O workflow **Validação Noturna de Qualidade** compila `portfolio/dist/` e realiza o deploy no GitHub Pages a cada execução bem-sucedida.

> A evolução da estrutura multi-rota para página única está documentada no [ADR 0009](../docs/adr/0009-quality-evidence-hub-and-nightly-validation.md).
