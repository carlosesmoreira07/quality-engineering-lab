# ADR 0007 — Experimentos controlados de regressão

## Status

Aceito.

## Contexto

O laboratório possui controles funcionais, de performance e de segurança, mas precisava demonstrar objetivamente que eles falham diante de regressões relevantes. Essa demonstração não pode enfraquecer as asserções, alterar thresholds, vulnerabilizar a imagem do produto nem contaminar a baseline usada pelo Quality Gate normal.

## Decisão

Executar três experimentos identificados como EXP-001, EXP-002 e EXP-003 por meio de um proxy HTTP local e efêmero. O orquestrador aplica o mesmo controle existente em três fases: baseline saudável, variante controlada e baseline restaurada. A detecção é aprovada apenas com a sequência GREEN → RED → GREEN.

O workflow correspondente será acionado somente por `workflow_dispatch`. Durante a variante, o código de saída real do controle é preservado para manter o job vermelho, enquanto o artifact estruturado registra separadamente que o gate do produto foi reprovado e que a capacidade de detecção foi aprovada.

## Isolamento

Regressões nunca pertencem à baseline. As variantes degradadas ou propositalmente inseguras permanecem locais, não são publicadas como imagem e só existem enquanto o proxy efêmero está ativo. O comando padrão do SUT continua iniciando exclusivamente a versão saudável.

## Experimentos

- EXP-001 viola o RISK-002 ao apresentar preço divergente e é observado pelo controle funcional de produto/carrinho.
- EXP-002 viola o RISK-018 ao degradar a página de produto sob a mesma workload e é observado pelo threshold k6 existente.
- EXP-003 viola o RISK-016 ao simular resposta indevidamente autorizada e é observado pelo controle de autorização existente.

## Evidência

Cada execução registra a sequência baseline GREEN → variante RED → baseline restaurada GREEN. Na fase regressiva, o resultado esperado do produto é **FAIL / Gate REPROVADO**; quando esse vermelho é produzido pelo controle correto e a restauração passa, o resultado do experimento é **PASS / DETECÇÃO APROVADA**.

## Consequências

- O SUT, seus dados e sua imagem padrão permanecem saudáveis.
- Testes, asserções e thresholds existentes continuam sendo a fonte de verdade.
- A restauração é simples: encerrar o proxy devolve imediatamente o tráfego à baseline.
- Os resultados são reproduzíveis localmente e no CI, sem serviço ou framework adicional.
- O check manual vermelho exige leitura do artifact para distinguir defeito real de regressão intencional.

## Alternativas consideradas

- Alterar temporariamente testes ou thresholds: rejeitado porque fabricaria a detecção.
- Manter variantes defeituosas no código ou em imagens do SUT: rejeitado pelo risco de ativação acidental.
- Adotar plataforma de mutation testing ou chaos engineering: rejeitado por exceder a necessidade e a escala do card.
