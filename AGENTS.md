# Instruções do repositório

- Leia `CONTEXT.md`, `docs/quality-strategy.md` e os ADRs aplicáveis antes de propor mudanças de qualidade.
- Preserve a arquitetura Playwright, k6 e GitHub Actions existente até que um risco concreto justifique evolução.
- Relacione controles automatizados a riscos reais: Playwright usa anotações `risk`; k6 documenta risco, workload, checks e thresholds.
- Não leia, versione ou exponha `.env`, credenciais, tokens, cookies ou cabeçalhos de autorização.
- Trate análises geradas por IA como consultivas. Elas não alteram Jira, código, testes, estratégia ou Quality Gates sem solicitação e revisão humanas.
- Para análise de impacto, use a skill `qe-impact-analysis` e descubra cobertura no estado atual do repositório; não mantenha uma matriz manual paralela.
- Execute as validações proporcionais ao arquivo alterado e registre limitações sem transformar ausência de evidência em sucesso.
