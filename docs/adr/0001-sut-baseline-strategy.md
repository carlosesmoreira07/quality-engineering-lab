# ADR 0001: Estratégia de baseline do Sistema Sob Teste

## Contexto

O Quality Engineering Lab precisa de uma aplicação realista, reproduzível localmente e adequada para futura execução em CI, sem misturar o código do produto com os artefatos de Quality Engineering.

## Decisão

Utilizar o EverShop como SUT por meio de sua imagem Docker oficial, fixada por versão e digest imutável. A imagem será tratada como uma dependência externa e executada com PostgreSQL por uma composição mantida neste repositório. Um bootstrap idempotente carregará os dados oficiais de demonstração e configurará um widget nativo para tornar a página inicial funcional.

A baseline oficial permanecerá intacta. Regressões controladas futuras deverão preferir configuração, extensões ou imagens derivadas claramente identificadas. Um fork será criado somente se modificações frequentes no núcleo passarem a justificar sua manutenção.

## Alternativas consideradas

- Copiar o código-fonte: rejeitado por aumentar o repositório e dificultar atualizações.
- Git submodule: rejeitado pela complexidade adicional para clone, atualização e CI.
- Fork desde o início: rejeitado pelo custo de manutenção antes de existir necessidade de modificar o núcleo.
- Clone automatizado: rejeitado como baseline por depender de download e build do código durante a inicialização.

## Consequências

A configuração permanece pequena, separada e reproduzível. O seed oficial pode depender de acesso externo para obter imagens; um banco parcialmente inicializado deve ser recuperado por reset completo. O bootstrap é idempotente, mas possui acoplamento ao schema do EverShop `2.2.1`, portanto qualquer atualização do EverShop exige sua revalidação. Atualizações serão explícitas e deverão alterar a versão e o digest. Modificações no núcleo exigirão uma imagem derivada ou, quando justificado, um fork, respeitando a licença GPLv3.

## Status

Aceito.
