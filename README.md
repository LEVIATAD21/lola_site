![Capa LOLA Aço Inox & Acessórios](docs/lola-readme-banner.svg)

<div align="center">

[![CI](https://github.com/LEVIATAD21/lola_site/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/LEVIATAD21/lola_site/actions/workflows/ci.yml)
![Status](https://img.shields.io/badge/status-prot%C3%B3tipo%20em%20desenvolvimento-C49A5A?style=flat-square)
![React](https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?style=flat-square&logo=tailwindcss)

**Elegância nos detalhes. Uma experiência de compra em construção.**

[Visão geral](#-sobre-o-projeto) · [Telas](#-experiência-da-loja) · [Tecnologias](#-tecnologias) · [Executar localmente](#-como-executar) · [Testes](#-qualidade-e-testes) · [Próximas etapas](#-estado-atual-e-próximas-etapas)

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
- **Express** — servidor de desenvolvimento e endpoints demonstrativos em `server.ts`.
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
│   ├── services/                 # Comunicação com APIs
│   ├── utils/                    # Validações e utilitários
│   ├── types.ts                  # Tipos compartilhados
│   ├── App.tsx                   # Navegação e estado principal
│   └── main.tsx                  # Entrada da aplicação
├── server.ts                     # Servidor Express e endpoints demonstrativos
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

### Variáveis de ambiente

A integração da assistente pode depender de uma chave configurada no ambiente do servidor, como `GEMINI_API_KEY`. Configure segredos somente no ambiente local ou no gerenciador de segredos do serviço de hospedagem. **Nunca inclua chaves privadas no frontend, no repositório ou em variáveis com prefixo público `VITE_`.**

## 🧪 Qualidade e testes

Os comandos disponíveis são:

| Comando | Finalidade |
|---|---|
| `npm run lint` | Verificação de tipos TypeScript (`tsc --noEmit`). |
| `npm test` | Executa os testes unitários com Vitest. |
| `npm run build` | Gera a versão de produção do frontend com Vite. |
| `npm run dev` | Inicia o servidor de desenvolvimento. |

O workflow [GitHub Actions · CI](.github/workflows/ci.yml) executa instalação, verificação de tipos, testes e build para alterações na branch `main` e pull requests direcionados a ela.

> A existência desses comandos e do workflow não garante, por si só, que a última execução passou. Consulte a página de [Actions](https://github.com/LEVIATAD21/lola_site/actions) para conferir os resultados reais.

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


## Operação do backend

- O endpoint `GET /api/health` verifica se o servidor responde.
- A consulta pública de estoque revela somente `productId` e `disponivel`; total, reservas e unidades vendidas permanecem fora da resposta pública.
- O catálogo da API usa a mesma fonte `src/data/mockData.ts` que alimenta as telas; IDs, nomes, descrições, imagens e preços não são duplicados no backend.
- O estoque fica em `.data/inventory.json` (ou no caminho definido por `LOLA_DATA_DIR`). O arquivo é criado no primeiro início do servidor; mantenha o diretório em um volume persistente nos deploys.
- Antes do uso comercial, substitua as quantidades de demonstração já existentes pelas quantidades físicas reais. Novos produtos começam com estoque zero até que ele seja configurado. Mantenha `total = reservado + vendido + disponivel` e use inteiros não negativos.
- `POST /api/estoque/atualizar` só aceita baixa de estoque com o cabeçalho `x-admin-key` válido. Sem `LOLA_ADMIN_API_KEY` configurada com pelo menos 32 caracteres, a operação fica desativada. Baixas inválidas, IDs desconhecidos e quantidades acima da disponibilidade são recusados. A gravação em JSON atende uma única instância Node; várias instâncias exigem banco transacional.
- Checkout, cálculo logístico e cobranças continuam demonstrativos até que integrações comerciais reais sejam configuradas.


## Pré-pedido e proteção de dados

- `POST /api/pedidos/rascunho` valida endereço, termos, itens, estoque, cupom e modalidade de frete, usando preços do catálogo no servidor. Preços enviados pelo cliente são ignorados.
- A solicitação fica com status `awaiting_payment_setup` e pagamento `not_configured`: não há cobrança real, Pix/boletos emitidos ou confirmação final de venda nesta versão.
- Ao registrar o pré-pedido, o backend **reserva as unidades por `LOLA_RESERVATION_TTL_MS` (padrão 30 minutos)**, sem gravar nada no arquivo de estoque: `disponivel` devolvido à vitrine já vem líquido das reservas ativas. Assim, pedidos simultâneos não vendem o mesmo exemplar duas vezes. Ao expirar, o estoque volta sozinho. As reservas vivem em memória, então reiniciar o processo libera as reservas ativas.
- A baixa administrativa em `POST /api/estoque/atualizar` consome primeiro as unidades pré-reservadas (ordem de chegada) e só depois as livres; uma baixa acima do saldo restaura as reservas intactas.
- Número do cartão, CVV e validade não são enviados à API nem persistidos. Nome, telefone, endereço e itens são gravados cifrados com AES-256-GCM em `.data/orders.enc.json`.
- Em desenvolvimento, a chave é criada em `.data/orders.key` com permissões restritas. Em produção, configure `LOLA_ORDERS_ENCRYPTION_KEY` como segredo (64 caracteres hexadecimais; `openssl rand -hex 32`). Sem a chave, o backend recusa registrar dados pessoais.
- O armazenamento JSON serve a uma única instância. Para produção comercial/múltiplas instâncias, use banco transacional, backup protegido, controle de acesso e integrações reais de pagamento e logística.


## API administrativa protegida

- `GET /api/admin/pre-pedidos?limit=50` lista no máximo 100 solicitações recentes; `GET /api/admin/pre-pedidos/:orderNumber` retorna um pré-pedido específico.
- `POST /api/estoque/atualizar` também é uma operação administrativa: não permite que visitantes diminuam artificialmente o estoque.
- A autenticação administrativa tem limite de tentativas por IP. Os limites são locais por processo; produção com múltiplas instâncias deve adicionar um WAF ou armazenamento compartilhado de rate limiting.
- Todas essas rotas exigem o cabeçalho `x-admin-key`. Configure `LOLA_ADMIN_API_KEY` como segredo no servidor com pelo menos 32 caracteres; gere com `openssl rand -hex 32`. Sem essa variável (ou com valor curto), as operações privilegiadas ficam desativadas.
- Não coloque a chave no frontend, em variáveis `VITE_*`, em URLs ou no repositório. Use HTTPS em produção.
- A chave é uma proteção técnica básica para a API; o projeto ainda não tem painel administrativo, contas de funcionários, perfis por função, sessões com MFA ou auditoria administrativa.


## Cabeçalhos e limites HTTP

- O backend aplica `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e políticas de isolamento de origem. Em produção, adiciona uma Content Security Policy compatível com os recursos da loja.
- O parser JSON aceita corpos de no máximo 16 KiB. As consultas à assistente, os pré-pedidos e as rotas administrativas têm limites de frequência.
- `POST /api/ai/consulta` tem três camadas por IP (20/min, 120/h e 400/dia) e aborta a chamada ao modelo após `LOLA_AI_TIMEOUT_MS` (padrão 20 s), caindo no motor local de regras. Sem essas camadas, um atacante dispara centenas de milhares de chamadas pagas por dia em nome da loja. Em produção com tráfego real, ajuste os tetos conforme o orçamento da conta Gemini.
- Se o domínio estiver sempre servido por HTTPS, configure `LOLA_HSTS_ENABLED=true` no ambiente de produção para ativar HSTS. Não habilite essa opção se o mesmo hostname ainda precisar atender por HTTP.
- A API administrativa e as respostas da API não são armazenadas em cache pelo navegador.
- Os códigos de pré-pedido agora usam 12 caracteres aleatórios. Eles são identificadores, não substitutos da autenticação administrativa.
