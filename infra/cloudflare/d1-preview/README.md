# LOLA · Teste de conexão Cloudflare Workers + D1

Este diretório contém **um Worker de leitura real** ligado ao D1 que o titular
criou no painel, pelo binding `DB` no arquivo `wrangler.toml`.

> **Escopo:** somente verificar se o Worker lê o banco real e se consegue
> mostrar o catálogo público sem dados fictícios. **Não** é o backend de produção,
> **não** substitui o `data-server.ts`, **não** importa clientes, pedidos,
> estoque ou pagamentos existentes. Não habilita cadastro, checkout, Pix,
> cartão, reembolso, painel administrativo ou API de escrita.

O banco do `wrangler.toml` é **temporário**:

- Nome informado na criação: `lola_db_2026`
- UUID autorizado para visualização: `5c523efb-8580-48ae-bdb0-bd4fb2ae7fb5`
- Binding: `DB`
- Worker: `lola-d1-preview`

O UUID do banco **não é senha nem token**, mas identifica somente o banco
desta conta Cloudflare. Quando o titular criar o banco definitivo, revise
`database_name` e `database_id` antes de qualquer nova implantação.

## Pré-requisitos

- Máquina Linux/Windows/macOS com Node.js compatível com Wrangler atual.
  Use preferencialmente o PC: a execução local do runtime Workerd pode
  não ser suportada no Android/Termux.
- Conta Cloudflare autenticada pelo navegador (sem enviar senhas ou
  tokens ao ChatGPT).
- Acesso autorizado ao D1 e permissão para criar um Worker.
- Nenhum dado financeiro real deve existir neste banco de visualização.

## Implantação manual (somente no banco TEMPORÁRIO)

Execute a partir da raiz do repositório, na branch do PR #16:

```bash
git fetch origin
git switch work/lola-integration-2026-11-07
git pull --ff-only
cd infra/cloudflare/d1-preview
```

Se a branch não existe localmente, use:

```bash
git switch --track origin/work/lola-integration-2026-11-07
```

Autentique sem compartilhar o link de sessão, cookies, senhas ou tokens:

```bash
npx wrangler@latest login
npx wrangler@latest whoami
npx wrangler@latest d1 list
```

**Antes de aplicar qualquer migração**, confira que a lista mostra
`lola_db_2026` com UUID exatamente
`5c523efb-8580-48ae-bdb0-bd4fb2ae7fb5`. Se não corresponder,
**pare**: você pode estar autenticado em outra conta ou usando outro banco.

Com a correspondência verificada:

```bash
node --check src/index.js
node --test tests/worker.contract.mjs
python3 tests/schema_test.py
npx wrangler@latest d1 migrations apply lola_db_2026 --remote
npx wrangler@latest deploy
```

O comando `--remote` **modifica o banco D1 da sua conta** criando as tabelas
do catálogo (sem inserir produtos). `wrangler deploy` cria/publica
`lola-d1-preview` em um endereço `workers.dev` da própria conta. O
Wrangler exibirá o endereço final: **não é possível conhecê-lo antes de
vincular/publicar o Worker na sua conta**.

Após o deploy, abra no navegador o endereço indicado. O painel mostrará:

- **Banco D1 conectado e consultado** — significa que a consulta remota funcionou;
- **0 produtos publicados** — comportamento normal para um banco vazio;
- `/api/health` — `{"status":"ok","database":"connected","mode":"read-only-preview"}`;
- `/api/catalog` — lista de produtos publicados, sem informações de clientes.

Se não houver ligação/migração válida, as rotas retornam **503** em vez de
anunciar sucesso indevidamente. O Worker bloqueia métodos de gravação.

## Encerramento do ensaio

Quando terminar, pode excluir o Worker `lola-d1-preview` e o banco
temporário pelo painel Cloudflare. A exclusão de um banco D1 apaga todos
os seus dados; confira a identidade do recurso antes de fazer isso.

Para **produção real**, é necessário migrar a arquitetura do Data Server
(PostgreSQL/arquivos → D1/Workers, com alterações de autenticação, transações,
estoque, integração Asaas, webhooks e Admin), revisar LGPD, segredos,
observabilidade, limites do plano gratuito, backups e segurança. **Não
implante a aplicação comercial atual apontando somente para este Worker.**

Referências oficiais:
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/d1/wrangler-commands/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/
