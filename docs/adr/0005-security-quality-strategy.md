# ADR 0005 — Estratégia de segurança orientada a risco

## Status

Aceita.

## Contexto

`RISK-005` e `RISK-016` exigem evidência de que identidades equivalentes permanecem isoladas e de que privilégios administrativos não são concedidos a clientes ou anônimos. A estratégia segue a metodologia de autorização do [OWASP WSTG (`WSTG-ATHZ-02/03`)](https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/05-Authorization_Testing/02-Testing_for_Bypassing_Authorization_Schema) e os controles de autorização por objeto e função do OWASP API Security ([`API1:2023`](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) e [`API5:2023`](https://owasp.org/API-Security/editions/2023/en/0xa5-broken-function-level-authorization/)), sem ampliar o QEL-7 para um pentest.

## Decisão

Manter os controles comportamentais na arquitetura Playwright existente. Dois clientes e um endereço inteiramente sintéticos exercitam autorização horizontal; cliente comum e anônimo exercitam as fronteiras Web/API administrativas de pedidos. Os dados são removidos ao final e as evidências registram somente papel genérico, operação, resultado e decisão.

CodeQL oficial analisa JavaScript/TypeScript com configuração padrão em workflow separado para Pull Requests e pushes na `main`. A separação mantém a análise da branch padrão e executa SAST em paralelo ao Quality Gate, sem duplicar build. Dependency Review bloqueia somente a introdução de vulnerabilidades altas ou críticas. Secret Scanning e Push Protection nativos protegem o repositório público; alertas do Dependabot complementam dependências já presentes.

## Controles adotados

- autorização horizontal por alteração/exclusão de recurso pertencente a outra identidade;
- autorização vertical por consulta Web e mutação API administrativa com cliente comum e anônimo;
- CodeQL, Dependency Review, Dependabot alerts, Secret Scanning e Push Protection do GitHub;
- evidência `risco → tentativa → controle → resultado → decisão`, sem payloads ou identificadores sensíveis.

## Quality Gates

Falhas dos testes de autorização reprovam a suíte principal. Dependency Review reprova mudanças que introduzam vulnerabilidade alta ou crítica, sem `continue-on-error`. Falhas de execução do CodeQL reprovam o check; alertas de severidade bloqueante devem ser exigidos pela proteção de merge do GitHub.

## Alternativas consideradas

- OWASP ZAP: não adotado; uma baseline não autenticada duplicaria pouco do comportamento coberto, aumentaria tempo e ruído e não provaria ownership;
- Snyk, SonarQube ou outro SAST: não adotados porque os controles nativos cobrem código, dependências e secrets sem stack concorrente;
- queries CodeQL customizadas e pentest completo: adiados até existir risco ou finding que justifique o custo.

## Limitações

CodeQL analisa o código JavaScript/TypeScript deste repositório, não o código interno da imagem imutável do EverShop. Dependency Review avalia dependências introduzidas ou alteradas no PR. Os testes cobrem as fronteiras priorizadas e não representam exploração ofensiva ampla, fuzzing ou cobertura integral do OWASP Top 10.
