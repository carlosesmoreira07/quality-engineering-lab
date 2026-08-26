Este é o caminho mínimo para uma primeira execução local. Os guias técnicos do repositório continuam sendo a fonte para opções, diagnóstico e limitações.

## Pré-requisitos

- Docker com Docker Compose;
- Node.js 22 ou superior, conforme o `package.json` atual;
- Chromium do Playwright;
- k6 2.1.0 para cenários de performance.

## 1. Inicie o ambiente de referência

Na raiz do repositório:

```bash
docker compose -f sut/docker-compose.yml up -d --wait
```

Acesse <http://localhost:3000>. Para detalhes, usuário administrativo e reset local, consulte o [guia do ambiente](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/sut/README.md).

## 2. Prepare a automação

```bash
cd quality
npm ci
npx playwright install chromium
npm run typecheck
```

Credenciais administrativas são locais e opcionais para parte dos cenários. Nunca versione `.env`, senhas, tokens ou estado autenticado.

## 3. Escolha a validação

```bash
npm test                       # suíte Playwright completa
npm run test:smoke             # recorte funcional rápido
npm run test:post-merge-smoke  # saúde read-only
npm run performance:smoke      # performance curta
```

## 4. Leia o resultado

- `npm run report`: abre o HTML Reporter técnico;
- `npm run report:summary`: gera o Quality Report executivo quando resultados Playwright e k6 estão disponíveis;
- falha obrigatória significa bloqueio, não pontuação parcial.

## 5. Encerre

```bash
docker compose -f sut/docker-compose.yml down
```

Próximos detalhes: [automação](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/quality/README.md), [performance](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/quality/performance/README.md) e [experimentos](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/experiments/README.md).
