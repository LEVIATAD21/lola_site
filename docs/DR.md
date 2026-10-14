# DR — plano de recuperação da LOLA Tech

> ## ⚠️ Backup que você não restaurou não é backup.
>
> Todo número desta página é condicionado a uma coisa: `./deploy/drill-restore.sh`
> passar. Drill vermelho = **RPO e RTO desconhecidos**, não "provavelmente
> funciona".

---

## 1. O que se recupera (e o que não)

| Arquivo | Conteúdo | PII | Vem no backup |
|---|---|---|---|
| `.data/orders.enc.json` | pré-pedidos cifrados (AES-256-GCM + AAD, envelope v2) | sim — nome, telefone, endereço, itens | **sim** |
| `.data/inventory.json` | estoque (`total = reservado + vendido + disponivel`) | não | **sim** |
| chave AES dos pedidos | 64 hex (32 bytes) | — | **NÃO — de propósito** (§5) |

Sem a chave, `orders.enc.json` é bytes aleatórios: AES de 256 bits não tem
"força bruta" viável nem porta dos fundos. Recuperar o ciphertext sem a chave é
**perda total**, e é por isso que a chave é tratada como um item de
recuperação mais sensível que os próprios arquivos (§5).

---

## 2. RPO e RTO — com a conta

### RPO (Recovery Point Objective) = **24 horas**

É a perda máxima de dados que a loja aceita. A conta:

- Os pedidos moram num **arquivo local** (`orders.enc.json`), não num banco com
  replicação. O que não está no arquivo na hora da falha, não existe.
- O `deploy/backup.sh` roda **uma vez por dia** (cron 04:30, ver §6). Entre duas
  execuções existe uma janela de até 24 h.
- Pior caso: o disco morre às **04:29** → o artefato mais recente é o das 04:30
  do dia anterior → perdem-se **23 h 59 min** de pré-pedidos. Morre às 04:31 →
  perde-se 1 min. Média do dia todo: ~12 h.
- Na prática a loja recebe poucos pré-pedidos por dia, então a perda *esperada*
  é bem menor que 24 h — mas o número que se promete é sempre o pior caso.
- **Condição para o RPO valer contra perda da máquina inteira:** a cópia em
  `$HOME/lola-backups` precisa sair do host logo após o backup (rclone/rsync
  para nuvem). Sem essa cópia, RPO = 24 h só cobre apagamento/acidente lógico no
  próprio host; se o disco morre junto com o backup, o RPO vira ∞.
- Para reduzir: mude o cron para horário (`30 * * * *`) e o RPO cai para **1 h**
  com custo de disco quase nulo (o artefato de referência do drill tem
  **3.871 bytes**; mesmo no teto de 10.000 registros são dezenas de MB).
  Baseline mantido: **diário, RPO 24 h**.

### RTO (Recovery Time Objective) = **1 hora**

É o tempo entre a falha e a loja voltando a aceitar pré-pedido. A conta, em duas
partes:

| Parte | Tempo | Fonte |
|---|---|---|
| Máquina (extrair, conferir SHA-256, decifrar, comparar) | **~2 s** | medido: o ciclo inteiro do drill levou **1,96 s** neste hardware |
| Humana (perceber, achar a chave, baixar a cópia remota, restaurar, reiniciar `data-server`, conferir) | 15–30 min | uma pessoa com este runbook à mão **e** acesso ao cofre de segredos |
| Publicado (com folga para o primeiro evento) | **1 h** | ninguém restaura pela primeira vez num apagão |

- A parte mecânica não é o gargalo nem em cenário grande: 10.000 registros ≈
  dezenas de MB, o que extração + hash + decifração GCM resolve em segundos.
- **Pior caso honesto:** a chave só existe no cofre físico e ninguém com acesso
  está por perto → RTO **indeterminado**. É por isso que a chave precisa viver
  em dois lugares acessíveis (§5).
- **Condicionante:** RTO de 1 h é defensável somente enquanto o drill passar.

| Cenário | RPO | RTO |
|---|---|---|
| Disco cheio / arquivo de pedidos corrompido | 24 h | 1 h |
| Máquina perdida (com cópia remota do diretório de backups) | 24 h | 1 h |
| Máquina perdida (sem cópia remota) | ∞ | 1 h — **mas o backup morreu junto** |
| Chave perdida | 24 h | ∞ — ciphertext irrecuperável (§3.2) |

---

## 3. Playbooks — o que fazer quando

