# ✅ Checklist de produção — lola_site

Cada item tem um **comando de verificação**. Rode antes de dizer "está no ar".
Os comandos usam `example.com`/`loja.exemplo.br` como placeholder — troque pelos
seus domínios reais.

---

## 1. Antes de qualquer coisa

- [ ] `docker --version` ≥ **28** (obrigatório: a partir daí o Docker exige
      declarar a faixa de rede; sem isso `docker compose up` falha com
      *"no matching subnetwork for IPv4 address"*). Se for mais antigo:
      `curl -fsSL https://get.docker.com | sh` e revise `COMPOSE_DOCKER_NETWORK`
      no `.env`.
- [ ] `docker compose version` (v2, não v1 — o `docker-compose` legado não
      entende `env_file.path/required`).
- [ ] `git clone <repo> /srv/lola && cd /srv/lola && git checkout <tag>`
      — versione o que sobe, nunca um diretório solto.
- [ ] `install -m 600 deploy/env.producao.example /srv/lola/.env` e edite
      **todas** as linhas marcadas com "O que trocar" (o `APP_URL` e o
      `LOLA_INTERNAL_SECRET` são os dois mais importantes).
- [ ] `install -m 600 deploy/env.producao.dados.example /srv/lola/.env.dados`
      e cole a chave AES de produção (`openssl rand -hex 32`) — no modo dividido
      ela NÃO pode estar no `.env` comum.
- [ ] `grep -c . /srv/lola/.env /srv/lola/.env.dados` — nenhum valor vazio nas
      linhas obrigatórias (`LOLA_INTERNAL_SECRET`, `LOLA_ORDERS_ENCRYPTION_KEY`,
      `LOLA_ADMIN_API_KEY`, `APP_URL`).
- [ ] `git check-ignore -v .env` — tem que responder o caminho do ignore
      (senão o `.env` pode ir para o GitHub no próximo `git add .`).
- [ ] `git status --porcelain` — nenhum `.env*` aparecendo.

## 2. Segredos e acesso

- [ ] `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY` e `LOLA_ORDERS_KEY` com valores
      reais, **nunca** os placeholders do exemplo.
- [ ] `~/.ssh/authorized_keys` só com as chaves de quem administra (1 por
      pessoa; sem chave duplicada).
- [ ] Firewall do provedor (Security Group / UFW) só com **80, 443 e 22** e a
      22 restrita ao IP de quem administra. A porta **4100 do data-server não
      é publicada** — não existe porta para abrir.
- [ ] `sudo ufw status verbose` (ou o painel do provedor) — sem porta 4100.

## 3. Domínio e TLS

- [ ] `www`, `apes` (ou o domínio da loja) e `pedidos` apontando para o IP do
      servidor (A/AAAA; se usar Cloudflare, proxy pode ficar ligado, mas aí
      `LOLA_TRUSTED_PROXY` precisa incluir também as faixas do Cloudflare).
- [ ] Subiu com `docker compose --profile dividido up -d` (recomendado) ou
      `--profile embutido`.
- [ ] `curl -sI https://www.example.com/api/health | head -3` → `HTTP/2 200`.
- [ ] `curl -sI https://www.example.com | grep -i strict-transport` →
      `max-age=15552000`.
- [ ] `curl -sI http://www.example.com | head -1` → `301` para https.
- [ ] `curl -sI https://www.example.com/.env | head -1` → `404` (nunca `200`).
- [ ] `curl -sI https://www.example.com/admin | head -1` → `404` ou `403`,
      **nunca** `200`.
- [ ] `curl -s https://pedidos.example.com/ | head -c 80` →
      `{"ok":true,"servico":"lola-data"}` (o painel em si é protegido por
      allowlist; ver próxima seção).

## 4. IP real por trás do proxy (obrigatório)

Sem isso, os logs registram o IP do Caddy e a lista branca de `/admin` não
funciona direito.

- [ ] `docker compose logs vitrine | grep 'http.request ip=' | tail -3` — tem
      que aparecer o IP **público** de quem fez a requisição, não
      `172.31.0.x` nem `::ffff:127.0.0.1`.
- [ ] Teste do header: `curl -s -H 'X-Forwarded-For: 8.8.8.8' https://www.example.com/api/health >/dev/null`
      e confira no log: tem que continuar aparecendo o **seu IP real** (o
      Express só aceita XFF de quem está na lista `LOLA_TRUSTED_PROXY`).
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://pedidos.example.com/api/admin/pedidos`
      → `401`/`403` de fora da rede interna (é o esperado: sem sessão e sem
      estar na allowlist).

## 5. Backup (sem plano de restore, não é backup)

- [ ] `LOLA_ORDERS_KEY` salva **fora da máquina** (cofre de senhas do dono,
      ex.: Bitwarden/1Password/LastPass + cópia em papel no cofre). É a única
      coisa que o backup NÃO leva — se ela se perder, os arquivos `.enc` viram
      lixo.
- [ ] `crontab -e` com a linha do `deploy/backup.sh` (o `install -m 700` está
      no runbook do script; o log vai para `~/lola-backups/backup.log`).
- [ ] `bash deploy/backup.sh` manual, uma vez, **antes** do lançamento, e
      conferir a última linha do log:
      `ok=... itens=... bytes=...` — se aparecer qualquer erro, o script já
      abortou e você sabe agora, não no dia do apagão.
- [ ] Data do primeiro `.tar.gz` em `~/lola-backups` confere com a de hoje.

## 6. Painel de pedidos (modo dividido)

- [ ] `docker compose exec data-server sh -lc 'wget -qO- http://127.0.0.1:4100/api/health || curl -sf http://127.0.0.1:4100/api/health'`
      → `{"ok":true}`.
- [ ] Entrada do painel pelo túnel (sem expor porta no host):
      `ssh -N -L 4100:172.31.1.10:4100 usuario@servidor` e abrir
      `http://localhost:4100/admin` no navegador de quem administra.
- [ ] `docker compose ps` — os serviços com `healthy`, não `unhealthy`.

## 7. Lançamento

- [ ] `curl -s https://www.example.com/ | grep -o '<title>[^<]*'` → título
      correto do site.
- [ ] Formulário de orçamento: enviar uma mensagem de teste e conferir que
      chega (se `GEMINI_API_KEY` estiver vazia, a resposta é
      "Serviço indisponível (503)" — espere por isso).
- [ ] `docker compose logs vitrine 2>&1 | grep -i -e error -e exception | tail`
      → sem erro novo.
- [ ] `docker stats --no-stream` — memória dos containers estável.
- [ ] Vitrine com "comprar direto": `POST /api/pedido` respondendo (é o
      endpoint do vitrine, no mesmo domínio).
- [ ] Backup diário agendado e **testado em restore** (o `deploy/backup.sh`
      já roda o teste automático em toda execução; veja `backup.log`).
