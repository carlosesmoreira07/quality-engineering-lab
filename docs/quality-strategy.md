# Estratégia de Qualidade Baseada em Riscos

## 1. Contexto

O Quality Engineering Lab utiliza o EverShop `2.2.1` como Sistema Sob Teste (SUT). A plataforma reúne catálogo, contas de clientes, carrinho, checkout e gestão administrativa de produtos e pedidos, formando um fluxo de comércio eletrônico com dados financeiros e transacionais.

Esta estratégia parte do comportamento real da baseline do laboratório. O EverShop cria pedidos a partir de um carrinho validado, desabilita o carrinho após a criação e mantém dados de preço, estoque, cliente, endereços e itens do pedido. As referências funcionais consideradas são a [visão dos módulos do EverShop](https://evershop.io/docs/development/getting-started/introduction), o serviço de [criação de pedidos](https://evershop.io/docs/development/module/functions/createorder) e o serviço de [produtos e estoque](https://evershop.io/docs/development/module/functions/createproduct).

## 2. Objetivo

Direcionar os controles de qualidade para os riscos de maior impacto do produto, especialmente perda financeira, corrupção de carrinho ou pedido, venda sem estoque e acesso indevido. A estratégia orienta as futuras decisões de cobertura funcional, API/integração, performance, segurança e exploração manual sem antecipar ferramentas.

## 3. Princípios de Quality Engineering

- Todo teste automatizado futuro deve identificar o risco que ajuda a controlar.
- A profundidade e a camada do controle devem ser proporcionais ao impacto e à probabilidade do risco.
- Regras financeiras e integridade transacional devem ser verificadas também abaixo da interface Web.
- Segurança e performance entram no escopo somente quando afetam dados, autorização ou jornadas críticas.
- A baseline e os dados de teste devem ser reproduzíveis para permitir comparação confiável.
- Automação não substitui exploração humana em comportamentos novos, ambíguos ou com forte componente visual.

## 4. Jornadas críticas

| Área | Jornada | Objetivo de negócio | Comportamento principal |
|---|---|---|---|
| Cliente | Catálogo | Permitir que o cliente encontre itens comercializáveis | Lista produtos ativos e navegáveis por categoria ou coleção |
| Cliente | Página de produto | Apoiar a decisão de compra com dados corretos | Exibe descrição, opções, preço e disponibilidade do produto |
| Cliente | Autenticação | Reconhecer o cliente e proteger sua conta | Cria sessão válida após credenciais corretas e rejeita acesso inválido |
| Cliente | Carrinho | Preservar a intenção de compra | Adiciona produtos e mantém item, variante, quantidade e valores |
| Cliente | Checkout | Coletar e validar os dados necessários à compra | Consolida carrinho, endereços, entrega, pagamento e total |
| Cliente | Criação de pedido | Registrar uma compra única e íntegra | Converte o carrinho validado em pedido e encerra seu uso |
| Cliente | Consulta de pedidos | Permitir acompanhamento seguro das compras | Lista e exibe somente os pedidos pertencentes ao cliente autenticado |
| Administração | Produtos | Manter a oferta comercial | Cria e altera produto, SKU, conteúdo, opções e disponibilidade |
| Administração | Preços | Manter valores comerciais corretos | Persiste preço e o disponibiliza de forma consistente na vitrine e compra |
| Administração | Estoque | Evitar venda acima da disponibilidade | Mantém quantidade e disponibilidade, refletindo movimentações de pedidos |
| Administração | Pedidos | Operar o ciclo posterior à compra | Consulta pedido e aplica transições operacionais permitidas |

## 5. Modelo de classificação de risco

Impacto, probabilidade e prioridade usam exclusivamente quatro níveis:

- **Crítico:** pode causar perda financeira relevante, corrupção transacional, exposição de dados ou indisponibilidade da compra.
- **Alto:** compromete uma jornada central ou exige intervenção operacional importante.
- **Médio:** degrada a experiência ou produz inconsistência recuperável, com alcance limitado.
- **Baixo:** efeito localizado, de fácil identificação e recuperação.

A prioridade considera impacto, probabilidade e relevância para o MVP. Não há pontuação numérica: o contexto de negócio prevalece sobre uma fórmula.

## 6. Matriz de riscos

Esta matriz é a fonte única para nome de negócio, identificador técnico, categoria e severidade. Relatórios e documentação apresentam primeiro o **Nome de negócio**; o `RISK-XXX` permanece como referência estável para annotations, cobertura e diagnóstico técnico.

| ID | Nome de negócio | Categoria | Jornada | Risco | Impacto | Probabilidade | Prioridade | Controle recomendado |
|---|---|---|---|---|---|---|---|---|
| RISK-001 | Descoberta de produtos ativos | Catálogo e oferta | Catálogo | Produto ativo ou categoria relevante não aparece, impedindo sua descoberta | Médio | Médio | Médio | Funcional Web; API / Integração; Exploratório / Manual |
| RISK-002 | Integridade do preço apresentado na compra | Catálogo e oferta | Página de produto | Preço ou acréscimo de variante exibido incorretamente e propagado à compra | Crítico | Alto | Crítico | Funcional Web; API / Integração |
| RISK-003 | Disponibilidade real de variantes | Catálogo e oferta | Página de produto | Variante indisponível pode ser selecionada ou adicionada ao carrinho | Alto | Médio | Alto | Funcional Web; API / Integração |
| RISK-004 | Proteção da conta e da sessão do cliente | Identidade e acesso | Autenticação | Credenciais ou sessão são aceitas, mantidas ou encerradas de forma indevida | Crítico | Médio | Crítico | Funcional Web; API / Integração; Segurança |
| RISK-005 | Privacidade de pedidos entre clientes | Identidade e acesso | Consulta de pedidos | Cliente acessa pedido ou dados pessoais de outro cliente | Crítico | Médio | Crítico | API / Integração; Segurança; Funcional Web |
| RISK-006 | Integridade dos itens no carrinho | Compra e pedidos | Carrinho | Item, variante ou quantidade diverge da escolha do cliente | Crítico | Alto | Crítico | Funcional Web; API / Integração |
| RISK-007 | Exatidão dos totais do carrinho | Compra e pedidos | Carrinho | Subtotal ou total diverge dos itens e preços válidos | Crítico | Alto | Crítico | API / Integração; Funcional Web |
| RISK-008 | Validação dos dados e valores do checkout | Compra e pedidos | Checkout | Endereço, entrega ou pagamento inválido é aceito, ou altera o total sem consistência | Crítico | Médio | Alto | Funcional Web; API / Integração; Exploratório / Manual |
| RISK-009 | Prevenção de pedidos duplicados | Compra e pedidos | Criação de pedido | Reenvio, repetição de clique ou retry cria pedidos duplicados | Crítico | Médio | Crítico | API / Integração; Funcional Web; Performance |
| RISK-010 | Integridade dos dados do pedido | Compra e pedidos | Criação de pedido | Pedido é persistido sem itens, valores, cliente ou endereços íntegros | Crítico | Médio | Crítico | API / Integração; Funcional Web |
| RISK-011 | Confiabilidade do histórico de pedidos | Compra e pedidos | Consulta de pedidos | Pedido criado não aparece ou apresenta estado e valores divergentes | Alto | Médio | Alto | Funcional Web; API / Integração |
| RISK-012 | Consistência da oferta entre Administração e vitrine | Catálogo e oferta | Administração de produtos | Alteração de produto fica incompleta ou gera oferta inválida na vitrine | Alto | Médio | Alto | Funcional Web; API / Integração; Exploratório / Manual |
| RISK-013 | Integridade de preço entre Administração e compra | Catálogo e oferta | Administração de preços | Preço administrativo incorreto não se propaga ou altera compras de modo inconsistente | Crítico | Alto | Crítico | API / Integração; Funcional Web |
| RISK-014 | Proteção contra venda acima do estoque | Estoque | Administração de estoque | Concorrência permite venda acima da quantidade disponível | Crítico | Médio | Crítico | API / Integração; Performance |
| RISK-015 | Consistência do estoque após pedidos | Estoque | Administração de estoque | Criação ou cancelamento do pedido não movimenta o estoque corretamente | Crítico | Médio | Alto | API / Integração; Funcional Web |
| RISK-016 | Proteção do acesso administrativo a pedidos | Identidade e acesso | Administração de pedidos | Usuário não autorizado consulta ou altera pedidos administrativos | Crítico | Baixo | Alto | Segurança; API / Integração; Funcional Web |
| RISK-017 | Coerência do ciclo operacional do pedido | Compra e pedidos | Administração de pedidos | Transição inválida deixa pedido, pagamento ou expedição em estado incoerente | Alto | Médio | Alto | API / Integração; Funcional Web; Exploratório / Manual |
| RISK-018 | Desempenho da descoberta de produtos | Performance | Catálogo e página de produto | Lentidão degrada descoberta e visualização, mas a compra permanece disponível | Médio | Alto | Médio | Performance |
| RISK-019 | Disponibilidade e previsibilidade da compra | Performance | Carrinho, checkout e pedido | Degradação ou erro sob uso simultâneo impede compra ou deixa resultado transacional incerto | Crítico | Médio | Crítico | Performance; API / Integração |

## 7. Estratégia de validação

| Abordagem | Aplicação na estratégia |
|---|---|
| Funcional Web | Confirmar jornadas percebidas pelo usuário, integração entre páginas e feedback após ações críticas |
| API / Integração | Validar regras, contratos e persistência de carrinho, valores, pedido, estoque e autorização com diagnóstico preciso |
| Performance | Avaliar apenas fluxos cuja degradação afeta descoberta, compra, duplicidade ou consistência sob concorrência |
| Segurança | Verificar autenticação, isolamento de pedidos de clientes e autorização das operações administrativas |
| Exploratório / Manual | Investigar estados alternativos, combinações de dados e apresentação que ainda não justificam cobertura automatizada |

Os controles devem ser independentes sempre que possível. Cobertura em mais de uma abordagem só é indicada quando cada camada observa uma falha diferente; repetir o mesmo comportamento sem ganho de detecção não reduz risco.

Um risco priorizado não implica automaticamente um teste E2E Web. A camada de validação deve ser escolhida conforme o comportamento observado e o custo de manutenção. Fluxos transversais podem combinar preparação ou validação por API com verificações Web quando cada camada fornece evidência distinta.

## 8. Escopo do MVP

O MVP prioriza doze riscos:

- **Integridade do preço apresentado na compra** — `RISK-002`.
- **Proteção da conta e da sessão do cliente** — `RISK-004`.
- **Privacidade de pedidos entre clientes** — `RISK-005`.
- **Integridade dos itens no carrinho** — `RISK-006`.
- **Exatidão dos totais do carrinho** — `RISK-007`.
- **Prevenção de pedidos duplicados** — `RISK-009`.
- **Integridade dos dados do pedido** — `RISK-010`.
- **Integridade de preço entre Administração e compra** — `RISK-013`.
- **Proteção contra venda acima do estoque** — `RISK-014`.
- **Consistência do estoque após pedidos** — `RISK-015`.
- **Proteção do acesso administrativo a pedidos** — `RISK-016`.
- **Disponibilidade e previsibilidade da compra** — `RISK-019`.

Esse recorte cobre três dimensões complementares:

- **Jornada de compra:** Produto → Carrinho → Checkout → Pedido.
- **Operação administrativa:** Preço → Estoque → Pedido.
- **Fronteiras de confiança:** Cliente → Dados próprios e Cliente → Administração.

Os riscos administrativos selecionados entram no MVP porque mudanças no backoffice afetam diretamente a experiência, a integridade financeira e a consistência transacional percebidas no storefront. O recorte não transforma toda a administração em prioridade; os demais riscos permanecem rastreados para evolução posterior.

## 9. Riscos conscientemente não priorizados

No MVP, não terão cobertura profunda a descoberta completa do catálogo, todas as combinações de checkout, a criação e edição administrativa completa de produtos, combinações avançadas de atributos e mídia, nem a cobertura exaustiva das transições de estado dos pedidos. **Consistência da oferta entre Administração e vitrine** (`RISK-012`) e **Coerência do ciclo operacional do pedido** (`RISK-017`) continuam rastreados, mas fora do recorte priorizado.

Também ficam fora as demais funcionalidades administrativas sem impacto direto nos riscos priorizados e funcionalidades periféricas como promoções, CMS, tributação avançada e integrações externas não habilitadas na baseline atual. A exclusão evita testes artificiais sobre comportamentos que o laboratório ainda não utiliza.

## 10. Critérios para evolução da estratégia

A matriz deve ser revista quando ocorrer pelo menos uma destas situações:

- mudança de versão, configuração ou módulo ativo do EverShop;
- nova jornada de negócio incorporada à baseline;
- incidente, defeito recorrente ou evidência que altere impacto ou probabilidade;
- mudança em regras financeiras, estoque, identidade ou autorização;
- resultado de execução que revele lacuna ou redundância nos controles;
- preparação de um novo experimento controlado de regressão.

Novos testes devem referenciar um risco existente ou justificar a inclusão de um novo ID na matriz. Mudanças de prioridade precisam registrar o motivo, mantendo a estratégia curta, rastreável e orientada ao produto.