Ordem geral de qualquer incidente de restore:
**1)** não apague nada; **2)** identifique o artefato mais recente íntegro
(`sha256sum -c` no manifesto); **3)** só então mexa em chave ou arquivo.

### 3.1 Disco cheio

Sintomas: logs com `pedido.falha_ao_persistir` / `pedido.recusado_por_estoque`,
`df -h` no limite, o servidor recusando escrita.

```bash
df -h                                    # onde está o monstro
du -sh "${LOLA_DATA_DIR:-/opt/lola/.data}"   # .data/
ls -lh ~/lola-backups                    # artefatos
```

O que fazer, **nesta ordem**:

1. **Rote de saída (nunca o contrário):**
   - Rotação do *dado*: `orders.enc.json` tem teto de **10.000 registros**
     (`EncryptedOrderStore.MAX_RECORDS`) e o servidor avisa aos 90%. O plano de
     rotação do arquivo de pedidos (exportar os antigos, arquivar, zerar) está em
     `deploy/rotate-orders-key.md`.
   - Rotação do *backup*: `LOLA_BACKUP_KEEP` (padrão **14**). `backup.sh` já
     apaga o mais velho automaticamente.
   - Retenção LGPD: pré-pedidos expiram em **90 dias** (`LOLA_ORDER_RETENTION_DAYS`)
     e a purga roda sozinha na subida e de hora em hora.
2. **Só depois** de `sha256sum -c` passar num backup, apague artefato antigo.
3. **Nunca** apague `orders.enc.json` ou `inventory.json` para "fazer espaço"
   antes de ter um backup verificado deste mesmo conteúdo.

### 3.2 Chave perdida

Sintomas: log `Falha ao decifrar orders.enc.json`, rota de pré-pedido 503
(fail-closed — decisão registrada em `DECISIONS.md`: nunca degradar).

```bash
# Onde procurar, nesta ordem:
printenv LOLA_ORDERS_ENCRYPTION_KEY          # ambiente do processo (modo dividido)
printenv LOLA_ORDERS_KEY_FILE && cat "$LOLA_ORDERS_KEY_FILE"
# cofre de senhas do provedor, cópia em papel no cofre físico,
# e o .env.dados do host (deploy/env.producao.dados.example)
```

- **Nunca gere uma chave nova "para destravar".** Chave nova + arquivo antigo =
  exatamente o cenário da §3.4: o servidor sobe indisponível para pedidos e
  nada se recupera.
- Se a chave certa **não existir em lugar nenhum**: perda total dos pedidos
  cifrados. O estoque (`inventory.json`) não depende de chave e continua válido.
  Apague o par, registre o incidente e ajuste a expectativa de retenção.
- Prevenção (é o que transforma RTO de ∞ em 1 h): chave em **dois** lugares
  acessíveis — cofre de senhas + papel em cofre físico — e teste mensal de
  restauração (§6).

### 3.3 Ciphertext corrompido (disco, cópia interrompida, bit flip)

Sintomas: `sha256sum -c` falha no manifesto, ou o `verify` responde
`a tag GCM não confere`.

```bash
sha256sum -c manifesto.sha256                          # integridade do artefato
node deploy/verify-orders-restore.mjs --file orders.enc.json [--key-file ...]
```

- **A mensagem GCM não distingue "arquivo alterado" de "chave errada"** —
  primeiro confira a integridade (manifesto), depois a chave. É a sequência que
  evita trocar a chave sem motivo (e com isso criar um §3.4).
- Não tente "consertar" o arquivo: restaure o artefato mais recente cujo
  manifesto passe. Se todos locais falharem, busque a cópia remota (§6).
- Confirme depois com `./deploy/drill-restore.sh` ou, no mínimo,
  `node deploy/verify-orders-restore.mjs` sobre o restaurado.

### 3.4 `orders.key` não casa com `orders.enc.json` — **já aconteceu aqui**

O que se sabe: o checkout travou porque o par gravado em `.data/` não
decifrava. **Nada foi apagado**; o par está preservado em
`~/backups/lola-pedidos-ilegiveis-20261013-203712/`
(`orders.enc.json`, `orders.key` e as cópias `*.movido`).

Verificação reproduzível (executada em 14/10/2026):

```console
$ node deploy/verify-orders-restore.mjs \
    --file ~/backups/lola-pedidos-ilegiveis-20261013-203712/orders.enc.json
[restauração] FALHOU: a tag GCM não confere: a chave está errada OU o arquivo
foi alterado. Detalhe: Unsupported state or unable to authenticate data
(exit 1)
```

