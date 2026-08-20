# ADR 0002 — Arquitetura da fundação de automação

## Status

Aceita

## Contexto

O QEL-4 precisa iniciar a automação funcional e de API a partir dos riscos prioritários definidos em `docs/quality-strategy.md`, preservando simplicidade, rastreabilidade e execução local reproduzível.

## Decisão

Adotar Playwright Test com TypeScript estrito e Chromium como único navegador inicial. Os testes são organizados por interface e domínio, usam anotações `risk` para ligar cada cenário aos riscos controlados e dependem da baseline EverShop 2.2.1 disponibilizada pelo SUT.

Page Objects são usados somente para interações reutilizadas da Storefront. Chamadas de API permanecem explícitas nos cenários, sem camada genérica, fixtures globais ou classe base. O cenário cross-domain cria e remove seu próprio produto; credenciais administrativas são recebidas por variáveis de ambiente e não são armazenadas.

As chamadas HTTP usam `APIRequestContext` nativo. Fixtures não são criadas enquanto não houver contexto reutilizável. Relatório HTML, traces e screenshots usam recursos nativos do Playwright. A configuração não aplica retries e proíbe `test.only`.

## Alternativas consideradas

- Allure e Bruno: rejeitados por duplicarem recursos já atendidos pelo Playwright nesta etapa;
- BasePage, Screenplay e framework próprio: rejeitados por acrescentarem abstrações sem necessidade concreta;
- Firefox e WebKit: adiados por não haver requisito cross-browser no MVP.

## Consequências

A suíte oferece uma fundação pequena, legível e rastreável para web, API e integração Admin → Storefront. A execução completa exige um administrador local fornecido em tempo de execução.

Os riscos `RISK-009` e `RISK-015` não são automatizados nesta etapa, pois a baseline não possui frete e pagamento configurados para concluir e cancelar um pedido. Segurança permanece no QEL-7 e performance no QEL-6.

As decisões podem ser revistas quando uma necessidade concreta justificar fixtures, novos navegadores, outra forma de evidência ou uma abstração adicional.
