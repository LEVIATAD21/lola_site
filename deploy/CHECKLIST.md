# ✅ Checklist de produção — lola_site

Cada item tem um **comando de verificação**. Rode antes de dizer "está no ar".
Os comandos usam `example.com`/`loja.exemplo.br` como placeholder — troque pelos
seus domínios reais.

> **NO-GO administrativo:** o repositório `lola_site_admin` ainda é um painel
> demonstrativo baseado em `localStorage`, sem autenticação humana individual,
> sessões revogáveis, MFA ou integração autenticada com a API. As rotas admin do
> backend ainda usam chave compartilhada + allowlist. Não publique o painel como
> ferramenta operacional nem coloque a chave no browser até essa arquitetura ser
> substituída e validada.

> **NO-GO geral para lançamento comercial:** ainda não há banco transacional
> compartilhado para pedidos/estoque, gateway de pagamento com webhooks reais,
> cotação/rastreio de transportadora validado em produção, nem evidência de
> restauração de backup e pentest dinâmico no ambiente implantado. As rotas de
> pagamento/logística não podem ser apresentadas como integrações reais. Só
> retirar este bloqueio depois de implementar e testar cada integração real.

---

## 1. Antes de qualquer coisa

- [ ] `docker --version` ≥ **28** (obrigatório: a partir daí o Docker exige
      declarar a faixa de rede; sem isso `docker compose up` falha com
      *"no matching subnetwork for IPv4 address"*). Se for mais antigo, instale
      pelo **repositório oficial do Docker** — pacote apt com chave GPG
      verificada, nunca `curl … | sh` (pipe de URL para shell executa conteúdo
      externo mutável como root):

      ```bash
      # exemplo em Ubuntu; em Debian troque `ubuntu` por `debian` nos dois caminhos
      sudo apt-get update && sudo apt-get install -y ca-certificates curl
      sudo install -m 0755 -d /etc/apt/keyrings
      sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
      sudo chmod a+r /etc/apt/keyrings/docker.asc
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
      sudo apt-get update
      sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ```

      Passo a passo oficial por distribuição: <https://docs.docker.com/engine/install/>.
      Depois, revise `COMPOSE_DOCKER_NETWORK` no `.env`.
- [ ] `docker compose version` (v2, não v1 — o `docker-compose` legado não
      entende `env_file.path/required`).
- [ ] `git clone <repo> /srv/lola && cd /srv/lola && git checkout <tag>`
      — versione o que sobe, nunca um diretório solto.
- [ ] `install -m 600 deploy/env.producao.example /srv/lola/.env` e edite
      **todas** as linhas marcadas com "O que trocar" (o `APP_URL` e o
      `LOLA_INTERNAL_SECRET` são os dois mais importantes).
- [ ] Escolha **um** perfil e instale somente o arquivo de segredos correspondente:
      - **Dividido:** `install -m 600 deploy/env.producao.dados.example /srv/lola/.env.dados`;
        preencha `LOLA_ORDERS_ENCRYPTION_KEY` e `LOLA_ADMIN_API_KEY` nesse arquivo.
      - **Embutido:** `install -m 600 deploy/env.producao.embutido.example /srv/lola/.env.embutido`;
        preencha as mesmas chaves nesse arquivo. Não carregue `.env.embutido` no modo dividido.
- [ ] Confira os valores obrigatórios no arquivo comum:
      `grep -E '^(LOLA_INTERNAL_SECRET|APP_URL)=' /srv/lola/.env`.
- [ ] Dividido: `grep -E '^(LOLA_ORDERS_ENCRYPTION_KEY|LOLA_ADMIN_API_KEY)=' /srv/lola/.env.dados`.
- [ ] Embutido: `grep -E '^(LOLA_ORDERS_ENCRYPTION_KEY|LOLA_ADMIN_API_KEY)=' /srv/lola/.env.embutido`.
- [ ] `git check-ignore -v .env .env.dados .env.embutido` — tem que responder o caminho do ignore
      (senão o `.env` pode ir para o GitHub no próximo `git add .`).
