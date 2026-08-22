# Visão Geral

## O problema

Testes isolados podem informar que uma funcionalidade passou sem explicar quais perdas foram evitadas, qual confiança foi produzida ou por que uma mudança pode avançar. Isso dificulta a decisão de produto e tecnologia.

## A proposta

O Quality Engineering Lab estrutura a qualidade como um fluxo contínuo:

**Mudança → risco de negócio → controle → evidência → decisão**

Uma plataforma de comércio eletrônico, EverShop 2.2.1, funciona como ambiente de referência reproduzível. Ela oferece jornadas realistas de catálogo, autenticação, carrinho, checkout, pedidos e administração sem incorporar o código do produto ao laboratório.

## Por que o projeto existe

- demonstrar Quality Engineering além da automação de interface;
- tornar riscos compreensíveis para negócio e tecnologia;
- usar controles pequenos, determinísticos e proporcionais;
- transformar resultados em evidências legíveis para públicos executivos e técnicos;
- registrar decisões e limitações sem declarar cobertura que não existe.

## Como a confiança é construída

1. A [Estratégia de Qualidade](Estrategia-de-Qualidade) prioriza modos de falha relevantes.
2. A [Arquitetura e Capacidades](Arquitetura-e-Capacidades) distribui controles entre Web, API, segurança e performance.
3. As [Barreiras da Qualidade](CI-CD-e-Barreiras-da-Qualidade) executam os controles no momento adequado.
4. [Evidências](Controles-e-Evidencias) sustentam a decisão e permitem diagnóstico.
5. [Experimentos Controlados](Experimentos-Controlados) demonstram que controles selecionados realmente ficam vermelhos diante de regressões.

## Limites conscientes

O laboratório não representa cobertura integral do produto, pentest completo ou certificação de capacidade de produção. Limitações são registradas nas fontes técnicas para que ausência de evidência nunca seja interpretada como sucesso.

Próximo passo: [Estratégia de Qualidade](Estrategia-de-Qualidade).
