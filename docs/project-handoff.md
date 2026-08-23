# Handoff técnico — Quality Engineering Lab

> Estado verificado em 22 de agosto de 2026, a partir da `main` no commit `fc2aac9`. Este documento é contexto inicial para continuidade; as fontes indicadas abaixo prevalecem quando houver divergência.

## 1. Visão geral

O Quality Engineering Lab demonstra como converter riscos de negócio de um e-commerce em controles automatizados, evidências auditáveis e decisões objetivas. O produto não é desenvolvido neste repositório: o Sistema Sob Teste (SUT) é o **EverShop 2.2.1**, executado por Docker com PostgreSQL e dados oficiais de demonstração.

Capacidades entregues:

- ambiente local reproduzível e saudável;
- estratégia de qualidade baseada em riscos;
- automação Web e API com Playwright/TypeScript;
- controles de performance com k6;
- segurança comportamental, SAST, dependências e proteção de secrets;
- Quality Gates de Pull Request e smoke pós-merge;
- evidências técnicas em HTML/JSON e resumo executivo em PDF;
- experimentos controlados GREEN → RED → GREEN;
- Portfolio Showcase em GitHub Pages;
- análise de impacto assistida por IA, sempre consultiva;
- README de entrada e Wiki navegável versionada.

O projeto está próximo da v1.0. Os cards QEL-1 a QEL-12, QEL-14, QEL-16 e QEL-17 estão concluídos; QEL-13 e QEL-15 permanecem pendentes.

## 2. Arquitetura

```text
.github/workflows/     GitHub Actions e barreiras automatizadas
docs/                  estratégia, decisões e este handoff
experiments/           regressões controladas e proxy efêmero
portfolio/             landing estática e build do GitHub Pages
quality/
  tests/               suítes Playwright por interface e domínio
  src/                 dados, Page Objects pequenos e evidências
  performance/         cenários, configuração e runner k6
  scripts/             geração do Quality Summary
sut/                   Docker Compose e bootstrap do EverShop
wiki/                  fonte versionada da Wiki oficial
```

- **SUT:** `sut/docker-compose.yml` fixa EverShop `2.2.1` por versão e digest e PostgreSQL `16.10-alpine`. `sut/bootstrap.mjs` prepara seed e Home de forma idempotente. O código do EverShop não pertence ao repositório.
- **Playwright/TypeScript:** Playwright Test `1.62.1`, TypeScript estrito, Chromium apenas, zero retry e `test.only` proibido. Page Objects existem somente para interações reutilizadas da Storefront; API usa `APIRequestContext` diretamente.
- **Web/API:** testes são separados por interface e domínio. Fluxos transversais, como Administração → Storefront, combinam preparação por API e validação Web quando cada camada produz sinal distinto.
- **k6:** k6 OSS `2.1.0`, com perfis `smoke`, `post-merge-smoke` e `load`. O runner Node prepara dados quando necessário, chama k6 e produz JSON resumido.
- **Segurança:** autorização horizontal e vertical no SUT, CodeQL, Dependency Review, Dependabot, Secret Scanning e Push Protection. Não representa pentest, DAST amplo ou cobertura integral do OWASP Top 10.
- **CI/CD:** GitHub Actions reutiliza o mesmo Docker Compose, Node.js 24 no runner, Chromium e k6. A versão Node interna das actions não define a versão da aplicação.
- **Pages:** `portfolio/` é HTML/CSS/JS sem framework; `portfolio/scripts/build.mjs` gera e valida `portfolio/dist/` antes do deploy.
- **Evidências:** Playwright gera HTML, JSON, traces e screenshots diagnósticos; o gerador em `quality/scripts/generate-quality-summary.mjs` consolida resultados Playwright/k6 e a matriz de riscos em PDF executivo.

As decisões duráveis estão em [docs/adr/](adr/). Preserve a arquitetura atual até um risco concreto justificar evolução.

## 3. Estratégia de qualidade

O modelo central é:

**risco de negócio → controle executável → evidência observável → decisão**

