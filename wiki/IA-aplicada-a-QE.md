## Papel da IA

A IA acelera a análise de impacto; ela não decide qualidade. A skill `qe-impact-analysis` lê uma demanda no Jira, relaciona comportamentos a riscos e descobre controles existentes diretamente no repositório.

## Fluxo

1. Ler o card Jira em modo somente leitura.
2. Entender jornadas e possíveis danos ao negócio.
3. Consultar estratégia e Decisões de Arquitetura.
4. Verificar assertions Playwright, verificações k6 e workflows atuais.
5. Classificar cobertura, lacunas e recomendações.
6. Entregar a análise para revisão humana.

## Guardrails

- associação textual a um identificador de risco não comprova cobertura;
- ausência de execução recente não pode ser tratada como sucesso;
- a análise não altera Jira, código, testes ou Quality Gates;
- recomendações não são implementadas sem solicitação e revisão humana;
- secrets e dados de autenticação não entram na análise.

Não existe planilha paralela entre riscos e testes. A fonte é o estado atual da estratégia, automação e pipeline.

Fontes: [IA aplicada ao fluxo de QE](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/ai-quality-engineering.md) e [decisão de arquitetura](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0006-ai-assisted-quality-engineering.md).
