# ADR 0009 — Quality Evidence Hub, Nomenclatura Rastreável e Validação Nightly

## Status

Aceito.

## Contexto

O Quality Engineering Lab demandava evolução em três frentes:
1. **Nomenclatura dos relatórios:** o nome estático anterior (`qel-4-test-evidence.pdf`) não permitia rastreabilidade temporal nem identificação inequívoca das execuções em CI.
2. **Central de evidências pública:** transição do GitHub Pages para atuar como um **Quality Evidence Hub**, destacando a última execução de qualidade e disponibilizando histórico navegável da janela deslizante semanal sem versionar binários na branch `main`.
3. **Validação diária e segregação de ambientes:** execução agendada (Nightly) da bateria completa em ambiente hermético no CI e estabelecimento de regra explícita de governança para produção.

## Decisão

1. **Padrão de Nomenclatura Rastreável:**
   - Para cada execução: `quality-report_<timestamp-ISO>_run-<github-run-id>.pdf` (ex: `quality-report_2026-08-25T0113Z_run-123456789.pdf`). Em execução local, utiliza fallback determinístico `run-local`.
   - Ponteiro estável para consumo público: `quality-report-latest.pdf`.
   - Manifesto estruturado de execução: `output/quality-summary.json`.

2. **Quality Evidence Hub no GitHub Pages:**
   - Estrutura multi-rota estática sem framework:
     - `/`: Home destacando fortemente a **ÚLTIMA EXECUÇÃO** e listando as execuções dos últimos 7 dias.
     - `/latest/`: Visão detalhada da última execução com download do PDF oficial e links para o CI.
     - `/runs/`: Histórico completo da janela semanal de 7 dias.
     - `/runs/<run-id>/`: Permalinks individuais para cada execução histórica.
   - Janela deslizante de 7 dias mantida automaticamente no build; zero armazenamento infinito e zero versionamento de PDFs em `main`.

3. **Pipeline Nightly Quality Validation:**
   - Agendamento diário às 03:17 (America/Sao_Paulo) / 06:17 UTC (`17 6 * * *`) e suporte a `workflow_dispatch`.
   - Executa a bateria completa (typecheck, SUT reproduzível, testes funcionais Web, API, segurança, performance smoke para regressão diária, relatórios e deploy no Pages) em runner isolado do CI.

4. **Governança de Ambientes e Regra Rígida de Produção:**
   - **Ambiente Isolado (Nightly/CI):** Bateria completa com criação de dados sintéticos e mutações controladas em container efêmero.
   - **Ambiente de Produção:** **SOMENTE validações estritamente read-only** (como o `post-merge-smoke` existente). **NUNCA executar criação, alteração ou exclusão de dados em produção.**

## Consequências

- Rastreabilidade ponta a ponta entre execuções de CI, relatórios PDF e links do GitHub Actions/PRs.
- Publicação contínua de evidências sem poluição do histórico Git.
- Segurança operacional blindada pela proibição estrita de mutações em produção.

## Evolução — Consolidação em Página Única (QEL-11)

A estrutura multi-rota descrita acima foi implementada e validada. Posteriormente, a análise de uso identificou redundância: as rotas `/latest/` e `/runs/` duplicavam conteúdo já presente na Home e adicionavam navegação desnecessária para uma janela de apenas 7 dias.

A Central de Evidências foi consolidada em **página única** (`/index.html`), passando a reunir em um único lugar:

- destaque para a última execução com métricas dos três pilares (funcional, segurança, performance);
- ações diretas: visualização do PDF em modal, download e abertura do Playwright Report em nova aba;
- histórico das execuções recentes em tabela (desktop) e cards (mobile);
- link para o GitHub Actions de cada execução.

As rotas `/latest/` e `/runs/` não existem mais como páginas de navegação pública. Os artefatos históricos (PDFs, Playwright Reports) continuam associados individualmente às execuções reais em `runs/<run-id>/` dentro de `portfolio/dist/`, utilizados como endpoints de link — não como páginas navegáveis independentes.

O PDF `quality-report-latest.pdf` permanece como alias estável para o relatório mais recente.