- [ ] `git status --porcelain` — nenhum `.env*` aparecendo.

## 2. Segredos e acesso

- [ ] `LOLA_INTERNAL_SECRET` no `.env` comum e `LOLA_ORDERS_ENCRYPTION_KEY` +
      `LOLA_ADMIN_API_KEY` somente no arquivo de segredos do perfil escolhido;
      use valores fortes reais e guarde as chaves fora da máquina. `GEMINI_API_KEY`
      deve permanecer vazia em produção até existir aviso/consentimento LGPD
      verificável; mesmo configurada, a chave não habilita chamadas externas.
- [ ] `~/.ssh/authorized_keys` só com as chaves de quem administra (1 por
      pessoa; sem chave duplicada).
- [ ] Firewall do provedor (Security Group / UFW) só com **80, 443 e 22** e a
      22 restrita ao IP de quem administra. A porta **4100 do data-server não
      é publicada** — não existe porta para abrir.
- [ ] `sudo ufw status verbose` (ou o painel do provedor) — sem porta 4100.

## 3. Domínio e TLS

> **`dist/` não é um deploy completo em segurança.** Os cabeçalhos (CSP, HSTS,
> `X-Frame-Options`, `nosniff`) são emitidos pela aplicação Express e pelo
> proxy, não pelos arquivos estáticos: servir o `dist/` cru (CDN, S3,
> pré-visualização) entrega o site sem essas proteções. O caminho suportado é
> o deste checklist — aplicação atrás do proxy.

- [ ] `www`, `apes` (ou o domínio da loja) e `pedidos` apontando para o IP do
      servidor (A/AAAA; se usar Cloudflare, proxy pode ficar ligado, mas aí
      `LOLA_TRUSTED_PROXY` precisa incluir faixas oficiais do Cloudflare como
      IPs/CIDRs explícitos; contagem de saltos e faixas nomeadas são recusadas).
- [ ] Subiu com `docker compose --profile dividido up -d` (recomendado) ou
      `--profile embutido`.
- [ ] `curl -sI https://www.example.com/api/health | head -3` → `HTTP/2 200`.
- [ ] `curl -sI https://www.example.com | grep -i strict-transport` →
      `max-age=15552000`.
- [ ] `curl -sI http://www.example.com | head -1` → `301` para https.
- [ ] `curl -sI https://www.example.com/.env | head -1` → `404` (nunca `200`).
- [ ] `curl -sI https://www.example.com/admin | head -1` → `404` ou `403`,
      **nunca** `200`.
- [ ] `curl -sI https://pedidos.example.com/ | head -1` → `404` (o servidor de
      dados é API pura e não serve página nenhuma; o painel em si é protegido
      por allowlist, ver próxima seção).
- [ ] `curl -s https://pedidos.example.com/api/health` → `{"status":"ok"}`.

## 4. IP real por trás do proxy (obrigatório)

Sem isso, os logs registram o IP do Caddy, o rate limit agrupa clientes e a
proteção CSRF não consegue validar o esquema HTTPS. Em produção, o servidor
público falha na inicialização sem IPs/CIDRs explícitos em `LOLA_TRUSTED_PROXY`.

- [ ] `docker compose logs vitrine | grep 'http.request ip=' | tail -3` — tem
      que aparecer o IP **público** de quem fez a requisição, não
      `172.31.0.x` nem `::ffff:127.0.0.1`.
- [ ] Teste do header: `curl -s -H 'X-Forwarded-For: 8.8.8.8' https://www.example.com/api/health >/dev/null`
      e confira no log: tem que continuar aparecendo o **seu IP real** (o
      Express só aceita XFF de quem está na lista `LOLA_TRUSTED_PROXY`).
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://pedidos.example.com/api/admin/pedidos`
      → `401`/`403` de fora da rede interna (é o esperado: sem chave e sem
      estar na allowlist). Nunca coloque `LOLA_ADMIN_API_KEY` no navegador.