A fonte única da matriz, nomes de negócio, categorias e severidades é [docs/quality-strategy.md](quality-strategy.md). Testes Playwright mantêm annotations `risk`; cenários k6 documentam risco, perfil de carga, checks e limites. Associação textual isolada não comprova cobertura: a assertion, o check ou a barreira precisa observar a falha relevante.

Na comunicação, o **nome de negócio vem primeiro** e `RISK-XXX` aparece como referência técnica secundária. Os IDs não devem ser removidos ou renumerados porque sustentam rastreabilidade e cálculos de cobertura.

Quality Gates são regras determinísticas, não avaliações de IA. Eles bloqueiam uma mudança quando typecheck, saúde do SUT, testes, performance ou evidências obrigatórias falham. A skill `qe-impact-analysis` apenas recomenda e exige revisão humana; não altera Jira, código ou decisão de merge.

## 4. Workflows

| Workflow | Quando executa | Papel |
|---|---|---|
| `quality-gate.yml` | PR para `main`; manual com smoke ou load | Decide antes do merge: dependências, TypeScript, SUT, Web/API/segurança, performance e evidências |
| `codeql.yml` | PR para `main`, push em `main` e manual | Analisa JavaScript/TypeScript em paralelo ao Quality Gate |
| `post-merge-smoke.yml` | Todo push em `main` | Confirma rapidamente a saúde do commit incorporado; não decide o merge |
| `portfolio-pages.yml` | Push em `main` que altere `portfolio/**` ou o workflow; manual | Valida, empacota e publica `portfolio/dist/` no GitHub Pages |
| `controlled-regression-experiments.yml` | Somente manual | Demonstra GREEN → RED → GREEN sem contaminar o SUT saudável |

O **PR Quality Gate** executa a suíte completa atual e cria administrador efêmero a partir de GitHub Secrets. O **Post-merge Smoke** executa um recorte read-only, sem credenciais. Hoje ele inicia o SUT dentro do runner e valida o commit da `main`; não aponta para uma URL pública de produção.

## 5. Testes

A suíte Playwright possui 10 testes em seis arquivos:

- `tests/web/storefront/`: rejeição de credenciais inválidas e integridade de preço, quantidade e subtotal no carrinho;
- `tests/web/cross-domain/`: propagação de preço da Administração até Storefront/carrinho;
- `tests/api/customer/`: integridade de valores do carrinho e rejeição de pedido incompleto;
- `tests/api/security/`: isolamento de recursos entre clientes e bloqueio de operações administrativas;
- `tests/smoke/`: quatro checks pós-merge somente leitura.

O smoke pós-merge seleciona apenas:

1. Home disponível, conteúdo essencial visível e navegação básica presente;
2. catálogo e produto existente acessíveis, com nome, preço e imagem;
3. consulta pública de produtos com status e contrato mínimo válidos;
4. acesso administrativo anônimo bloqueado/redirecionado;
5. perfil k6 curto, exclusivamente GET, para Home, catálogo, produto e consulta pública.

**Regra inegociável:** smoke destinado a produção deve ser read-only, repetível e não destrutivo. Não pode criar, alterar ou excluir carrinho, pedido, produto, preço ou estoque, nem depender de cleanup. Testes mutáveis pertencem ao ambiente isolado do Quality Gate, não ao recorte pós-merge.

Performance atual:

- `smoke`: baixa taxa por 10 s, página de produto e rejeição estruturada de pedido sem carrinho;
- `post-merge-smoke`: GET-only e curto;
- `load`: três usuários por 20 s contra carrinho incompleto isolado; execução manual e cleanup obrigatório.

Os limites k6 são referências do laboratório, não SLA/SLO nem capacidade certificada de produção. Venda acima do estoque (`RISK-014`), prevenção de pedidos duplicados (`RISK-009`) e consistência do estoque após pedidos (`RISK-015`) continuam sem cobertura determinística completa porque o SUT atual não possui checkout com frete/pagamento adequado para criação, cancelamento e restauração confiáveis.

## 6. Evidências e relatórios

O Playwright produz `quality/playwright-report/`, `quality/test-results/results.json`, attachments, traces e screenshots de falha. O k6 produz `quality/performance-*-summary.json`. `npm run report:summary` lê essas fontes e gera `output/pdf/qel-4-test-evidence.pdf`.

