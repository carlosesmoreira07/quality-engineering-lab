# Publicação da GitHub Wiki

## Fonte revisável

Os arquivos em `wiki/` são a fonte versionada da documentação navegável. Mudanças devem passar por Pull Request no repositório principal antes de serem publicadas na GitHub Wiki.

A Wiki é o canal oficial de leitura; estratégia, ADRs, READMEs técnicos, testes e workflows continuam sendo as fontes de detalhe. Páginas da Wiki resumem e apontam para essas fontes, sem copiá-las integralmente.

## Primeira publicação

A Wiki está habilitada, mas seu repositório Git ainda não existe até a primeira página ser criada.

Após o merge do QEL-17:

1. Abra `https://github.com/carlosesmoreira07/quality-engineering-lab/wiki` e crie a primeira página `Home`.
2. Clone `git@github.com:carlosesmoreira07/quality-engineering-lab.wiki.git` fora do repositório principal.
3. Copie todos os arquivos `wiki/*.md` para a raiz do clone da Wiki, substituindo a `Home.md` inicial.
4. Faça commit e push no repositório da Wiki.
5. Abra a Home publicada e percorra todos os links da `_Sidebar.md`.

## Manutenção

- não edite conteúdo diretamente pela interface da Wiki;
- revise mudanças futuras em `wiki/` por Pull Request e sincronize somente após o merge;
- preserve os nomes dos arquivos, pois eles definem URLs estáveis para links externos e para a futura integração com a landing page;
- quando uma fonte técnica mudar, atualize apenas o resumo afetado e mantenha o link para a fonte, sem duplicar seu conteúdo.
