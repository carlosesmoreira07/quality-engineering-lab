

## Riscos protegidos

Os controles priorizam privacidade entre clientes e proteção do acesso administrativo. As referências técnicas correspondentes são **Privacidade de pedidos entre clientes** (`RISK-005`) e **Proteção do acesso administrativo a pedidos** (`RISK-016`).

## Camadas de proteção

| Camada | Sinal produzido |
|---|---|
| Comportamento | Playwright confirma ownership entre clientes e bloqueio de privilégios administrativos |
| Código | CodeQL analisa JavaScript e TypeScript |
| Dependências | Dependency Review bloqueia novas vulnerabilidades altas ou críticas |
| Repositório | Secret Scanning, Push Protection e alertas do Dependabot complementam a proteção |

As evidências comportamentais registram papéis genéricos, tentativa, resultado e decisão. Credenciais, cookies, tokens e identificadores sensíveis não devem ser publicados.

## Limites

O escopo não representa pentest, DAST amplo, fuzzing ou cobertura integral do OWASP Top 10. CodeQL analisa o código deste repositório, não o código interno da imagem EverShop.

Fontes: [estratégia técnica de segurança](https://github.com/carlosesmoreira07/quality-engineering-lab/blob/main/docs/adr/0005-security-quality-strategy.md) e [cenários de autorização](https://github.com/carlosesmoreira07/quality-engineering-lab/tree/main/quality/tests/api/security).