O HTML é técnico e voltado à investigação. O PDF é executivo: contexto e decisão, áreas validadas, casos/evidências, conclusão e linha do tempo das barreiras da qualidade. A narrativa preserva risco → controle → evidência → decisão e apresenta nome de negócio antes do ID técnico.

Evidências Web são capturadas **depois das assertions**. A tela validada não é alterada; uma cópia recebe callout discreto no checkpoint relevante. Verde indica controle aprovado e vermelho indica falha. A demonstração controlada `npm run evidence:failure-demo` usa uma página local efêmera, não toca o SUT e comprova separadamente a geração de evidência vermelha sem quebrar a execução principal.

Cuidados para continuidade:

- gere o PDF somente com resultados atuais; artefato antigo não prova execução nova;
- mantenha contexto visual suficiente e texto legível a 100%; remova ornamentos antes de reduzir evidência;
- não marque cliques, login ou navegação intermediária;
- preserve a prova vermelha fora da decisão verde principal;
- valide visualmente o PDF quando o gerador ou as evidências mudarem.

## 7. Documentação

- **README:** porta de entrada curta, com valor do projeto e rotas para Wiki, Portfolio, Actions e execução.
- **Wiki:** documentação oficial navegável. `wiki/` é a fonte revisável; a publicação no repositório Git da Wiki é uma sincronização manual descrita em [docs/wiki-publishing.md](wiki-publishing.md).
- **Decisões de Arquitetura:** os ADRs em `docs/adr/` registram contexto, decisão, alternativas e consequências; a Wiki apenas os apresenta e referencia.
- **Fontes técnicas:** estratégia, READMEs de `sut/`, `quality/`, performance e experimentos contêm detalhe operacional e não devem ser copiados integralmente para a Wiki.
- **Portfolio Showcase:** landing pública e visual para leitura rápida. Aponta para fontes reais, mas não substitui a documentação oficial.

Fluxo recomendado de leitura: **README → Wiki → estratégia/ADRs → código e workflows → evidências**. Evite duplicação: altere a fonte proprietária do assunto e ajuste apenas os resumos/links afetados.

## 8. Jira

Fonte consultada em modo somente leitura: projeto `QEL` no Jira.

| Card | Status | Entrega ou pendência |
|---|---|---|
| QEL-1 | Concluído | Fundação do repositório, ferramentas e rastreabilidade |
| QEL-2 | Concluído | SUT EverShop reproduzível em Docker |
| QEL-3 | Concluído | Estratégia e matriz de riscos |
| QEL-4 | Concluído | Fundação Playwright Web/API |
| QEL-5 | Concluído | CI/CD e Quality Gates |
| QEL-6 | Concluído | Estratégia k6 inicial |
| QEL-7 | Concluído | Segurança comportamental e controles GitHub |
| QEL-8 | Concluído | IA consultiva aplicada à análise de impacto |
| QEL-9 | Concluído | Experimentos controlados de regressão |
| QEL-10 | Concluído | Portfolio Showcase e GitHub Pages |
| QEL-11 | Concluído | Quality Report executivo e evidências destacadas |
| QEL-12 | Concluído | Actions oficiais compatíveis com runtime Node.js 24 |
| **QEL-13** | **Pendente** | Evoluir performance com jornadas, cargas e análise avançadas; permanece explicitamente em backlog |
| QEL-14 | Concluído | Smoke pós-merge read-only |
| **QEL-15** | **Pendente** | Refinar UX e apresentação do Portfolio sem redesign |
| QEL-16 | Concluído | Linguagem de riscos orientada ao negócio |
| QEL-17 | Concluído | README enxuto e Wiki navegável versionada |

O trabalho funcional restante registrado no Jira é **QEL-13 e QEL-15**. Não atualizar status, comentários ou conteúdo de cards sem solicitação explícita.

## 9. Estado atual

