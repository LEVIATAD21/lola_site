#!/usr/bin/env bash
# =============================================================================
# deploy/backup.sh — backup + rotação de .data/
# =============================================================================
# O que salva (e por quê estes três, e só estes):
#
#   .data/orders.enc.json   pré-pedidos CIFRADOS (AES-256-GCM) — PII de cliente
#   .data/inventory.json    estoque (total/reservado/vendido/disponivel)
#   .data/orders.key        a chave — APENAS em desenvolvimento (ver aviso abaixo)
#
# -----------------------------------------------------------------------------
# AVISO DE CHAVE (leia antes do primeiro backup em produção)
# -----------------------------------------------------------------------------
# Em DESENVOLVIMENTO a aplicação cria a chave AO LADO do ciphertext, em
# `.data/orders.key`. Um backup de `.data/` leva os dois juntos: quem copia o
# diretório já leva a chave. Conveniente em dev; em produção significa que o
# backup não protege nada — o arquivo cifrado e quem o abre viajam juntos.
#
# Em PRODUÇÃO a chave vem de FORA do diretório de dados:
#   LOLA_ORDERS_ENCRYPTION_KEY  (64 hex no ambiente do processo)  ou
#   LOLA_ORDERS_KEY_FILE        (arquivo fora de LOLA_DATA_DIR, permissão 0600)
# Então:
#   * o backup de `.data/` NÃO contém a chave — sozinho é inútil sem ela;
#   * o backup da chave é SEPARADO e MAIS SENSÍVEL que o dos dados: quem tenha
#     os dois tem os clientes; quem tenha só o `.data/` não tem nada;
#   * guarde a chave num cofre (gerenciador de segredos, cofre do provedor) e
#     nunca no mesmo destino do backup dos arquivos;
#   * quem roda este script precisa da chave no ambiente para o TESTE DE
#     RESTAURAÇÃO, e o script RECUSA gravar o que não conseguiu ler. Um backup
#     sem teste de leitura é só um arquivo ocupando disco.
#
# Este script NÃO usa `openssl enc`: os pedidos são AES-256-GCM com AAD e tag
# de autenticação da aplicação. Quem confirma a leitura é
# `deploy/verify-orders-restore.mjs`, com o MESMO algoritmo de
# `src/server/orders.ts`.
#
# -----------------------------------------------------------------------------
# USO
# -----------------------------------------------------------------------------
#   ./deploy/backup.sh                        # .data/ local -> $HOME/lola-backups
#   LOLA_DATA_DIR=/var/lib/lola/.data ./deploy/backup.sh
#   LOLA_BACKUP_DEST=/mnt/backup ./deploy/backup.sh
#   LOLA_COMPOSE_SERVICE=data-server ./deploy/backup.sh   # modo dividido (Docker)
#
# Variáveis:
#   LOLA_DATA_DIR           origem dos arquivos             (padrão <repo>/.data)
#   LOLA_BACKUP_DEST        destino dos .tar.gz             (padrão $HOME/lola-backups)
#   LOLA_BACKUP_KEEP        quantos backups manter          (padrão 14)
#   LOLA_COMPOSE_SERVICE    serviço do docker compose; quando definido, os
#                           arquivos vêm do CONTAINER via `docker compose cp`
#                           (é o caso do modo dividido, onde o volume é do
#                           container e não existe no host)
#   LOLA_CONTAINER_DATA_DIR caminho de .data no container   (padrão /app/.data)
#
# Cron (todo dia às 04:30):
#   30 4 * * * . /etc/lola/segredos.sh; /opt/lola/deploy/backup.sh >> /var/log/lola-backup.log 2>&1
#   # `/etc/lola/segredos.sh` é 0600 e contém só a exportação da chave.
#   # Nunca escreva a chave na linha de comando: ela aparece em `ps` e no
#   # histórico do shell.
#
# Depois distos, copie `$DESTINO` para FORA do servidor (rclone/rsync para
# nuvem). Backup na mesma máquina não sobrevive a um disco que morre junto
# com a aplicação.
# =============================================================================

set -euo pipefail

# Arquivos de backup e diretórios só para o dono: isto é PII de cliente.
umask 077

ORIGEM_LOJA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_VERIFICACAO="$ORIGEM_LOJA/deploy/verify-orders-restore.mjs"

DATA_DIR="${LOLA_DATA_DIR:-$ORIGEM_LOJA/.data}"
DESTINO="${LOLA_BACKUP_DEST:-$HOME/lola-backups}"
MANTEM="${LOLA_BACKUP_KEEP:-14}"
SERVICO="${LOLA_COMPOSE_SERVICE:-}"
DIR_CONTAINER="${LOLA_CONTAINER_DATA_DIR:-/app/.data}"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--ajuda" ]; then
  awk 'NR > 1 && /^set -euo pipefail/{exit} NR > 1{sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"
  exit 0
