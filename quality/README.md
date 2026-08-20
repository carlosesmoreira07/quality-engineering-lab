# Automação de testes

## Objetivo

Esta camada valida riscos prioritários da estratégia de qualidade do Quality Engineering Lab por meio de testes funcionais web e de API contra a baseline reproduzível do EverShop 2.2.1.

## Estrutura

Os testes ficam organizados por interface e domínio em `tests/web` e `tests/api`. Dados determinísticos da baseline ficam em `src/data`, enquanto Page Objects pequenos em `src/pages` representam apenas interações reutilizadas da Storefront.

## Pré-requisitos

- Node.js 22 ou superior;
- Chromium instalado pelo Playwright;
- SUT iniciado conforme [`sut/README.md`](../sut/README.md);
- usuário administrador local para o cenário cross-domain, informado somente em tempo de execução por `E2E_ADMIN_EMAIL` e `E2E_ADMIN_PASSWORD`.

Na pasta `quality`, execute:

```bash
npm ci
npx playwright install chromium
```

Nenhuma credencial real ou estado autenticado deve ser versionado.

## Autenticação

O cenário de login exercita a autenticação real da Storefront. O cenário cross-domain autentica no Admin a cada execução com credenciais locais recebidas por variáveis de ambiente. Não há `storageState` nem fixture de autenticação porque ainda não existe reutilização que justifique esses componentes.

## Execução

Com o EverShop disponível em `http://localhost:3000`:

```bash
npm test
npm run test:web
npm run test:api
npm run test:smoke
npm run typecheck
```

Defina `BASE_URL` apenas quando o SUT estiver em outro endereço. O relatório HTML nativo é gerado em `playwright-report`; traces e screenshots são retidos somente em falhas. A execução usa Chromium e nenhum retry para manter a baseline inicial simples e determinística.

## Decisões de design

Playwright atende Web e API com `APIRequestContext` nativo. Page Objects existem somente para interações reutilizadas da Storefront; não há fixtures, clientes genéricos, classes base ou ferramentas externas de relatório nesta etapa.

## Dados de teste e riscos

Os cenários de catálogo usam os dados fixos do seed do SUT. O cenário Admin → Storefront cria um produto exclusivo e o remove ao final. A API pública cria um carrinho isolado; o reset documentado do SUT descarta esses dados efêmeros.

Esta fundação cobre `RISK-002`, `RISK-004`, `RISK-006`, `RISK-007`, `RISK-010` e `RISK-013`. `RISK-009` e `RISK-015` permanecem fora desta entrega porque a baseline atual não possui configuração de frete e pagamento que permita concluir e cancelar pedidos sem ampliar o escopo do SUT. Segurança (`RISK-005`, `RISK-016`) pertence ao QEL-7; performance (`RISK-014`, `RISK-019`), ao QEL-6.

O EverShop limita os endpoints de login a oito tentativas por IP a cada 15 minutos. Execuções locais repetidas nesse intervalo podem receber HTTP 429 e devem aguardar a janela ou reiniciar o SUT antes de nova validação.
