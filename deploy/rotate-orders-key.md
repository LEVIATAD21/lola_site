# Rotação da chave AES dos pré-pedidos

> **Risco principal:** trocar a chave sem reescrever o arquivo deixa todos os
> pedidos já gravados ilegíveis. O servidor não destrói nada (a tag GCM não
> confere, `EncryptedOrderStore` falha fechado), mas também não lê mais nada —
> os dados continuam lá, cifrados com uma chave que ninguém tem.
>
> **Regra de ouro:** só troque a chave reescrevendo o ciphertext, e só troque o
> ciphertext depois de provar que a chave nova lê o que a antiga lia.

## Quando rodar

- Vazamento suspeito da chave (`.env` comprometido, cofre exposto, funcionário
  que saiu da empresa).
- Política de rotação periódica (anual já é generoso para uma loja pequena —
  cada rotação exige backup e janela de parada).
- Suspeita de que o arquivo de pedidos foi copiado junto com a chave.

## Pré-requisitos (nesta ordem — nenhuma é opcional)

1. **Pare o servidor de dados.** Com o processo ligado, ele mantém os registros
   em memória e regrava `orders.enc.json` a cada novo pré-pedido: um pedido que
   chegue entre a leitura e a troca seria perdido.
   ```bash
   docker compose stop data-server      # modo dividido
   systemctl stop lola-embedded         # modo embutido (serviço do systemd)
   ```
   O próprio script detecta isso (confere `mtime`/tamanho antes da troca) e
   recusa se o arquivo mudar, mas a parada é a forma correta.
2. **Backup.** `./deploy/backup.sh` — obrigatório e com teste de restauração
   dentro dele. Sem este backup não há plano B.
3. **Nova chave nova, gerada no servidor, sem histórico:**
   ```bash
   openssl rand -hex 32 > /root/chaves/chave-$(date +%Y%m%d).hex
   chmod 600 /root/chaves/chave-$(date +%Y%m%d).hex
   ```
4. Guarde as duas chaves (antiga e nova) no cofre **antes** de continuar: sem a
   antiga, os backups anteriores a esta rotação ficam ilegíveis.

## O roteiro

```bash
cd /opt/lola            # repositório na máquina

# 1) chaves em variáveis (NUNCA na linha de comando: some com `ps` e histórico)
export LOLA_ORDERS_OLD_KEY="$(cat /root/chaves/chave-antiga.hex)"
export LOLA_ORDERS_NEW_KEY="$(cat /root/chaves/chave-$(date +%Y%m%d).hex)"

# 2) prova seca: decifra com a antiga, reescreve num temporário, lê de volta,
#    e DESCARTA. Não toca em orders.enc.json.
npx tsx deploy/rotate-orders-key.ts --dry-run

# 3) aplicando
npx tsx deploy/rotate-orders-key.ts

# 4) a chave antiga sai do ambiente (só a nova fica)
unset LOLA_ORDERS_OLD_KEY
```

No modo **dividido com Docker**, o `deploy/` já está dentro da imagem e o
caminho de dados é `/app/.data`. A chave antiga está no ambiente do container
(`.env.dados`), então só a NOVA precisa ser apontada — e ela vai para `/tmp`
(tmpfs), não para `.data/`, para não virar item do próximo backup:

```bash
# entrega a chave nova ao container por STDIN (nunca como argumento de comando)
docker compose exec -T data-server sh -c \
  'read -r NOVA; printf "%s" "$NOVA" > /tmp/.nova.key; chmod 600 /tmp/.nova.key' \
  < /root/chaves/chave-nova.hex

docker compose exec -T data-server \
  node --import tsx deploy/rotate-orders-key.ts --new-key-file /tmp/.nova.key --dry-run

docker compose exec -T data-server \
  node --import tsx deploy/rotate-orders-key.ts --new-key-file /tmp/.nova.key

docker compose exec -T data-server rm -f /tmp/.nova.key
```

No modo **embutido**, tudo no host (com `node_modules` instalado):

