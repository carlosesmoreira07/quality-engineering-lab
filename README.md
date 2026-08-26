# Quality Engineering Lab

O **Quality Engineering Lab**, da Moreira Tech, demonstra como transformar riscos de negócio de uma plataforma de comércio eletrônico em controles automatizados, evidências auditáveis e decisões objetivas ao longo de todo o ciclo de desenvolvimento de software (SDLC).

Não é um repositório de testes acumulados. É uma referência prática de **Quality Engineering**: da análise de risco da mudança à confirmação de que a versão estável permanece saudável.

## Como o laboratório protege uma mudança

```text
Necessidade / Risco de Negócio
  → Análise de Impacto & Critérios
  → Automação de Controles (Web, API, Segurança, Performance)
  → Execução Hermética no CI
  → Evidências Auditáveis (HTML + PDF Executivo)
  → Quality Gate Determinístico (Aprovação / Bloqueio)
  → Validação Noturna & Smoke Read-Only Pós-Merge
```

A decisão é orientada pelo princípio **Risco → Controle → Evidência → Decisão**. Mudanças só avançam quando controles determinísticos aprovam 100% dos critérios no ambiente de referência.

## Principais capacidades

| Capacidade | Valor entregue ao negócio |
|---|---|
| **Estratégia orientada a riscos** | Prioriza perdas financeiras, integridade transacional, privacidade e disponibilidade |
| **Automação Web e API** | Protege jornadas de compra, carrinho e integração de preços com Playwright |
| **Segurança comportamental & SAST** | Garante isolamento entre clientes, autorização administrativa, CodeQL e revisão de dependências |
| **Performance proporcional** | Mede tempo de resposta e previsibilidade da descoberta com perfis k6 ajustados ao risco |
| **Quality Gates determinísticos** | Bloqueia Pull Requests automaticamente sem tolerância a falhas silenciosas ou aprovação por IA |
| **Evidências auditáveis** | Produz relatórios HTML detalhados, capturas com destaques e relatórios executivos em PDF |
| **IA assistiva & consultiva** | Apoia a análise de impacto no Jira mantendo 100% das decisões sob revisão humana |

## Comece por aqui

- 📊 **[Central de Evidências](https://carlosesmoreira07.github.io/quality-engineering-lab/)** — Resultados das execuções reais, métricas dos 3 pilares e relatórios em PDF.
- 📚 **[Wiki Oficial](https://github.com/carlosesmoreira07/quality-engineering-lab/wiki)** — Jornada explicativa completa por perfil (PO, Dev, QA, Liderança).
- ⚙️ **[GitHub Actions](https://github.com/carlosesmoreira07/quality-engineering-lab/actions)** — Histórico auditável de execuções dos Quality Gates e da Validação Noturna.
- 📐 **[Decisões de Arquitetura (ADRs)](docs/adr/)** — Rationale técnico para cada escolha do projeto.

## Arquitetura simplificada

```text
EverShop 2.2.1 + PostgreSQL (Docker Isolado)
        ↓
Playwright (Web / API / Segurança) + k6 (Performance)
        ↓
GitHub Actions (Quality Gate PR + Validação Noturna)
        ↓
Quality Report PDF + Central de Evidências (Pages)
```

## Execução local mínima

Pré-requisitos: Docker com Docker Compose, Node.js 22+ e Chromium.

```bash
# 1. Iniciar o ambiente de referência
docker compose -f sut/docker-compose.yml up -d --wait

# 2. Instalar dependências e validar TypeScript
cd quality
npm ci
npx playwright install chromium
npm run typecheck

# 3. Executar suíte de testes
npm test

# 4. Encerrar o ambiente
docker compose -f ../sut/docker-compose.yml down
```

Consulte o [guia de execução na Wiki](https://github.com/carlosesmoreira07/quality-engineering-lab/wiki/Como-Executar) para opções avançadas, perfis de performance e relatórios.
