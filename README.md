# Quality Engineering Lab

O **Quality Engineering Lab**, da Moreira Tech, é um laboratório prático criado para demonstrar como a qualidade pode ser incorporada ao ciclo de desenvolvimento de software, desde a análise da demanda até a decisão de release.

O objetivo não é ser apenas um repositório de testes automatizados, mas demonstrar a aplicação de **Quality Engineering** ao longo de todo o ciclo de desenvolvimento.

O projeto está em desenvolvimento e encontra-se atualmente na **Sprint 1 - MVP Quality Engineering Lab**, dedicada ao estabelecimento de sua fundação.

## Sistema Sob Teste

O laboratório utiliza o EverShop como uma aplicação realista para a evolução das práticas de Quality Engineering. Consulte as [instruções do Sistema Sob Teste](sut/README.md) e a [decisão sobre a estratégia de baseline](docs/adr/0001-sut-baseline-strategy.md).

## Automação de testes

A fundação da automação orientada a riscos está documentada em [quality/README.md](quality/README.md).

## Integração contínua

Pull Requests para `main` são avaliados pelo check **Quality Gate**. A decisão arquitetural e os gates obrigatórios estão registrados em [ADR 0003](docs/adr/0003-ci-quality-gates.md).