- **Branch principal:** `main`, commit verificado `fc2aac9` (`QEL-17 create navigable project wiki (#17)`).
- **Branch deste handoff:** `docs/project-handoff`, criada diretamente sobre `origin/main`.
- **PRs:** nenhum PR aberto no momento da verificação. Os PRs #16 (QEL-11) e #17 (QEL-17) foram mesclados em 22/08/2026. Branches remotas de features ainda existem, mas seu conteúdo já está em `main`; não as trate como trabalho pendente apenas por existirem.
- **Pipelines:** Quality Gate e CodeQL dos PRs #16/#17 passaram. No commit `fc2aac9`, CodeQL e Post-merge Smoke concluíram com sucesso. O último deploy de Pages observado também passou; QEL-17 não acionou Pages porque não alterou `portfolio/**`.
- **Concluído:** arquitetura, SUT, matriz, automação, performance inicial, segurança, gates, IA consultiva, experimentos, Portfolio, relatório, smoke pós-merge, linguagem de negócio e fonte da Wiki.
- **Débitos/limitações conhecidos:** QEL-13 e QEL-15; cobertura residual de `RISK-009`, `RISK-014` e `RISK-015`; performance ainda representa laboratório; sincronização inicial/operacional da Wiki deve ser confirmada manualmente; smoke pós-merge valida um SUT iniciado no runner, não um deployment público.

O EverShop limita login a oito tentativas por IP a cada 15 minutos. Execuções locais repetidas podem retornar HTTP 429; aguarde a janela ou reinicie o SUT, sem mascarar o comportamento com retry.

## 10. Próximos passos recomendados até v1.0

1. Confirmar a publicação inicial da Wiki e validar Home, Sidebar e links conforme `docs/wiki-publishing.md`.
2. Executar o QEL-15 como refinamento final da landing, preservando arquitetura, identidade e conteúdo técnico.
3. Decidir explicitamente se QEL-13 é requisito de v1.0 ou evolução pós-v1.0. Se entrar, manter smoke curto no PR e perfis pesados manuais/agendados.
4. Fazer uma rodada final reproduzível: SUT saudável, typecheck, suíte completa, performance smoke, PDF revisado a 100%, build do Portfolio e checks do PR.
5. Registrar a versão v1.0 somente após gates verdes e revisão humana das evidências e limitações residuais.

## 11. Regras para o próximo agente

- Leia `AGENTS.md`, `CONTEXT.md`, `docs/quality-strategy.md` e os ADRs aplicáveis antes de propor mudanças de qualidade.
- Não introduza abstrações, bibliotecas ou pipelines sem uma necessidade concreta; menos é mais.
- Preserve annotations `RISK-XXX`, checks k6 e a fonte única da matriz de riscos.
- Não altere a arquitetura Playwright/k6/GitHub Actions sem justificativa baseada em risco.
- Evite duplicação entre README, Wiki, docs, ADRs e Portfolio.
- Use linguagem clara para público técnico e executivo; nome de negócio primeiro, ID técnico depois.
- Não mexa na landing antes ou fora do QEL-15.
- Não faça merge automaticamente.
- Não leia, exponha ou versione `.env`, tokens, cookies, secrets ou cabeçalhos de autorização.
- IA é consultiva; não atualize Jira nem aprove Quality Gates por inferência.
- Sempre valide proporcionalmente ao que mudou e registre limitações como limitações, nunca como sucesso.

## 12. Comandos essenciais

Pré-requisitos: Docker Compose, Node.js 22+ e k6 OSS `2.1.0`.

```bash
# SUT — a partir da raiz
docker compose -f sut/docker-compose.yml up -d --wait --wait-timeout 300
docker compose -f sut/docker-compose.yml ps
docker compose -f sut/docker-compose.yml down

# Fundação e testes — dentro de quality/
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run test:post-merge-smoke

# Performance — dentro de quality/
npm run performance:smoke
npm run performance:post-merge-smoke
npm run performance:load      # somente execução controlada/manual

# Relatórios — dentro de quality/, após gerar resultados
npm run report
npm run report:summary
npm run evidence:failure-demo

# Portfolio/Pages — a partir da raiz
node portfolio/scripts/build.mjs
node portfolio/scripts/serve.mjs
```

Para a suíte completa, crie um administrador local conforme [sut/README.md](../sut/README.md) e forneça `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` apenas no ambiente de execução. O reset com `down --volumes` é destrutivo para o estado local e só deve ser usado conscientemente conforme o guia do SUT.