```bash
export LOLA_ORDERS_OLD_KEY="$(cat /root/chaves/chave-antiga.hex)"
export LOLA_ORDERS_NEW_KEY="$(cat /root/chaves/chave-nova.hex)"
npx tsx deploy/rotate-orders-key.ts --dry-run
npx tsx deploy/rotate-orders-key.ts
unset LOLA_ORDERS_OLD_KEY
```

## O que o script faz (e o que ele recusa)

| Etapa | O que acontece | Se falhar |
|---|---|---|
| 1 | Decifra com a chave **antiga** | Aborta. **Nada é alterado.** Ciphertext ilegível nunca é sobrescrito. |
| 2 | Reescreve num `.tmp` com a chave **nova** (formato `version: 2` + AAD) | Apaga o `.tmp`, aborta. Original intacto. |
| 3 | Reabre o `.tmp` com a chave nova e confere contagem + igualdade profunda do conteúdo | Apaga o `.tmp`, aborta. Original intacto. |
| 4 | Confere que `orders.enc.json` não mudou (`mtime` + tamanho) | Aborta: havia servidor rodando. |
| 5 | `rename` atômico `.tmp` → `orders.enc.json`, modo `0600` | — |
| 6 | Reabre o arquivo **final** com a chave nova | Diz para restaurar o backup e voltar à chave antiga. |

Recusas adicionais: chave nova igual à antiga; chave fora do formato de 64 hex;
arquivo inexistente (sai 0, sem erro); envelope com versão desconhecida.

Só a **pegada** das chaves é impressa (8 hex do SHA-256 de cada uma) — dá para
conferir *qual* chave foi usada sem o segredo aparecer no log.

## Depois de aplicar

1. Atualize a chave no ambiente do servidor de dados
   (`.env.dados` no modo dividido, `.env` no modo embutido) e reinicie:
   ```bash
   docker compose up -d data-server     # modo dividido
   ```
2. Confira no log: `dados.servidor_iniciado ... pedidosCifrados=ativo`.
   Se aparecer `pedidosCifrados=desativado` + `pedidos.desativado`, a chave nova
   não chegou ao processo — a rotação em si deu certo, a configuração não.
3. Rode um teste ponta a ponta: `GET /api/health`, consulte
   `GET /api/admin/pre-pedidos` e confira que os pedidos ANTIGOS aparecem.
4. **Backup novo** já com a chave nova: `./deploy/backup.sh`.
5. Mantenha a chave antiga no cofre **enquanto existir qualquer backup feito
   com ela**. Pode apagar a antiga quando o backup mais antigo restante já for
   pós-rotação.

## Rollback

Se a etapa 6 falhar (ou o teste ponta a ponta falhar):

```bash
docker compose stop data-server
# restaure o backup feito no pré-requisito 2
tar -xzf /var/backups/lola/lola-AAAA-MM-DD-HHMMSS.tar.gz -C /tmp/rollback
cp /tmp/rollback/dados/orders.enc.json /app/.data/      # ou o LOLA_DATA_DIR
# volte LOLA_ORDERS_ENCRYPTION_KEY para a chave ANTIGA no ambiente
docker compose up -d data-server
```

O arquivo cifrado é idêntico ao de antes da rotação — a troca foi atômica, ou
o arquivo original foi preservado, ou o rollback é um `cp` simples.

## Perguntas que sempre aparecem

**Por que não dá para usar `openssl enc` para conferir?**
Porque os pedidos não são `openssl enc`: são AES-256-GCM com IV de 12 bytes,
tag de autenticação de 16 bytes e AAD (`lola-orders|orders.enc.json`). O
`openssl enc -d` não conhece o envelope nem o AAD, e a tentativa falharia
mesmo com a chave certa. Quem confere é o mesmo código da aplicação
(`deploy/verify-orders-restore.mjs` e `decifrar()` deste script).

**Posso trocar só o `LOLA_ORDERS_KEY_FILE` e manter o mesmo conteúdo?**
Sim — copiar a mesma chave de um arquivo para outro não é rotação, e nenhum
reescritório é necessário. Rotação é mudar o VALOR.

**E o `LOLA_ADMIN_API_KEY`?**
Outra chave, outro procedimento: não cifra nada (só autentica o painel), então
basta trocar o valor no ambiente e reiniciar. Faça isso em separado para não
misturar os dois diagnósticos se algo der errado.
