# Automação de testes

## Objetivo

Esta camada valida riscos prioritários da estratégia de qualidade do Quality Engineering Lab por meio de testes funcionais web e de API contra a baseline reproduzível do EverShop 2.2.1.

## Estrutura

Os testes ficam organizados por interface e domínio em `tests/web` e `tests/api`. Dados determinísticos da baseline ficam em `src/data`, enquanto Page Objects pequenos em `src/pages` representam apenas interações reutilizadas da Storefront.

## Pré-requisitos

- Node.js 22 ou superior;
- Chromium instalado pelo Playwright;
- SUT iniciado conforme [`sut/README.md`](../sut/README.md);
- usuário administrador local para o cenário cross-domain, configurado por `E2E_ADMIN_EMAIL` e `E2E_ADMIN_PASSWORD` no ambiente ou em `quality/.env`.

Na pasta `quality`, execute:

```bash
npm ci
npx playwright install chromium
```

Nenhuma credencial real ou estado autenticado deve ser versionado.

Para a configuração local opcional, copie `.env.example` para `.env` e preencha as credenciais. Variáveis já definidas no ambiente do processo têm precedência, permitindo que a CI dispense esse arquivo.

## Autenticação

O cenário de login exercita a autenticação real da Storefront. O cenário cross-domain autentica no Admin a cada execução com credenciais locais recebidas por variáveis de ambiente. Não há `storageState` nem fixture de autenticação porque ainda não existe reutilização que justifique esses componentes.

## Execução

Com o EverShop disponível em `http://localhost:3000`:

```bash
npm test
npm run test:web
npm run test:api
npm run test:security
npm run test:smoke
npm run test:post-merge-smoke
npm run test:ui
npm run test:headed
npm run test:debug
npm run typecheck
```

Use UI Mode no desenvolvimento normal para executar a suíte, arquivo ou teste individual, explorar timeline, ações, DOM antes/depois, console/network e locator picker, além de depurar falhas. Use headed para assistir à execução e debug para investigar passo a passo com o Playwright Inspector. O relatório HTML e o trace retido em falhas apoiam a análise posterior.

Defina `BASE_URL` apenas quando o SUT estiver em outro endereço. A execução padrão continua headless, usa Chromium e nenhum retry para manter a baseline inicial simples e determinística.

## Evidências

Evidência de negócio é anexada ao teste somente nos checkpoints que comprovam uma regra funcional, como rejeição de autenticação, integridade do carrinho e propagação de preço. Evidência diagnóstica permanece separada e é fornecida pelo screenshot automático de falha, trace e HTML Reporter nativos.

Não são capturados screenshots de cada interação: ações como login, preenchimento e navegação intermediária gerariam ruído sem aumentar a confiança e ampliariam o custo de manutenção. Após uma execução, use `npm run report` para a análise de Engenharia e `npm run report:summary` para gerar o Quality Summary executivo em PDF.

O comando `npm run evidence:failure-demo` executa uma página local e efêmera com divergência proposital, confirma que o controle detecta o valor incorreto e publica uma cópia anotada com retângulo vermelho em um HTML Reporter separado. A demonstração não acessa nem altera o SUT e não participa da decisão verde da suíte principal.

## Integração contínua

Pull Requests para `main` executam o check **Quality Gate** no GitHub Actions. O fluxo valida TypeScript, CodeQL, mudanças de dependências, inicia o SUT reproduzível com Docker Compose, exige que a suíte Web/API/segurança e o performance smoke passem e confirma a geração das evidências. Dependency Review bloqueia vulnerabilidades altas ou críticas introduzidas pelo PR; qualquer gate obrigatório com falha reprova o check.

Após um merge, todo `push` na `main` executa separadamente o **Post-merge Smoke** para confirmar rapidamente que a baseline publicada está íntegra e disponível. Esse fluxo não decide o merge e não repete a regressão completa: valida Home, catálogo e produto, consulta pública do catálogo, bloqueio administrativo anônimo e um perfil k6 exclusivamente GET. Todos os controles são read-only: não criam carrinho ou pedido, não alteram produto, preço ou estoque e não dependem de cleanup de dados. A execução esperada é GREEN, usa somente Chromium, não ativa regressões controladas e normalmente termina em até 10 minutos.

Para reproduzir localmente, inicie o SUT saudável conforme `sut/README.md` e, na pasta `quality`, execute `npm run test:post-merge-smoke` seguido de `npm run performance:post-merge-smoke`. O recorte confirma sinais amplos de saúde da baseline, mas não substitui o Quality Gate completo do PR, testes de carga, scanners ou os experimentos controlados — estes últimos permanecem manuais e podem ficar RED durante a variante por desenho.

O Quality Gate publica por 14 dias um artifact com o HTML Reporter, resultados e attachments do Playwright, Quality Summary em PDF e summary JSON do k6. O Post-merge Smoke mantém pelo mesmo período somente o HTML Reporter, resultados/attachments selecionados e o summary JSON do k6. Os GitHub Actions Secrets `E2E_ADMIN_EMAIL` e `E2E_ADMIN_PASSWORD` são usados apenas pelo Quality Gate para criar um administrador efêmero no SUT e nunca devem ser gravados em arquivos ou logs; o smoke pós-merge selecionado não depende de credenciais.

Os cenários, workloads, thresholds e limitações de Performance Engineering estão documentados em [`performance/README.md`](performance/README.md). O load controlado é manual e não faz parte de todo Pull Request.

## Decisões de design

Playwright atende Web e API com `APIRequestContext` nativo. Os controles comportamentais comprovam autorização no SUT em execução; CodeQL, Dependency Review e os controles nativos de secrets analisam código e repositório, não substituem esses testes. Page Objects existem somente para interações reutilizadas da Storefront; não há fixtures, clientes genéricos, classes base ou ferramentas externas de relatório nesta etapa.

## Dados de teste e riscos

Os cenários de catálogo usam os dados fixos do seed do SUT. O cenário Admin → Storefront cria um produto exclusivo e o remove ao final. A API pública cria um carrinho isolado; o reset documentado do SUT descarta esses dados efêmeros.

Esta fundação cobre integridade de preço na compra (`RISK-002`), proteção da conta (`RISK-004`), privacidade entre clientes (`RISK-005`), integridade de itens e totais do carrinho (`RISK-006` e `RISK-007`), integridade do pedido (`RISK-010`), propagação de preço da Administração (`RISK-013`) e proteção do acesso administrativo (`RISK-016`). Os testes de segurança criam dois clientes e um recurso totalmente sintéticos, comprovam isolamento horizontal e bloqueio administrativo e removem os dados ao final. A cobertura é deliberadamente restrita a essas fronteiras: não representa pentest completo, DAST amplo nem cobertura integral do OWASP Top 10. Prevenção de pedidos duplicados (`RISK-009`) e consistência do estoque após pedidos (`RISK-015`) permanecem fora desta entrega porque a versão estável atual não possui configuração de frete e pagamento que permita concluir e cancelar pedidos sem ampliar o escopo do SUT.

O EverShop limita os endpoints de login a oito tentativas por IP a cada 15 minutos. Execuções locais repetidas nesse intervalo podem receber HTTP 429 e devem aguardar a janela ou reiniciar o SUT antes de nova validação.