fi

if ! [[ "$MANTEM" =~ ^[1-9][0-9]*$ ]]; then
  echo "[backup] LOLA_BACKUP_KEEP precisa ser inteiro positivo (recebi: $MANTEM)." >&2
  exit 2
fi

if [ ! -f "$SCRIPT_VERIFICACAO" ]; then
  echo "[backup] script de verificação não encontrado: $SCRIPT_VERIFICACAO" >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[backup] node no PATH é obrigatório: o teste de restauração não é opcional." >&2
  exit 2
fi

# Sempre a partir do repositório: é de lá que o `docker compose` enxerga o
# docker-compose.yml (mesmo que o cron rode com outra working directory).
compose() { (cd "$ORIGEM_LOJA" && docker compose "$@"); }

# -----------------------------------------------------------------------------
# 1. Estágio — traz os arquivos para um diretório temporário aqui
# -----------------------------------------------------------------------------
ESTAGIO="$(mktemp -d "${TMPDIR:-/tmp}/lola-backup.XXXXXX")"
trap 'rm -rf "$ESTAGIO"' EXIT

echo "[backup] origem: $DATA_DIR"

if [ -n "$SERVICO" ]; then
  echo "[backup] copiando do container '$SERVICO' ($DIR_CONTAINER) com docker compose cp"
  # Destino NÃO pode existir: `cp` de diretório para diretório já existente
  # criaria um nível a mais (dados/.data/) e o resto do script acharia vazio.
  if ! compose cp "$SERVICO:$DIR_CONTAINER" "$ESTAGIO/dados"; then
    echo "[backup] FALHOU ao copiar do container. Será que o serviço está de pé?" >&2
    echo "         (docker compose ps) Se o caminho interno mudou, ajuste LOLA_CONTAINER_DATA_DIR." >&2
    exit 1
  fi
else
  if [ ! -d "$DATA_DIR" ]; then
    echo "[backup] FALHOU: diretório de dados inexistente: $DATA_DIR" >&2
    exit 1
  fi
  cp -a "$DATA_DIR" "$ESTAGIO/dados"
fi

if [ ! -d "$ESTAGIO/dados" ]; then
  echo "[backup] FALHOU: a etapa anterior não deixou o diretório $ESTAGIO/dados." >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# 2. Verificação de existência — um backup silenciosamente incompleto é pior
#    que um backup que falha: ele dá confiança e não serve para restaurar.
# -----------------------------------------------------------------------------
ARQUIVO_PEDIDOS="$ESTAGIO/dados/orders.enc.json"
ARQUIVO_ESTOQUE="$ESTAGIO/dados/inventory.json"
ARQUIVO_CHAVE="$ESTAGIO/dados/orders.key"

if [ ! -f "$ARQUIVO_ESTOQUE" ]; then
  echo "[backup] FALHOU: inventory.json não encontrado em $DATA_DIR." >&2
  echo "         Diretório errado, ou o servidor nunca subiu nele." >&2
  exit 1
fi

TEM_PEDIDOS=1
if [ ! -f "$ARQUIVO_PEDIDOS" ]; then
  TEM_PEDIDOS=0
  echo "[backup] ATENÇÃO: orders.enc.json ainda não existe (nenhum pré-pedido gravado" >&2
  echo "         ou o servidor ainda não subiu). Segue só com o estoque." >&2
fi

if [ -f "$ARQUIVO_CHAVE" ]; then
  echo "[backup] ATENÇÃO: a chave AES está AO LADO do ciphertext ($ARQUIVO_CHAVE)." >&2
  echo "         Isso é o modo DESENVOLVIMENTO. Em produção a chave vem de fora" >&2
  echo "         (LOLA_ORDERS_ENCRYPTION_KEY / LOLA_ORDERS_KEY_FILE), este arquivo" >&2
  echo "         não deveria existir — e não deveria viajar dentro do backup." >&2
fi

# -----------------------------------------------------------------------------
# 3. Manifesto com SHA-256 — para conferir depois se o arquivo chegou inteiro
# -----------------------------------------------------------------------------
if command -v sha256sum >/dev/null 2>&1; then
  SHA256="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  SHA256="shasum -a 256"
else
  echo "[backup] FALHOU: nem sha256sum nem shasum disponíveis." >&2
  exit 1
fi

(
  cd "$ESTAGIO"
  echo "criado_em=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "origem=$DATA_DIR"
  echo "arquivos:"
  # nomes fixos (orders.enc.json, inventory.json, orders.key), sem espaços
  find dados -type f | LC_ALL=C sort | xargs $SHA256
) > "$ESTAGIO/MANIFEST.txt"

