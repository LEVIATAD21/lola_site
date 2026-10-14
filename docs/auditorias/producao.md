# 📦 REPORT.md — infraestrutura de produção do lola_site

Data: 2026-10-13 · Branch: `agente/prod` · Worktree: `/tmp/opencode/lola-prod`

Este relatório cobre a camada de infraestrutura que faltava para colocar a loja
no ar: imagem, orquestração nos dois modos de operação, proxy reverso,
backup com teste de restauração, rotação da chave de cifra e o checklist de
lançamento.

---

## 1. O que foi criado

| Arquivo | O que é |
|---|---|
| `Dockerfile` | Imagem única multi-stage (`node:22-bookworm-slim`). Estágio 1 compila o Vite; estágio 2 leva `dist/`, os dois entrypoints e só dependências de produção. Usuário `node` (1000), rootfs gravável só em `/app/.data`, `HEALTHCHECK` real em `/api/health` lendo `PORT` do ambiente (o mesmo serve vitrine em 3000 e data-server em 4100). |
| `.dockerignore` | Mantém `.data/`, `.env*`, `*.key`, `.git`, testes e docs FORA do contexto — a imagem nunca pode conter dado de cliente nem segredo. |
| `docker-compose.yml` | Perfis `embutido` (1 serviço) e `dividido` (`vitrine` + `data-server`). Endurecimento comum: `read_only`, `tmpfs /tmp`, `cap_drop: ALL`, `no-new-privileges`, log rotacionado. Redes com subfaixa fixa (`lola-publica` 172.31.0.0/24, `lola-interna` 172.31.1.0/24 `internal: true`), data-server com IP fixo e **sem `ports:`**. Volumes: `lola-data` nomeado, montado só por quem tem os dados. |
| `deploy/Caddyfile` | Proxy recomendado: TLS automático, redirect HTTP→HTTPS, HSTS, limite de corpo 32 kB e bloqueio do painel administrativo no host público. |
| `deploy/nginx.conf` | Mesma política para quem prefere nginx: TLS + webroot ACME, `client_max_body_size 32k`, bloqueio de `/admin` por IP do socket. |
| `deploy/backup.sh` | `set -euo pipefail` + `umask 077`. Copia `.data/` de diretório local ou do container (`docker compose cp`), gera manifesto SHA-256, **testa a restauração com `verify-orders-restore.mjs` antes de gravar** e só então aplica retenção (`LOLA_BACKUP_KEEP`). No modo dividido lê a chave do ambiente do container sem passar por linha de comando. |
| `deploy/verify-orders-restore.mjs` | Node puro (sem `tsx`), fail-closed: decifra com AES-256-GCM + AAD literal `lola-orders\|orders.enc.json` (mesmo valor de `src/server/orders.ts`), valida estrutura do pedido e o invariante do estoque (`total = reservado + vendido + disponivel`). |
| `deploy/rotate-orders-key.ts` | Rotação de chave com redecifra/redecifra registro a registro, dry-run por padrão, prova de leitura do `.tmp` antes do rename e detecção de arquivo alterado durante a execução. |
| `deploy/rotate-orders-key.md` | Runbook da rotação (inclui o caminho por túnel SSH, sem publicar porta). |
| `deploy/env.producao.example` | `.env` de produção comentado variável por variável, com o porquê de cada escolha. |
| `deploy/env.producao.dados.example` | `.env.dados` — só o data-server lê: chave AES dos pedidos e chave do painel. |
| `deploy/CHECKLIST.md` | Checklist de lançamento com **comando de verificação por item** (TLS, HSTS, `.env` fora do git, IP real por trás do proxy, backup testado, painel via túnel). |
| `README.md` | Nova seção **🌐 Como colocar em produção**: os dois modos lado a lado, comandos de subida, proxy, backup e manutenção recorrente. |

Arquivos tocados em vez de criados: `.gitignore` (ignora `deploy/backups/`) e
`README.md`.

## 2. O que foi validado de verdade

Sem ferramenta de shell neste ambiente (ver §3), a validação foi de
**consistência por leitura cruzada entre os arquivos** — o tipo de erro que só
aparece juntando a pilha inteira:

- **Nomes de variáveis** conferidos um a um contra `.env.example`,
  `server.ts` e `data-server.ts`: o projeto usa `LOLA_ORDERS_ENCRYPTION_KEY`
  (não `LOLA_ORDERS_KEY`), o canal interno é `LOLA_DATA_SERVICE_URL` +
  `LOLA_INTERNAL_SECRET`, e o bind do data-server é `LOLA_BIND_HOST`. Os
  exemplos de produção usam os nomes reais.