## 5. Backup (sem plano de restore, não é backup)

- [ ] `LOLA_ORDERS_KEY` salva **fora da máquina** (cofre de senhas do dono,
      ex.: Bitwarden/1Password/LastPass + cópia em papel no cofre). É a única
      coisa que o backup NÃO leva — se ela se perder, os arquivos `.enc` viram
      lixo.
- [ ] `crontab -e` com a linha apontando **para dentro do repositório** (o
      script resolve a raiz da loja pelo próprio caminho e sai com `exit 2`
      se morar fora dele, ex.: `0 4 * * * LOLA_COMPOSE_SERVICE=data-server
      /caminho/do/lola_site/deploy/backup.sh`). O log vai para
      `~/lola-backups/backup.log`.
- [ ] `bash deploy/backup.sh` manual, uma vez, **antes** do lançamento, e
      conferir a última linha do log:
      `ok=... itens=... bytes=...` — se aparecer qualquer erro, o script já
      abortou e você sabe agora, não no dia do apagão.
- [ ] Data do primeiro `.tar.gz` em `~/lola-backups` confere com a de hoje.

## 6. Administração temporária (modo dividido)

> O `data-server` é uma API, não serve a página `/admin`. O repositório
> `lola_site_admin` continua demonstrativo (`localStorage`), sem login humano,
> sessões, MFA ou integração autenticada. **Não use esse painel como operação
> real e nunca coloque `LOLA_ADMIN_API_KEY` no navegador.** A administração
> temporária abaixo é somente por API via túnel SSH e chave guardada no ambiente
> do operador; ainda não substitui identidade individual/RBAC.

- [ ] `docker compose exec data-server sh -lc 'wget -qO- http://127.0.0.1:4100/api/health || curl -sf http://127.0.0.1:4100/api/health'`
      → `{"status":"ok"}`.
- [ ] Túnel SSH sem publicar a porta 4100:
      `ssh -N -L 4100:172.31.1.10:4100 usuario@servidor`.
- [ ] No terminal do operador, carregar a chave do cofre/secret store em
      `LOLA_ADMIN_API_KEY` e consultar:
      `curl --config <(printf 'header = "x-admin-key: %s"\\n' "$LOLA_ADMIN_API_KEY") -fsS http://127.0.0.1:4100/api/admin/pre-pedidos`.
      Não gravar a chave em histórico de shell, script versionado ou navegador.
- [ ] `curl -sI http://127.0.0.1:4100/admin | head -1` → `404` (a API não
      serve interface administrativa).
- [ ] `docker compose ps` — os serviços com `healthy`, não `unhealthy`.

## 7. Lançamento

- [ ] `curl -s https://www.example.com/ | grep -o '<title>[^<]*'` → título
      correto do site.
- [ ] Assistente virtual: enviar uma mensagem de teste e conferir a resposta
      local (`200` com `{"resposta": ...}`). Em produção, perguntas/contexto não
      são enviados ao Google, mesmo que `GEMINI_API_KEY` esteja configurada;
      chamadas externas ficam bloqueadas até existir aviso e consentimento
      verificável na interface.
- [ ] `docker compose logs vitrine 2>&1 | grep -i -e error -e exception | tail`
      → sem erro novo.
- [ ] `docker stats --no-stream` — memória dos containers estável.
- [ ] Vitrine com "comprar direto": `POST /api/pedidos/rascunho` respondendo
      `201` (é o endpoint do vitrine, no mesmo domínio; não existe nenhuma
      rota `/api/pedido`).
- [ ] Backup diário agendado e **testado em restore** (o `deploy/backup.sh`
      já roda o teste automático em toda execução; veja `backup.log`).