# -----------------------------------------------------------------------------
# 4. Teste de restauração OBRIGATÓRIO — no conteúdo que vai para o arquivo,
#    não no original. Não decifra => nada é gravado e o script sai 1. Melhor um
#    alarme às 04h30 do que descobrir a falha quando o disco morrer.
# -----------------------------------------------------------------------------
echo "[backup] testando restauração do conteúdo candidato..."

if [ -n "$SERVICO" ] && [ -z "${LOLA_ORDERS_ENCRYPTION_KEY:-}" ] && [ -z "${LOLA_ORDERS_KEY_FILE:-}" ]; then
  # No modo dividido a chave não está em `.data/` (nem deveria): ela vive no
  # ambiente do container. Lemos daí SEM passar por linha de comando — o valor
  # só existe em variável, nunca em `ps` nem no histórico.
  if CHAVE_DO_CONTAINER="$(compose exec -T "$SERVICO" printenv LOLA_ORDERS_ENCRYPTION_KEY 2>/dev/null)" \
      && [ -n "$CHAVE_DO_CONTAINER" ]; then
    export LOLA_ORDERS_ENCRYPTION_KEY="$CHAVE_DO_CONTAINER"
    echo "[backup] chave lida do ambiente do container '$SERVICO' (nem disco, nem linha de comando)."
  fi
fi

if [ "$TEM_PEDIDOS" = "1" ]; then
  if ! node "$SCRIPT_VERIFICACAO" --file "$ARQUIVO_PEDIDOS" --inventory "$ARQUIVO_ESTOQUE"; then
    echo "[backup] FALHOU: o conteúdo NÃO pôde ser decifrado/validado." >&2
    echo "         Nada foi gravado em $DESTINO." >&2
    echo "         Causas típicas: chave ausente/errada no ambiente, ciphertext" >&2
    echo "         corrompido, ou arquivo trocado no meio da cópia." >&2
    exit 1
  fi
else
  # Sem pedidos ainda: valida a estrutura do estoque com a mesma regra de
  # `InventoryStore` (total = reservado + vendido + disponivel, inteiros >= 0).
  if ! node "$SCRIPT_VERIFICACAO" --inventory-only --inventory "$ARQUIVO_ESTOQUE"; then
    echo "[backup] FALHOU: inventory.json inválido." >&2
    exit 1
  fi
fi

# -----------------------------------------------------------------------------
# 5. Arquivo final
# -----------------------------------------------------------------------------
STAMP="$(date -u +%Y%m%d-%H%M%S)"
ARQUIVO_SAIDA="$DESTINO/lola-$STAMP.tar.gz"

mkdir -p "$DESTINO"
chmod 700 "$DESTINO" 2>/dev/null || true

tar -czf "$ARQUIVO_SAIDA" -C "$ESTAGIO" dados MANIFEST.txt
chmod 600 "$ARQUIVO_SAIDA"

# Confere que o arquivo GRAVADO abre e contém o que deve.
if ! tar -tzf "$ARQUIVO_SAIDA" >/dev/null; then
  echo "[backup] FALHOU: o .tar.gz gravado está ilegível." >&2
  rm -f "$ARQUIVO_SAIDA"
  exit 1
fi

# -----------------------------------------------------------------------------
# 6. Rotação: mantém os $MANTEM mais recentes.
#    Observação de rotação DO DADO (não do backup): `orders.enc.json` tem teto
#    de 10.000 registros (EncryptedOrderStore.MAX_RECORDS) e o servidor avisa ao
#    chegar em 90%. Nesse momento o que se rotaciona é o arquivo de pedidos —
#    exporta os antigos, arquiva e zera — e não apenas o backup. Os dois planos
#    precisam existir.
# -----------------------------------------------------------------------------
REMOVIDOS=0
CONTADOR=0
while IFS= read -r ARQUIVO; do
  [ -n "$ARQUIVO" ] || continue
  CONTADOR=$((CONTADOR + 1))
  if [ "$CONTADOR" -gt "$MANTEM" ]; then
    rm -f -- "$ARQUIVO"
    echo "[backup] rotação: removido $ARQUIVO"
    REMOVIDOS=$((REMOVIDOS + 1))
  fi
done < <(ls -1t "$DESTINO"/lola-*.tar.gz 2>/dev/null || true)

TOTAL="$( { ls -1t "$DESTINO"/lola-*.tar.gz 2>/dev/null || true; } | wc -l | tr -d ' ')"

echo "[backup] OK: $ARQUIVO_SAIDA"
echo "[backup]      manifesto SHA-256 dentro do tar; restauração testada antes de gravar."
echo "[backup]      retenção: mantendo $MANTEM (agora $TOTAL no destino, removidos $REMOVIDOS)."
echo "[backup] Lembrete: leve $DESTINO para fora desta máquina e guarde a chave AES em local separado."
