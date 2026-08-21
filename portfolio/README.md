# Portfolio Showcase

Showcase estático do Quality Engineering Lab. O código-fonte fica em `portfolio/` e a saída descartável é gerada em `portfolio/dist/`, sem framework, backend ou dependências de runtime.

## Preview local

Na raiz do repositório:

```bash
node portfolio/scripts/build.mjs
node portfolio/scripts/serve.mjs
```

Abra `http://localhost:4173`. O primeiro comando também valida arquivos locais, âncoras internas e marcações básicas de acessibilidade e SEO.

## Atualização

- Edite `index.html`, `styles.css` ou `script.js`.
- Mantenha em `assets/` somente imagens públicas, otimizadas e sem secrets.
- Use evidências reais e estáveis; atualize screenshots apenas quando sua leitura de negócio mudar.
- Valide o build e os breakpoints desktop, tablet e mobile antes de enviar a mudança.

Após o merge em `main`, o workflow de GitHub Pages gera e publica `portfolio/dist/`.
