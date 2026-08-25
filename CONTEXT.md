# Linguagem do Quality Engineering Lab

## Termos

**SUT**: ambiente de referência reproduzível do EverShop utilizado como Sistema Sob Teste.

**Demanda**: mudança ou objetivo descrito em um card Jira e submetido à análise de impacto.

**Risco**: modo de falha de produto registrado em `docs/quality-strategy.md`, com nome orientado ao negócio e referência técnica estável `RISK-*`, classificado por impacto, probabilidade e prioridade. Na comunicação, o nome vem primeiro e o ID aparece como detalhe de rastreabilidade.

**Controle**: verificação executável capaz de detectar uma falha relevante, como uma assertion Playwright, um check/threshold k6 ou um gate objetivo de CI.

**Evidência**: resultado observável produzido por um controle. Documentação de intenção, sozinha, não é evidência de execução.

**Gap**: parte relevante de um risco para a qual nenhum controle atual oferece sinal suficiente.

**Análise de impacto de qualidade**: leitura consultiva que conecta demanda, comportamento afetado, riscos, controles existentes e gaps.

**Quality Gate**: regra determinística do pipeline que aprova ou reprova uma execução. Uma conclusão de IA não é Quality Gate.

**Revisão humana**: decisão explícita de uma pessoa sobre riscos, cobertura e recomendações antes de qualquer mudança ou aprovação.

## Relações

- Uma demanda pode acionar nenhum, um ou vários riscos.
- Um risco pode ter vários controles complementares em camadas diferentes.
- Um controle só reduz confiança sobre o comportamento que consegue observar.
- Um gap gera recomendação, não implementação automática.
