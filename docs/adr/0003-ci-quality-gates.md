# ADR 0003 — CI e Quality Gates

## Status

Aceita

## Contexto

Os controles Web e API do QEL-4 precisam participar da decisão de merge com resultado objetivo, evidências úteis e custo proporcional à suíte atual.

## Decisão

Adotar um workflow GitHub Actions para Pull Requests destinados à `main`, com execução manual opcional. Um único job em `ubuntu-latest` reutiliza o Docker Compose do SUT, Node.js LTS e Chromium. Concorrência por PR cancela execuções substituídas.

O job instala dependências com `npm ci`, executa validações em ordem de custo, cria um administrador efêmero a partir de GitHub Actions Secrets e sempre encerra containers e volumes. O check usa permissão somente de leitura do conteúdo.

## Quality Gates

- TypeScript aprovado;
- EverShop iniciado e saudável;
- 100% da suíte funcional/API atual aprovada;
- HTML Reporter, resultados/attachments e Quality Summary produzidos e publicados.

Qualquer gate obrigatório com falha reprova o check. Não há score ou tolerância percentual.

## Alternativas consideradas

- Matrix de sistemas ou navegadores e múltiplos jobs: adiados por aumentarem custo sem ampliar materialmente a confiança atual;
- Novo ambiente de SUT ou ferramenta de reporting: rejeitados porque Docker Compose e Playwright já atendem à necessidade;
- Execução em todo push e agendamento: rejeitados por duplicarem consumo sem sinal adicional para o merge.

## Consequências

O PR recebe um check único e bloqueável, baseado em Chromium e em toda a suíte existente. Evidências nativas permanecem disponíveis por retenção moderada. Os Secrets administrativos e a proteção da `main` exigem configuração no GitHub; novos browsers, seleção por diff ou paralelismo só serão avaliados mediante necessidade concreta.
