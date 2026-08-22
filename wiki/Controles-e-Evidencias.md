# Controles e Evidências

## Do risco à decisão

Cada validação deve responder quatro perguntas:

1. **Risco:** qual dano ao negócio pode ocorrer?
2. **Controle:** qual comportamento é capaz de detectar esse dano?
3. **Evidência:** o que a execução observou?
4. **Decisão:** a mudança pode avançar neste escopo?

## Controles existentes

- jornadas Web de produto, autenticação, carrinho e integração Administração → Storefront;
- contratos e integridade por API;
- isolamento entre clientes e bloqueio de acesso administrativo;
- disponibilidade e tempo de resposta com k6;
- análise de dependências, CodeQL e proteção contra secrets;
- smoke read-only após merge para confirmar a saúde da `main`.

Os cenários completos e suas limitações permanecem na [documentação da automação](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/quality/README.md).

## Evidências produzidas

| Público | Evidência | Onde encontrar |
|---|---|---|
| Liderança e Produto | Quality Report executivo em PDF | artifact `quality-evidence-*` do [Quality Gate](https://github.com/carlosesmoreira07/quality-engineering-lab/actions/workflows/quality-gate.yml) |
| Engenharia e QA | HTML Reporter, attachments, traces e resultados Playwright | mesmo artifact do Quality Gate |
| Performance | resumo JSON e saída k6 | artifact do Quality Gate |
| Pós-merge | HTML, resultados read-only e resumo de performance | artifact `post-merge-smoke-*` |
| Experimentos | sequência GREEN → RED → GREEN e diagnóstico estruturado | artifact da execução manual de experimentos |

Artifacts são retidos por período limitado. O código, a estratégia e as decisões permanecem versionados; resultados de execução não são apresentados como evidência permanente quando já expiraram.

## Como interpretar

- **Verde:** o controle observou o comportamento esperado no escopo exercitado.
- **Vermelho:** a barreira bloqueia a mudança ou, em um experimento controlado, comprova a detecção da regressão proposital.
- **Sem evidência:** não é sucesso; exige nova execução ou análise da lacuna.

Próximo passo: [CI/CD e Barreiras da Qualidade](CI-CD-e-Barreiras-da-Qualidade).
