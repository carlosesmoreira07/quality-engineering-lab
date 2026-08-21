# ADR 0008 — Portfolio Showcase do Quality Engineering Lab

## Status

Aceito.

## Contexto

O laboratório precisava de uma entrada pública que permitisse leitura rápida por recrutadores e aprofundamento por profissionais técnicos, sem duplicar a documentação nem transformar o repositório em uma aplicação de conteúdo.

## Decisão

Construir um site estático, responsivo e sem framework em `portfolio/`. A narrativa conecta risco, engenharia, evidência e decisão, usando links para as fontes versionadas e poucas evidências reais sem dados sensíveis.

## Hospedagem

Publicar com GitHub Pages por um workflow oficial executado somente após mudanças relevantes em `main`. O deploy usa o environment `github-pages` e as permissões mínimas de conteúdo, Pages e identidade necessárias às actions oficiais.

## Arquitetura

HTML semântico, CSS e JavaScript progressivo compõem a interface. Um script Node.js sem dependências gera `portfolio/dist/` e valida referências locais, âncoras e marcações essenciais. Não há backend, banco, CMS ou serviço pago.

## Atualização

Conteúdo, links e evidências são alterados na fonte versionada e revisados por Pull Request. Screenshots só devem ser atualizados quando representarem um novo estado relevante; dados dinâmicos e métricas inventadas não são incorporados.

## Alternativas consideradas

- Framework SPA ou gerador de site: rejeitado porque adicionaria dependências e complexidade sem benefício para o escopo atual.
- Backend ou CMS: rejeitado porque o conteúdo é pequeno, versionado e atualizado junto ao código.
- Hospedagem externa ao GitHub: rejeitada para manter publicação, revisão e rastreabilidade no mesmo repositório.