Causa provável: a chave vigente foi trocada (outro ambiente, outro `.data`,
rotação feita sem regravar) e o arquivo antigo ficou como estava — a aplicação
só descobre na hora de decifrar e, por decisão, responde 503 em vez de inventar
pedidos vazios.

Passo a passo:

1. **Não apague** o par preservado. Enquanto existir chance de a chave antiga
   aparecer, ele é recuperável; sem a chave, é lixo cifrado que não custa nada
   guardar (a decisão de apagar é do dono — `BLOCKERS.md`, seção "Dado
   preservado").
2. Procure a chave **certa** (cofre, ambiente do container, cópia de ambiente):
   `LOLA_ORDERS_KEY_FILE=<chave> node deploy/verify-orders-restore.mjs --file <arquivo>`.
3. Se a chave certa aparecer e o `verify` passar → é ela. Reabra o arquivo com
   `LOLA_ORDERS_KEY_FILE` (arquivo 0600 **fora** de `LOLA_DATA_DIR`) ou com
   `LOLA_ORDERS_ENCRYPTION_KEY` no ambiente do `data-server` e reinicie.
4. Se só existe a chave errada → o par é ilegível: restaure um backup anterior
   de `orders.enc.json` que case com alguma chave disponível, ou aceite a perda
   dos pedidos daquele período e registre.
5. Nunca troque a chave de produção "por cima": use `deploy/rotate-orders-key.md`
   (redegrava cada registro com a chave nova e falha alto se algum não
   sobreviver). Arquivo não reescrito com a chave nova vira §3.4.

### 3.5 Máquina inteira perdida

```bash
git clone <repo> /opt/lola && cd /opt/lola && npm ci     # código
# baixar o .tar.gz mais recente da cópia remota para ~/lola-backups
tar -xzf ~/lola-backups/lola-AAAAMMDD-HHMMSS.tar.gz -C /tmp/restore
grep -E '^[0-9a-f]{64}  ' /tmp/restore/MANIFEST.txt > /tmp/restore/sha.txt
(cd /tmp/restore && sha256sum -c sha.txt)          # 1º: integridade
LOLA_ORDERS_KEY_FILE=/caminho/da/chave \
  node deploy/verify-orders-restore.mjs --file /tmp/restore/dados/orders.enc.json \
  --inventory /tmp/restore/dados/inventory.json           # 2º: leitura
cp /tmp/restore/dados/* "$LOLA_DATA_DIR"/                 # 3º: só agora gravar
docker compose --profile dividido up -d --build
```

A ordem **integridade → leitura → gravação** é o que impede piorar um incidente
com um artefato ruim.

---

## 4. Restore passo a passo (resumo executivo)

```bash
cd /opt/lola
./deploy/drill-restore.sh                        # prova antes de precisar
# ...incidente...
tar -xzf <artefato> -C /tmp/restore
grep -E '^[0-9a-f]{64}  ' /tmp/restore/MANIFEST.txt > /tmp/restore/sha.txt
(cd /tmp/restore && sha256sum -c sha.txt)        # o AVISO de linha fora do
                                                 # formato é esperado: o
                                                 # manifesto tem cabeçalho
node deploy/verify-orders-restore.mjs --file /tmp/restore/dados/orders.enc.json \
  --inventory /tmp/restore/dados/inventory.json   # com a chave no ambiente/cofre
cp /tmp/restore/dados/* "$LOLA_DATA_DIR"/
# reiniciar data-server e conferir o health + uma leitura de pedido no painel
```

---

## 5. Por que o backup **não** inclui a chave AES — e onde ela deve viver

**De propósito.** Se a chave viajasse dentro do `.tar.gz`:

- quem tem o backup tem os clientes: cifra que carrega a própria chave não
  protege nada;
- o destino do backup (nuvem, HD externo, `rsync` de terça) passa a ser o cofre
  de segredos — e normalmente é o elo **mais fraco** da cadeia;
- a separação de domínios morre: o objetivo é que quem furar o destino de
  arquivo **não** consiga ler PII, e quem tenha a chave **não** tenha
  necessariamente os arquivos.

Como ficou definido: quem tem só o `.data/` (ou o backup dele) **não tem
clientes**; quem tem backup **+** chave tem tudo. Por isso o backup da chave é
separado e mais sensível que o dos dados.

Onde a chave deve viver (produção):

1. `LOLA_ORDERS_ENCRYPTION_KEY` (64 hex) no **ambiente do `data-server`** — no
   modo dividido isso está em `deploy/env.producao.dados.example`, nunca no
   `.env` comum da vitrine;
2. ou `LOLA_ORDERS_KEY_FILE` apontando para um arquivo **0600 fora de
   `LOLA_DATA_DIR`** (o `EncryptedOrderStore` recusa em produção permissão com
   grupo/outros);
3. e as duas cópias de recuperação: **cofre de senhas do provedor** + **papel em
   cofre físico**.

Em desenvolvimento a aplicação cria `orders.key` ao lado do ciphertext. É
conveniência de dev, e `backup.sh` avisa toda vez que encontra esse arquivo:
em produção ele **não deveria existir** — se existir, uma cópia de `.data/`
entrega cifra e chave juntas.

Observação operacional: quem roda o backup (e o drill) precisa da chave **no
ambiente** para o teste de restauração; `backup.sh` recusa gravar o que não
conseguiu ler. Um backup sem teste de leitura é só um arquivo ocupando disco.

---

## 6. Frequência e comandos agendáveis

| Tarefa | Frequência | Comando |
|---|---|---|
| Backup + teste de restauração automático | **diário, 04:30** | `deploy/backup.sh` |
| Cópia do diretório de backups para FORA da máquina | diário, logo após | `rclone sync` / `rsync` |
| **Drill de recuperação** (`deploy/drill-restore.sh`) | **semanal** (e antes de manutenção) | ver cron abaixo |
| Rotação da chave AES | anual, ou aos 80% de 10.000 registros | `deploy/rotate-orders-key.md` |

```cron
# /etc/crontab ou `crontab -e` — segredos ficam em arquivo 0600, nunca na linha
30 4 * * *  . /etc/lola/segredos.sh; cd /opt/lola && ./deploy/backup.sh >> $HOME/lola-backups/backup.log 2>&1
40 4 * * *  /usr/bin/rclone sync $HOME/lola-backups nuvem:lola-backups --log-file=$HOME/lola-backups/rclone.log
10 5 * * 1  . /etc/lola/segredos.sh; cd /opt/lola && ./deploy/drill-restore.sh >> $HOME/lola-backups/drill.log 2>&1
```

- `. /etc/lola/segredos.sh` exporta **só** a chave AES (arquivo 0600). Nunca
  escreva a chave na linha de comando: ela aparece em `ps` e no histórico.
- O drill precisa continuar **dentro do repositório** (ele carrega `src/` pela
  raiz calculada a partir do próprio caminho): não o copie para `/usr/local/bin`.
- O que se espera no log: `DRILL OK`. **A ausência do `DRILL OK` é o alerta** —
  um drill que parou de rodar silenciosamente é tão ruim quanto nenhum.
- Confira também `backup.log`: o `backup.sh` só grava `.tar.gz` depois de
  decifrar o conteúdo candidato; erro ali = nenhum backup novo, e o log é a
  única pista.
- Antes do lançamento: `deploy/CHECKLIST.md`, seção 5.

---

## 7. A prova: `deploy/drill-restore.sh`

O drill executa o ciclo inteiro em diretório temporário e **falha alto** se
qualquer passo não fechar:

1. cria diretório temporário de dados (nunca o `.data/` real);
2. gera chave + pedidos cifrados **com o código da aplicação**
   (`createLocalDataPlane` / `EncryptedOrderStore` — AES-256-GCM + AAD);
3. roda o `deploy/backup.sh` de verdade;
4. restaura do `.tar.gz` e confere o manifesto SHA-256;
5. decifra e compara **campo a campo** com o original;
6. simula perda da chave: recusa com exit 1 — e a mesma cópia, com a chave vinda
   de **fora** do backup, restaura;
7. simula chave que não casa (é o caso da §3.4) e ciphertext adulterado: recusa
   os dois;
8. limpa tudo, inclusive em erro.

Registro da execução de 14/10/2026: **exit 0 em 1,96 s**, 8/8 passos, 10
conferências `ok`, 3 pedidos comparados em 109 valores, artefato de 3.871 bytes;
falha induzida (sha256sum sabotado) → **exit 1** com limpeza no mesmo exit.

---

## 8. O que depende de outras pessoas

- **Cofre de segredos + papel no cofre físico** (dono da loja): sem as duas
  cópias da chave, o RTO da §2 não passa de teoria.
- **`rclone`/`rsync` para destino fora da máquina** (dono/infra): sem isso,
  RPO de 24 h vira ∞ quando o disco morre junto com o backup.
- **Agendar o cron do drill** (infra) e confirmar `DRILL OK` semanal.