- **Quem lê o quê**: confirmei em `server.ts` (linhas 116–147) que no modo
  dividido a vitrine monta `HttpDataPlane` e **não** instancia o
  `createLocalDataPlane` — logo a chave AES no `.env` comum seria lida só no
  modo embutido; por isso ela foi para `.env.dados` e o `.env` comum guarda
  `LOLA_INTERNAL_SECRET`, que as duas partes precisam.
- **Compose × código**: `command: ["node","--import","tsx","data-server.ts"]`
  reproduz `npm run start:data`; `LOLA_BIND_HOST=172.31.1.10` satisfaz a
  recusa de bind coringa em produção (`data-server.ts` linhas 62–70); a rede
  `internal: true` justifica `LOLA_INTERNAL_PLAINTEXT=true` na vitrine.
- **Imports dos scripts**: `rotate-orders-key.ts` importa
  `EncryptedOrderStore` e `parseOrdersAad` — os dois exportados em
  `src/server/orders.ts` (`static readonly MAX_RECORDS` inclusive).
- **`.dockerignore` × `Dockerfile`**: `.env.*` e `*.key` caem no ignore, então
  `COPY deploy ./deploy` não pode puxar segredo para a imagem.

## 3. O que NÃO foi validado (e o comando para você rodar)

Este ambiente não tinha ferramenta de shell: **`tsc`, `vitest`, `git`, `docker`
e `npm` não puderam ser executados**. Nada foi committado. Rode, nesta ordem,
no worktree `/tmp/opencode/lola-prod`:

```bash
cd /tmp/opencode/lola-prod
export PATH="$HOME/.local/bin:$PATH"

npx tsc --noEmit          # tem que sair limpo (os novos .ts de deploy/ entram no tsconfig)
npx vitest run            # tem que continuar com 258 testes verdes, sem teste novo

git status --porcelain    # confira antes: só os arquivos listados na §1
git add -A
git commit -m "infra: Docker, compose nos dois modos, proxy, backup e runbook de produção"
```

Se algo falhar em `tsc`, o culpado mais provável é `deploy/rotate-orders-key.ts`
(foi escrito sem poder compilar). Corrija o erro apontado, não remova o script.

Validação de Docker (também pendente, exige daemon):

```bash
docker build --check .                         # lint do Dockerfile, sem construir
docker compose --profile dividido config       # valida YAML, perfis e env_file
docker compose --profile embutido config
docker compose --profile dividido up -d --build && docker compose ps   # tudo "healthy"
bash deploy/backup.sh                          # o teste de restauração roda junto
```

## 4. Decisões que continuam com você

1. **Provedor e domínio**: o compose e o `deploy/env.producao.example` assumem
   um servidor único com Docker 24+ e os domínios `www`, `loja` (ou o que você
   registrar) e `pedidos`. Sem domínio não há TLS confiável.
2. **Tamanho da máquina**: a separação vitrine/data-server foi feita para
   caber numa VPS de 1 GB com os dois containers na mesma máquina — o ganho é
   de superfície de ataque, não de hardware. Se separar em duas máquinas, aí
   sim o canal interno precisa de TLS (`LOLA_TLS_CERT_FILE`/`LOLA_TLS_KEY_FILE`)
   e a conta sobe.
3. **Cofre da chave AES**: o backup não inclui a chave de propósito. Escolha o
   destino (cofre de senha + papel no cofre físico) ANTES do primeiro backup
   agendado, e anote onde ficou no runbook de rotação.
4. **Cron de backup**: o script está pronto, mas quem agenda é o operador
   (linha de exemplo no cabeçalho do `deploy/backup.sh`). Backup que ninguém
   agendou não existe no dia do apagão.
5. **Orçamento do Gemini**: os limites sugeridos no `.env` de produção são
   conservadores; revise conforme a fatura real — a IA degrada para o motor
   local sem derrubar o formulário.

## 5. Limitações conhecidas desta entrega

- Os artefatos de infra **não têm teste automatizado**: `backup.sh`,
  `verify-orders-restore.mjs` e `rotate-orders-key.ts` são scripts de operação
  validados por revisão e pelo teste de restauração que rodam em execução. Não
  adicionei testes por decisão de escopo — a contagem de 258 permanece a mesma.
- O `deploy/nginx.conf` foi escrito para nginx ≥ 1.18 (sintaxe `listen 443 ssl
  http2`) e usa webroot ACME, que exige que você aponte o `root` do desafio
  para um caminho servido em `/.well-known/acme-challenge/`.
- O bloqueio de `/admin` no proxy público existe porque a allowlist do painel
  lê o IP do socket: atrás do proxy, todos os chamadores aparecem com o mesmo
  IP. A forma suportada de administrar é o túnel SSH descrito em
  `deploy/rotate-orders-key.md`.
