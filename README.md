![Capa LOLA Aço Inox & Acessórios](docs/lola-readme-banner.svg)

<div align="center">

[![CI](https://github.com/LEVIATAD21/lola_site/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/LEVIATAD21/lola_site/actions/workflows/ci.yml)
![Status](https://img.shields.io/badge/status-prot%C3%B3tipo%20em%20desenvolvimento-C49A5A?style=flat-square)
![React](https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?style=flat-square&logo=tailwindcss)

**Elegância nos detalhes. Uma experiência de compra em construção.**

[Visão geral](#-sobre-o-projeto) · [Telas](#-experiência-da-loja) · [Tecnologias](#-tecnologias) · [Executar localmente](#-como-executar) · [Produção](#-como-colocar-em-produção) · [Arquitetura](#-arquitetura-de-segurança) · [Testes](#-qualidade-e-testes) · [Próximas etapas](#-estado-atual-e-próximas-etapas)

</div>

---

## ✨ Sobre o projeto

**LOLA Aço Inox & Acessórios** é uma experiência de loja virtual para apresentar semijoias e acessórios com uma identidade visual editorial, delicada e sofisticada.

A interface foi construída em torno de uma paleta de **creme, bege, dourado suave e marrom escuro**, com tipografia elegante, fotografias de produto e componentes responsivos. O objetivo é oferecer uma navegação acolhedora, do primeiro contato com a coleção até a revisão da sacola e a demonstração do checkout.

> [!IMPORTANT]
> **Este repositório ainda está em desenvolvimento.** O checkout registra um pré-pedido pendente e cifrado, mas não cobra, não gera Pix/boleto e não confirma uma venda. O estoque fica reservado em memória por 30 minutos enquanto o pré-pedido aguarda pagamento. Frete e cupons ainda são demonstrativos; as quantidades iniciais do estoque também são dados de exemplo. Não use dados reais de cartão neste protótipo.

## 💎 Experiência da loja

O projeto está organizado em cinco experiências principais, mantendo a mesma identidade visual:

| Experiência | O que apresenta | Implementação |
|---|---|---|
| **01 · Home** | Apresentação da marca, destaques, categorias e benefícios. | [Componentes da Home](src/components) |
| **02 · Categoria / Brincos** | Navegação pelo catálogo, filtros e cartões de produto. | [Página de categoria](src/components/category/EarringsCategoryPage.tsx) |
| **03 · Detalhe do produto** | Galeria, descrição, especificações e opções de compra. | [Página do produto](src/components/product/ProductDetailPage.tsx) |
| **04 · Carrinho** | Revisão de itens, cupons, estimativa de frete e subtotal. | [Página do carrinho](src/components/cart/CartPage.tsx) |
| **05 · Checkout** | Dados de entrega, seleção demonstrativa do pagamento e resumo final. | [Página de checkout](src/components/checkout/CheckoutPage.tsx) |

O **Assistente Lola** funciona como um componente flutuante da experiência, e não como uma tela adicional. O painel administrativo não faz parte do escopo atual.

## 🧭 Funcionalidades presentes

- Navegação entre as cinco experiências da loja.
- Catálogo de demonstração com categorias e recomendações.
- Sacola e favoritos mantidos localmente no navegador.
- Consulta de disponibilidade por meio do serviço de estoque do projeto.
- Consulta automática de CEP via ViaCEP para preencher logradouro, bairro, cidade e UF; o cliente informa o número do imóvel.
- Validação dos dados de endereço no checkout demonstrativo.
- Aplicação demonstrativa de cupons e estimativa de frete.
- Cartão de crédito desativado até a integração de um provedor seguro; Pix e boleto também apenas registram pré-pedidos, sem cobrança real.
- Assistente flutuante com tratamento de indisponibilidade de consulta.
- Verificação de tipos, testes unitários e build configurados no fluxo de CI.

Os itens acima descrevem o que existe na interface e no código; não significam que pagamentos, frete, estoque persistente ou pedidos reais estejam operacionais.

## 🛠️ Tecnologias

- **React** e **TypeScript** — interface e tipagem.
- **Vite** — desenvolvimento e build do frontend.
- **Tailwind CSS** — estilos e responsividade.
- **Lucide React** — ícones.
- **Express** — servidor de desenvolvimento e endpoints demonstrativos em `server.ts` (vitrine) e `data-server.ts` (banco de dados no modo dividido).
- **Vitest** — testes unitários.
- **Google GenAI SDK** — integração opcional da assistente, conforme configuração do servidor.

## 🗂️ Organização do projeto

```text
lola_site/
├── public/
│   └── images/                  # Imagens usadas pela interface
├── docs/
│   └── lola-readme-banner.svg   # Capa visual desta página do GitHub
├── src/
│   ├── components/              # Componentes e telas da loja
│   │   ├── category/             # Categoria de brincos
│   │   ├── cart/                 # Carrinho e cálculo demonstrativo de frete
│   │   ├── checkout/             # Endereço, pagamento e resumo
│   │   └── product/              # Detalhes e compra do produto
│   ├── data/                     # Catálogo e regras demonstrativas de cupons
│   ├── server/                   # Camada de dados e segurança do backend
│   │   ├── stock.ts               # Autoridade de estoque (soma, reserva, baixa)
│   │   ├── orders.ts              # Validação e montagem do pré-pedido
│   │   ├── dataPlane.ts           # Plano de dados local (o dono dos arquivos)
│   │   ├── httpDataPlane.ts       # Plano de dados remoto (cache + circuito)
│   │   ├── internalAuth.ts        # Assinatura HMAC do canal interno
│   │   ├── internalClient.ts      # Cliente HTTP endurecido (anti-SSRF)
│   │   ├── internalRoutes.ts      # Rotas /internal do servidor de dados
│   │   ├── adminRoutes.ts         # Rotas administrativas do servidor de dados
│   │   ├── adminAuth.ts           # Chave administrativa (timing-safe)
│   │   └── ipAllow.ts             # Allowlist de origem por CIDR
│   ├── services/                 # Comunicação com APIs
│   ├── utils/                    # Validações e utilitários
│   ├── types.ts                  # Tipos compartilhados
│   ├── App.tsx                   # Navegação e estado principal
│   └── main.tsx                  # Entrada da aplicação
├── server.ts                     # Vitrine pública (e modo embutido)
├── data-server.ts                # Servidor de dados privado (modo dividido)
├── package.json                 # Scripts e dependências
├── vite.config.ts                # Configuração do Vite
└── .github/workflows/ci.yml      # Verificação automatizada
```

## 🚀 Como executar

### Pré-requisitos

- Node.js **22 ou superior**.
- npm.
- Git.

### 1. Baixe o projeto

```bash
git clone https://github.com/LEVIATAD21/lola_site.git
cd lola_site
```

### 2. Instale as dependências

```bash
npm ci
```

### 3. Inicie o ambiente local

```bash
npm run dev
```

O servidor de desenvolvimento usa a porta **3000** por padrão. Acesse [http://localhost:3000](http://localhost:3000).

> ⚠️ **O modo de desenvolvimento não é ambiente de produção.** Ele expõe os middlewares do Vite na porta da aplicação e transforma arquivos `.ts` sob demanda. O `vite.config.ts` já nega o backend (`server.ts`, `src/server/**`), `.data/**`, chaves locais, `.env*`, `.npmrc` e lockfiles, mas **não rode `npm run dev` em rede pública nem com dados reais de clientes**. Em produção use `npm run build` e `NODE_ENV=production npm start`, que serve apenas os arquivos compilados de `dist/`.

### 4. (Opcional) Execute o modo dividido

Por padrão `npm run dev` sobe tudo num processo só. Para separar a vitrine do banco de dados — o modelo recomendado quando houver máquina pública e máquina privada — suba dois processos com o mesmo segredo:

```bash
# terminal 1 — servidor de dados (fica de costas para a internet)
LOLA_INTERNAL_SECRET="$(openssl rand -hex 32)" npm run dev:data

# terminal 2 — vitrine pública, apontando para o vizinho
LOLA_DATA_SERVICE_URL=http://127.0.0.1:4300 \
LOLA_INTERNAL_SECRET="<o mesmo segredo>" npm run dev
```

No modo dividido a vitrine **não** abre `LOLA_DATA_DIR`, não guarda a chave AES dos pedidos nem a `LOLA_ADMIN_API_KEY`, e responde `404` para `/internal/*` e para as rotas administrativas. Veja [Arquitetura de segurança](#-arquitetura-de-segurança) para o racional e as variáveis envolvidas.

### Variáveis de ambiente

A integração da assistente pode depender de uma chave configurada no ambiente do servidor, como `GEMINI_API_KEY`. Configure segredos somente no ambiente local ou no gerenciador de segredos do serviço de hospedagem. **Nunca inclua chaves privadas no frontend, no repositório ou em variáveis com prefixo público `VITE_`.**

## 🧪 Qualidade e testes

Os comandos disponíveis são:

| Comando | Finalidade |
|---|---|
| `npm run lint` | Verificação de tipos TypeScript (`tsc --noEmit`). |
| `npm test` | Executa os testes unitários com Vitest. |
| `npm run build` | Gera a versão de produção do frontend com Vite. |
| `npm run dev` | Inicia o servidor de desenvolvimento (vitrine + dados no mesmo processo). |
| `npm run dev:data` | Inicia só o servidor de dados, para o modo dividido em dev. |

O workflow [GitHub Actions · CI](.github/workflows/ci.yml) executa instalação, verificação de tipos, testes e build para alterações na branch `main` e pull requests direcionados a ela.

> A existência desses comandos e do workflow não garante, por si só, que a última execução passou. Consulte a página de [Actions](https://github.com/LEVIATAD21/lola_site/actions) para conferir os resultados reais.

## 🌐 Como colocar em produção

Tudo o que a operação precisa está em [`deploy/`](deploy/): `Dockerfile` + `docker-compose.yml` na raiz, proxy reverso (`Caddyfile` ou `nginx.conf`), backup com teste de restauração e o checklist de lançamento. O passo a passo abaixo é o resumo — quem opera deve seguir o [`deploy/CHECKLIST.md`](deploy/CHECKLIST.md), item a item, com o comando de verificação de cada um.

### 1. Escolha um dos dois modos (o mesmo código, duas superfícies)

| | `--profile embutido` | `--profile dividido` (recomendado) |
|---|---|---|
| Serviços | 1 container (vitrine + API) | `vitrine` (pública) + `data-server` (privada) |
| Chave AES dos pedidos | no ambiente do próprio container | só no `.env.dados`, que a vitrine não lê |
| Painel administrativo | opt-in (`LOLA_EMBEDDED_ADMIN=true`) | no `data-server`, sem porta publicada |
| Rede | 1 rede | rede pública + rede `internal: true` |
| VPS mínima | 1 GB | 1 GB (o ganho é de superfície, não de hardware) |

No modo dividido, o servidor de dados **não publica porta nenhuma**: ele fica só na rede interna do Docker (`internal: true`, sem rota para a internet), e o painel é alcançado por túnel SSH — `ssh -N -L 4100:172.31.1.10:4100 usuario@servidor` — ou por `docker compose exec`. Quem comprometer a vitrine exposta não encontra a chave de cifra nem as rotas de administração.

### 2. Suba assim

```bash
# pré-requisitos: Docker 24+ / Compose v2.24+ (Node 22 no host, para os scripts)
git clone <repo> /srv/lola && cd /srv/lola

install -m 600 deploy/env.producao.example       /srv/lola/.env        # e edite
install -m 600 deploy/env.producao.dados.example  /srv/lola/.env.dados  # e edite

docker compose --profile dividido up -d --build   # ou --profile embutido
```

Os exemplos de ambiente explicam, variável por variável, o que trocar e por quê — inclusive por que a chave AES **não** pode morar no `.env` comum no modo dividido.

### 3. Proxy reverso

O compose sobe o Caddy automaticamente (perfil `dividido`/`embutido`, serviço `proxy-caddy`) lendo [`deploy/Caddyfile`](deploy/Caddyfile): TLS automático, redirect HTTP→HTTPS e o painel administrativo bloqueado no host público. Prefere nginx? Descomente o serviço `proxy-nginx`, tire o `proxy-caddy` e aponte para [`deploy/nginx.conf`](deploy/nginx.conf).

### 4. Backup (sem plano de restore, não é backup)

```bash
install -m 700 deploy/backup.sh /usr/local/bin/lola-backup
LOLA_COMPOSE_SERVICE=data-server lola-backup   # copia do container, testa a restauração e rotaciona
```

O script recusa gravar backup que não conseguiu decifrar: ele roda `deploy/verify-orders-restore.mjs` contra o conteúdo candidato **antes** de criar o `.tar.gz`, e só então aplica a retenção. Agende no cron e — obrigatório — guarde a chave AES **fora** da máquina (cofre de senhas + papel no cofre físico): o backup não a inclui de propósito, e sem ela os `.enc` são lixo.

### 5. Antes de dizer "está no ar"

Siga o [`deploy/CHECKLIST.md`](deploy/CHECKLIST.md). Os itens que mais derrubam lançamento são: IP real por trás do proxy (sem `LOLA_TRUSTED_PROXY` declarado, todo cliente divide o mesmo bucket de rate limit), `X-Forwarded-For` forjado sendo ignorado, e backup agendado mas nunca testado.

### 6. Manutenção recorrente

| Tarefa | Quando | Ferramenta |
|---|---|---|
| Backup + teste de restauração | diário (cron) | `deploy/backup.sh` |
| Rotação da chave AES dos pedidos | anual, ou antes de 80% do teto de 10.000 registros | [`deploy/rotate-orders-key.md`](deploy/rotate-orders-key.md) |
| `docker compose pull && up -d --build` | a cada release | git tag + compose |
| Conferir `docker compose logs vitrine \| tail` | semanal | — |

A chave AES tem teto de uso por arquivo (`orders.enc.json`, 10.000 registros) e o servidor avisa ao chegar em 90%. A rotação **não** é "trocar a variável e reiniciar": o script redecifra cada registro com a chave velha e redecifra com a nova, falhando alto se qualquer registro não sobreviver.

## 🧩 Estado atual e próximas etapas

### Já preparado no frontend
- Identidade visual consistente entre as cinco telas.
- Estado local de carrinho e favoritos.
- Validação defensiva de dados carregados do armazenamento.
- Tratamento de falha na consulta de estoque.
- Testes unitários para validações, cupons, payloads de estoque e armazenamento do carrinho.

### Necessário antes de vender de verdade
- Persistência real de produtos, preços e estoque.
- Validação definitiva de preço, disponibilidade e cupom no servidor.
- Cotação oficial de frete e prazo.
- Integração com provedor de pagamento e habilitação de cartão somente após autorização real do provedor.
- Criação de pedidos e confirmação por resposta real do servidor/provedor.
- Revisão final das políticas comerciais, privacidade e conteúdo de produto.

### Princípio de manutenção

O visual aprovado deve evoluir sem redesenho desnecessário: **corrigir primeiro a consistência, confiabilidade, acessibilidade e integração, preservando a identidade LOLA**.

---

<div align="center">

**LOLA Aço Inox & Acessórios**

*Mais que acessórios, é sobre você. ♡*

[Repositório no GitHub](https://github.com/LEVIATAD21/lola_site) · [Commits](https://github.com/LEVIATAD21/lola_site/commits/main) · [Actions](https://github.com/LEVIATAD21/lola_site/actions)

</div>


## 🏛️ Arquitetura de segurança

O projeto roda em **um de dois modos**, escolhido na largada e nunca por requisição. Não existe caminho intermediário: se `LOLA_DATA_SERVICE_URL` estiver preenchido, o servidor é dividido; se estiver vazio, é embutido. Um atacante não consegue alternar entre os dois mandando um header ou uma query string.

```text
                       modo dividido

   [ Site público A ]  ──leitura──▶  [ Banco de dados C ]  ◀──escrita──  [ Admin B ]
    exposto à internet                (data-server.ts)                    rede privada
    sem chave AES                      127.0.0.1 por padrão              com LOLA_ADMIN_API_KEY
    sem LOLA_ADMIN_API_KEY             allowlist de origem por CIDR
    sem acesso a LOLA_DATA_DIR         dono de .data/ e da chave
```

A separação é de **superfície**, não de confiança. A máquina que fica de cara para a internet deixa de carregar as duas chaves que mais doem: a que cifra os dados pessoais do pedido e a que abre o painel administrativo. Se essa máquina for comprometida, o invasor herda uma vitrine que só sabe ler catálogo e encaminhar pré-pedido para o vizinho assinado.

### O canal interno

A vitrine não confia em si mesma para falar com o vizinho: toda chamada `/internal/*` carrega uma assinatura HMAC-SHA256 calculada sobre

```text
lola-internal-v1 \n {timestamp} \n {nonce} \n {MÉTODO} \n {caminho} \n sha256(corpo)
```

e é verificada com comparação em tempo constante. Cada camada fecha uma porta diferente:

| Camada | O que fecha |
|---|---|
| **Assinatura HMAC** | Impede que qualquer pessoa que descubra a porta fabrique uma chamada válida. |
| **Janela de ±30 s** (`LOLA_INTERNAL_SKEW_MS`) | Faz a assinatura expirar; um vazamento antigo não vira acesso permanente. |
| **Nonce de uso único** | Fecha o replay: reenviar um pacote capturado dentro da janela devolve `nonce_esgotado`. Os nãoces guardados têm teto (`LOLA_INTERNAL_MAX_NONCES`, padrão 200 mil) e são varridos por intervalo, nunca por requisição. |
| **Corpo cru assinado** | Um byte alterado no payload invalida tudo. O corpo é lido com `express.raw` *antes* do `express.json`, senão a assinatura cairia sobre um objeto já parseado. |
| **Teto por minuto** (`LOLA_INTERNAL_PER_MINUTE`) | Limita o custo de um flood sobre o verificador. |
| **Resposta idêntica em toda recusa** | `401 {"error":"Não autorizado."}` com `Cache-Control: no-store` para assinatura errada, janela estourada, nonce repetido e segredo curto — sem oráculo. O log real é protegido por orçamento (20 linhas/s), senão um flood de recusas encheria o disco. |

Do lado da vitrine, o cliente endurecido recusa base URL vinda de requisição (anti-SSRF), recusa credenciais, query string, fragmento, redirecionamentos (`redirect: 'error'`) e esquemas que não sejam `http`/`https`; limita o corpo lido a 64 KB; usa caminho com regex restrita; tem timeout (`AbortSignal.timeout`) e — importante — **recusa `http://` fora de loopback**, porque o canal carria nome, telefone e endereço em texto puro. Só quem declara `LOLA_INTERNAL_PLAINTEXT=true` abre essa exceção, e o servidor avisa no log.

### O que a vitrine perde no modo dividido

- Não monta as rotas administrativas: `/api/admin/pre-pedidos` e `/api/estoque/atualizar` respondem `404`, **mesmo com a chave correta na mão**.
- Não abre `LOLA_DATA_DIR`, não lê nem grava `.data/`, e não constrói a chave AES.
- Não monta `/internal/*`; esse prefixo responde `404` declarado, para que um refactor futuro que montasse o router no lugar errado caia no fallback da SPA sem ninguém perceber.
- A saúde (`/api/health`) não revela qual é o plano de dados: o campo vem genérico.

### Postura do servidor de dados

- **Só escuta em `127.0.0.1`** (`LOLA_BIND_HOST`). Bind coringa (`0.0.0.0`/`::`) é recusado em produção a menos que `LOLA_ALLOW_WILDCARD_BIND=true` seja declarado com consciência.
- **Não sobe sem segredo** de pelo menos 32 caracteres. Segredo curto vira recusa de tudo (`fail-closed`), não exceção.
- **Sem CORS**: o painel precisa falar com o próprio backend, que carrega a chave. Colocar `LOLA_ADMIN_API_KEY` em JavaScript de navegador seria entregá-la a qualquer visitante.
- **Sem `trust proxy`**: a allowlist e o rate limit leem `req.socket.remoteAddress`. `X-Forwarded-For` forjado não abre porta nem balde novo.
- **Allowlist de origem por CIDR** (`LOLA_ADMIN_ALLOWED_IPS`), com padrão loopback + faixa privada. A verificação da chave vem **antes** da da origem, para que um atacante com chave errada não aprenda nada sobre como a rede está fatiada.
- **TLS opcional mas lembrado** (`LOLA_TLS_CERT_FILE` + `LOLA_TLS_KEY_FILE`, os dois ou nenhum). Sem ele, `x-admin-key` e o PII dos pedidos atravessam a rede privada em claro. Bind fora de loopback sem TLS gera aviso explícito no log de subida.

### Recusas na largada

Nenhuma dessas situações vira um servidor rodando "mais fraco do que o esperado": todas recusam subir.

| Situação | Comportamento |
|---|---|
| `LOLA_INTERNAL_SECRET` ausente ou < 32 caracteres | `data-server.ts` não inicia; `server.ts` em modo dividido recusa o canal. |
| `LOLA_DATA_SERVICE_URL` malformada, com credenciais, query, fragmento ou esquema inválido | `server.ts` não inicia. |
| `http://` fora de loopback sem `LOLA_INTERNAL_PLAINTEXT=true` | `server.ts` não inicia. |
| `LOLA_ORDERS_ENCRYPTION_KEY` com permissão aberta em produção | Pré-pedidos desligados (não grava dado pessoal sem chave segura). |
| Bind coringa em produção sem `LOLA_ALLOW_WILDCARD_BIND=true` | `data-server.ts` não inicia. |
| `LOLA_TLS_CERT_FILE` e `LOLA_TLS_KEY_FILE` declarados só um dos dois, ou apontando para o mesmo arquivo | `data-server.ts` não inicia. |

### Comportamento degradado

Se o servidor de dados cair, a vitrine não desaba nem vaza: as leituras servem o cache velho por até `LOLA_SNAPSHOT_STALE_MS` (padrão 60 s) e, depois disso, respondem `503` genérico. Os pré-pedidos não têm degradação — falhou o canal, `503` — porque aceitar pedido sem reservar estoque seria exatamente o `oversell` que a arquitetura existe para evitar.

O estoque do modo embutido reserva em memória por 30 minutos; no modo dividido essa memória vive no servidor de dados, então reiniciar **esse** processo libera as reservas ativas. Para produção comercial com múltiplas instâncias, o JSON cede lugar a um banco transacional — está documentado, não escondido.


## Operação do backend

- O endpoint `GET /api/health` verifica se o servidor responde.
- A consulta pública de estoque revela somente `productId` e `disponivel`; total, reservas e unidades vendidas permanecem fora da resposta pública.
- O catálogo da API usa a mesma fonte `src/data/mockData.ts` que alimenta as telas; IDs, nomes, descrições, imagens e preços não são duplicados no backend.
- O estoque fica em `.data/inventory.json` (ou no caminho definido por `LOLA_DATA_DIR`). O arquivo é criado no primeiro início do servidor; mantenha o diretório em um volume persistente nos deploys. **No modo dividido, só o `data-server.ts` abre esse diretório** — a vitrine não o cria, não o lê e não o modifica.
- Antes do uso comercial, substitua as quantidades de demonstração já existentes pelas quantidades físicas reais. Novos produtos começam com estoque zero até que ele seja configurado. Mantenha `total = reservado + vendido + disponivel` e use inteiros não negativos.
- `POST /api/estoque/atualizar` só aceita baixa de estoque com o cabeçalho `x-admin-key` válido. Sem `LOLA_ADMIN_API_KEY` configurada com pelo menos 32 caracteres, a operação fica desativada. Baixas inválidas, IDs desconhecidos e quantidades acima da disponibilidade são recusados. A gravação em JSON atende uma única instância Node; várias instâncias exigem banco transacional.
- Checkout, cálculo logístico e cobranças continuam demonstrativos até que integrações comerciais reais sejam configuradas.


## Pré-pedido e proteção de dados

- `POST /api/pedidos/rascunho` valida endereço, termos, itens, estoque, cupom e modalidade de frete, usando preços do catálogo no servidor. Preços enviados pelo cliente são ignorados.
- **Cupom é regra de servidor, não de vitrine.** Os códigos ficam visíveis no bundle (o desconto de campanha é informação de prateleira, não segredo), mas `checkCoupon` só concede se o cupom existir, estiver dentro da validade (`COUPON_RULES[code].validUntil`), atingir o subtotal mínimo e não ter estourado o teto de usos — contado sobre os pré-pedidos gravados. Antes, os três códigos eram reutilizáveis para sempre, sem mínimo e sem fim.
- **CEP precisa ser plausível**, não apenas ter 8 dígitos: fora da faixa real (`01000-000` a `99999-999`) ou sequência degenerada (`00000000`, `11111111`) é recusado. O endereço ainda não é reconciliado com o ViaCEP — isso recusaria pedido de CEP não consultável e é decisão comercial.
- A solicitação fica com status `awaiting_payment_setup` e pagamento `not_configured`: não há cobrança real, Pix/boletos emitidos ou confirmação final de venda nesta versão.
- Ao registrar o pré-pedido, o backend **reserva as unidades por `LOLA_RESERVATION_TTL_MS` (padrão 30 minutos)**, sem gravar nada no arquivo de estoque: `disponivel` devolvido à vitrine já vem líquido das reservas ativas. Assim, pedidos simultâneos não vendem o mesmo exemplar duas vezes. Ao expirar, o estoque volta sozinho. As reservas vivem em memória, então reiniciar o processo libera as reservas ativas.
- A baixa administrativa em `POST /api/estoque/atualizar` consome primeiro as unidades pré-reservadas (ordem de chegada) e só depois as livres; uma baixa acima do saldo restaura as reservas intactas.
- Número do cartão, CVV e validade não são enviados à API nem persistidos. Nome, telefone, endereço e itens são gravados cifrados com AES-256-GCM em `.data/orders.enc.json`.
- Em desenvolvimento, a chave é criada em `.data/orders.key` com permissões restritas — **ao lado** do arquivo cifrado, ou seja, uma cópia de backup de `.data/` leva ciphertext e chave juntos. Isso é aceitável só fora de produção e o servidor avisa no log de subida. Em produção, configure `LOLA_ORDERS_ENCRYPTION_KEY` como segredo (64 caracteres hexadecimais; `openssl rand -hex 32`) ou `LOLA_ORDERS_KEY_FILE` apontando para um arquivo fora de `LOLA_DATA_DIR` (padrão dos volumes de segredo do Docker/Kubernetes, com permissão 0600). Sem nenhum dos dois, o backend recusa registrar dados pessoais.
- **No modo dividido, a chave AES e o `LOLA_ORDERS_KEY_FILE` só existem no `data-server.ts`.** A vitrine jamais a carrega: ela devolve ao vizinho o corpo do pedido assinado, e é o vizinho que valida, reserva estoque e cifra. Comprometer a máquina pública não entrega a chave de criptografia dos pedidos.
- `.data/` está no `.gitignore` (nunca vai para o repositório) e o servidor de desenvolvimento do Vite nega o serviço de `*.key`, `.env`, `*.pem` e afins — um `GET` no caminho deles cai no fallback da SPA em vez de devolver o conteúdo.
- O armazenamento JSON serve a uma única instância. Para produção comercial/múltiplas instâncias, use banco transacional, backup protegido, controle de acesso e integrações reais de pagamento e logística.


## API administrativa protegida

- `GET /api/admin/pre-pedidos?limit=50` lista no máximo 100 solicitações recentes; `GET /api/admin/pre-pedidos/:orderNumber` retorna um pré-pedido específico.
- `POST /api/estoque/atualizar` também é uma operação administrativa: não permite que visitantes diminuam artificialmente o estoque.
- A autenticação administrativa tem limite de tentativas por IP. Os limites são locais por processo; produção com múltiplas instâncias deve adicionar um WAF ou armazenamento compartilhado de rate limiting.
- Todas essas rotas exigem o cabeçalho `x-admin-key`. Configure `LOLA_ADMIN_API_KEY` como segredo no servidor com pelo menos 32 caracteres; gere com `openssl rand -hex 32`. Sem essa variável (ou com valor curto), as operações privilegiadas ficam recusadas.
- **Em modo dividido essas rotas existem apenas no `data-server.ts`.** A vitrine responde `404` para elas com ou sem chave, e é essa a garantia: o processo exposto à internet não tem o painel nem a chave. Rode o painel atrás de rede privada ou VPN, nunca na internet.
- **Allowlist de origem** (`LOLA_ADMIN_ALLOWED_IPS`): aceita IPs e CIDRs separados por vírgula, por padrão loopback + faixa privada (RFC1918, link-local, ULA IPv6). A origem é lida do socket, nunca de um header — `X-Forwarded-For` forjado não passa. Entrada inválida cai para o padrão privado em vez de abrir tudo. A `any` desliga a restrição, mas exige o valor literal e avisa no log.
- A ordem das verificações é intencional: a **chave é checada antes da origem**, com resposta `401` idêntica à de "sem chave". Se fosse ao contrário, um atacante com chave errada descobriria que existe restrição de rede e passaria a mapear a topologia interna.
- Não coloque a chave no frontend, em variáveis `VITE_*`, em URLs ou no repositório. Use HTTPS em produção.
- A resposta para "chave errada" e para "chave não configurada" é **idêntica (401)**, de propósito: uma diferença de status ou texto seria um oráculo que diz a um visitante se existe chave administrativa no servidor. O diagnóstico real aparece no log (`admin.desativado` na subida e `admin.access` a cada tentativa) e nunca contém a chave.
- A chave é uma proteção técnica básica para a API; o projeto ainda não tem painel administrativo, contas de funcionários, perfis por função ou sessões com MFA. Toda tentativa administrativa é registrada em log, mas sem trilha de "quem" (não há identidade de usuário nesta versão).


## Cabeçalhos e limites HTTP

- O backend aplica `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e políticas de isolamento de origem. Em produção, adiciona uma Content Security Policy compatível com os recursos da loja.
- O parser JSON aceita corpos de no máximo 16 KiB. As consultas à assistente, os pré-pedidos, as rotas administrativas e as consultas GET de catálogo têm limites de frequência.
- **Node.js `>=22.12.0`** é exigido (`engines` + `.nvmrc`): é o piso do Vite 8, a restrição mais estrita das dependências. `npm ci` recusa instalar em versão menor. O `npm start` roda o servidor via `tsx`, então o backend funciona igual em qualquer versão dentro dessa faixa — não depende de suporte nativo a TypeScript, que só ficou ligado por padrão a partir do 22.18.
- `GET /api/produtos`, `GET /api/produto/:id` e `GET /api/estoque/:id` têm teto de 300 req/min por IP (`LOLA_READ_PER_MINUTE`). Antes não havia limite nenhum, o que permitia raspagem completa do catálogo e inundação do log. `GET /api/health` fica fora de propósito: monitor de uptime e balanceador consultam com frequência e a rota é O(1).
- `POST /api/ai/consulta` tem três camadas por IP (20/min, 120/h e 400/dia) e aborta a chamada ao modelo após `LOLA_AI_TIMEOUT_MS` (padrão 20 s), caindo no motor local de regras. Sem essas camadas, um atacante dispara centenas de milhares de chamadas pagas por dia em nome da loja. Em produção com tráfego real, ajuste os tetos conforme o orçamento da conta Gemini.
- `POST /api/pedidos/rascunho` tem teto de **10 pré-pedidos por minuto por IP** (`LOLA_ORDER_PER_MINUTE`). É uma rota que consome estoque e grava dado pessoal cifrado, então o teto é deliberadamente baixo; suba apenas em teste.
- No modo dividido, o canal interno tem teto próprio (`LOLA_INTERNAL_PER_MINUTE`, padrão 10 000/min) do lado do servidor de dados, contado **por origem e não por caminho** — o middleware alcança qualquer rota sob `/internal`, e agrupar por caminho daria balde novo a cada rota inventada. A vitrine guarda o catálogo em cache por `LOLA_SNAPSHOT_TTL_MS` (padrão 5 s) com reserva de voo única — sem isso, uma rajada de visitantes viraria uma tempestade de chamadas contra o vizinho.
- **HSTS vem ligado por padrão em produção** e os navegadores ignoram o cabeçalho recebido por HTTP simples, então o padrão só protege. Desligue com `LOLA_HSTS_ENABLED=false` apenas se o hostname ainda precisar atender por HTTP. `LOLA_HSTS_INCLUDE_SUBDOMAINS=true` arrasta subdomínios junto — só ligue se todos já estiverem em HTTPS, porque quebra subdomínio em HTTP pelo período inteiro do max-age (180 dias).
- A API administrativa e as respostas da API não são armazenadas em cache pelo navegador.
- Os códigos de pré-pedido agora usam 12 caracteres aleatórios. Eles são identificadores, não substitutos da autenticação administrativa.


## 📋 Registro de eventos e operação

O backend emite uma linha por evento, com carimbo de tempo, nível e campos no formato `chave=valor`:

```
2026-10-12T12:00:00.000Z INFO  servidor.iniciado porta=3000 ambiente=development estatico=nao trustProxy=nao reservaEstoqueMs=1800000
2026-10-12T12:00:01.000Z INFO  http.request ip=127.0.0.1 method=POST path=/api/pedidos/rascunho status=201 ms=4.2
2026-10-12T12:00:01.000Z INFO  pedido.registrado ip=127.0.0.1 numero=LOLA-20261012-8F3A1C0D2B4E itens=2
2026-10-12T12:00:05.000Z WARN  admin.access ip=203.0.113.9 method=POST path=/api/estoque/atualizar outcome=denied reason=chave_ausente_ou_inválida
```

Eventos: `servidor.iniciado`, `servidor.falha_ao_iniciar`, `http.request`, `http.erro_nao_tratado`, `http.logs_suppressed`, `pedido.registrado`, `pedido.recusado_por_estoque`, `pedido.falha_ao_persistir`, `pedidos.desativado`, `admin.access`, `admin.desativado`, `admin.embutido_em_producao`, `estoque.reserva_expirada`, `dev.exposto`, `plano.local_configurado`, `plano.remoto_configurado`, `interno.requisicao_rejeitada`, `interno.estoque_falhou`, `interno.pedido_falhou`, `dados.servidor_iniciado`, `dados.falha_configuracao`, `dados.falha_ao_iniciar`, `dados.bind_por_hostname`.

No modo dividido, os eventos com prefixo `dados.` são do `data-server.ts` e os com prefixo `interno.` marcam recusas do canal assinado. As recusas de assinatura vêm protegidas por orçamento (20 linhas por segundo): sem isso, um flood de chamadas inválidas encheria o disco da máquina de logs de rejeição — que é exatamente o que a limitação de requisições existe para evitar.

Regras fixas do registro:

- **Nunca** são gravados: corpo de requisição, cabeçalhos, chave administrativa, `GEMINI_API_KEY`, nome/telefone/endereço do cliente, conteúdo de prompt ou resposta do assistente. Só o número do pré-pedido, que é identificador de negócio.
- A query string fica de fora por padrão (`req.path`, sem `?...`), porque filtros de busca podem conter dados digitados pela cliente.
- As linhas de log são limitadas a 600 por minuto; acima disso elas são suprimidas e a contagem de supressão vira um evento `http.logs_suppressed`. Sem esse teto, um flood de requisições encheria o disco da máquina com logs.
- Falhas 500 gravam o motivo real do lado do servidor, enquanto a resposta HTTP continua genérica — antes, `console.error('Erro interno na API.')` descartava o motivo e tornava incidente inexplicável.
- As rotas administrativas registram cada tentativa com origem, caminho e desfecho (`allow`/`denied`/`not_configured`), sem a chave em si.
- **O IP é mascarado antes de virar linha** (`LOLA_LOG_IP_MODE=mask`, padrão): `189.45.10.203` é gravado como `189.45.x.x`. IP endereçável é dado pessoal (LGPD, art. 5º, I), e o logger o registrava em três eventos — requisição, acesso administrativo e pedido. O agregado do provedor basta para reconhecer padrão de tráfego sem guardar o assinante. `hash` troca por um token HMAC (só agrupa, não identifica), `full` devolve o endereço inteiro para investigação pontual e `off` remove o campo.
- Em produção, direcione a saída para o coletor do sistema (journald, CloudWatch, Loki) e configure rotação de arquivos; mesmo mascarado, o log contém identificador de pedido e agregado de rede, então trate como dado de operação sujeito à LGPD.
