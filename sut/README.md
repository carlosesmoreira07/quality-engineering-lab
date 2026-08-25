# Sistema Sob Teste

O Sistema Sob Teste (SUT) deste laboratório é o [EverShop](https://github.com/evershopcommerce/evershop), uma plataforma open source de comércio eletrônico. Ele oferece um produto realista para a aplicação das práticas de Quality Engineering sem que o laboratório precise desenvolver uma aplicação própria.

O EverShop é software de terceiros, distribuído sob a licença [GNU GPL v3](https://github.com/evershopcommerce/evershop/blob/v2.2.1/LICENSE). Seu código-fonte não faz parte deste repositório.

## Versão de referência

- EverShop: `2.2.1`
- Imagem: `evershop/evershop:2.2.1@sha256:d0823576f91b621e07b1fd913b326f8f463374615dc5301fd67b951123dd6967`
- PostgreSQL: `16.10-alpine`

## Iniciar

Pré-requisito: Docker com Docker Compose.

A partir do diretório `sut`, opcionalmente copie `.env.example` para `.env` caso queira alterar os valores locais. A configuração padrão já é suficiente para iniciar o ambiente e aguardar os serviços ficarem saudáveis:

```bash
docker compose up -d --wait
```

A primeira inicialização executa as migrações, carrega os dados oficiais de demonstração e configura a página inicial automaticamente. O processo pode levar alguns minutos. Consulte o estado dos serviços com:

```bash
docker compose ps
```

O seed oficial pode exigir acesso externo para obter as imagens de demonstração. Se o banco ficar parcialmente inicializado, execute o reset completo descrito abaixo.

Quando o serviço `evershop` estiver `healthy`, acesse:

- Página inicial: <http://localhost:3000>
- Catálogo de demonstração: <http://localhost:3000/accessories>
- Administração: <http://localhost:3000/admin>

Se `SUT_PORT` for alterada no `.env`, utilize a porta configurada.

A loja funciona sem um usuário administrativo. Para acessar o painel e explorar as funções administrativas, substitua os valores de exemplo e execute:

```bash
docker compose exec evershop npm run user:create -- --email "admin@example.test" --password "SUA_SENHA_LOCAL" --name "Administrador"
```

## Encerrar

Para encerrar os containers preservando os dados locais:

```bash
docker compose down
```

## Reset completo

Para remover containers, rede, banco e mídia locais e retornar ao estado de referência:

```bash
docker compose down --volumes --remove-orphans
docker compose up -d --wait
```

Esse procedimento exclui definitivamente todo o estado local do SUT.

O bootstrap utiliza o schema interno do EverShop `2.2.1`. Qualquer atualização do EverShop exige sua revalidação.
