# RUNBOOK N1 — atendimento de primeira linha

> **Para quem usa este documento:** a pessoa que atende o suporte da LOLA e **não
> programa**. Você está com o cliente na linha. Este runbook diz, em ordem, o que
> ouvir, o que conferir, o que fazer e quando parar.
>
> **Estrutura de cada cenário:** (a) o que o cliente descreve → (b) o comando que
> você roda → (c) a ação de primeira linha → (d) quando escalar.
>
> **Nada aqui é para "entender o sistema"** — é para resolver ou encaminhar em
> menos de cinco minutos.

---

## 0. Antes de qualquer chamado

### 0.1 Onde ficam as coisas

| Coisa | Onde |
|---|---|
| Código e servidor | `~/lola_site` |
| Dados da loja (estoque + pré-pedidos cifrados) | `~/lola_site/.data/` |
| Log da loja | terminal onde o servidor foi iniciado · `docker compose logs vitrine` · `docker compose logs data-server` |
| Log do backup | `~/lola-backups/backup.log` |
| Backups | `~/lola-backups/*.tar.gz` |
| Pedidos antigos que não decifram | `~/backups/lola-pedidos-ilegiveis-20261013-203712/` |
| Bloqueios que só o dono resolve | `lola_coord/BLOCKERS.md` |
| Configuração (chaves, portas, limites) | `.env` na raiz do projeto · em produção `/srv/lola/.env` e `/srv/lola/.env.dados` |

> Em desenvolvimento local o `.env` pode nem existir — nesse caso os valores são
> os padrões do sistema e os comandos que leem `.env` abaixo não acham nada.
> **Isso é normal e não é incidente.** Em produção, use o caminho real do arquivo.

**Neste runbook, `LOG` significa o arquivo/terminal de log da loja.** Escolha o
que existe na sua máquina:

```bash
docker compose logs --tail 200 vitrine        # roda em Docker
docker compose logs --tail 200 data-server    # modo dividido
tail -n 200 /var/log/lola-vitrine.log          # redirecionado para arquivo
```

### 0.2 Os quatro comandos que você roda em TODO chamado

Rode nesta ordem. Eles respondem "a loja está viva?" em 10 segundos.

```bash
# 1. A vitrine responde?
curl -s -o /dev/null -w 'vitrine=%{http_code} em %{time_total}s\n' http://localhost:3000/api/health

# 2. O servidor de dados responde? (só no modo dividido; some no modo embutido)
curl -s -o /dev/null -w 'dados=%{http_code} em %{time_total}s\n' http://localhost:4100/api/health

# 3. Os processos estão de pé?
pgrep -af 'tsx server.ts'
pgrep -af 'tsx data-server.ts'

# 4. O que o sistema está dizendo AGORA
grep -E 'ERROR|WARN|falha' LOG | tail -30
```

Saída esperada quando tudo está bem:

```
vitrine=200 em 0.008s
dados=200 em 0.006s
12345 tsx server.ts
12346 tsx data-server.ts
```

### 0.3 O que você NUNCA faz (N1)

1. **Nunca apaga, renomeia ou sobrescreve nada em `.data/`.**
2. **Nunca gera, troca ou cola chave nenhuma** (chave AES, chave administrativa,
   chave TLS, `GEMINI_API_KEY`). Você só verifica se ela existe — pelo **tamanho**.
3. **Nunca imprime o valor de um segredo** na tela nem manda por mensagem.
4. **Nunca roda a suíte de testes** (`npm test`). Não é sua e sobrecarrega a máquina.
5. **Nunca pede dado pessoal completo do cliente por mensagem** (ver Regra de ouro).
6. **Nunca promete prazo** que você não controla.

---

## 1. Checkout devolve 503

**Mensagem exata que o cliente vê:**

> `O registro de pré-pedidos está temporariamente indisponível. Tente novamente mais tarde ou fale com o atendimento.`

### (a) O que o cliente descreve

- "Tentei comprar e deu erro no final."
- "Apareceu uma janela falando **Pré-pedido não registrado**."
- "O site abre, os produtos carregam, mas **só o envio do pedido falha**."

Esse último detalhe é o mais importante: **se o catálogo carrega e só o pedido
falha, o problema é a metade que grava pedido, não a loja inteira.**

### (b) O que você verifica

```bash
# 1. As duas metades estão vivas?
curl -s -o /dev/null -w 'vitrine=%{http_code}\n' http://localhost:3000/api/health
curl -s -o /dev/null -w 'dados=%{http_code}\n'    http://localhost:4100/api/health

# 2. Qual motivo apareceu no log?
grep -E 'pedidos.desativado|plano.pedido_falhou|interno.pedido_falhou|pedido.falha_ao_persistir|dados.falha_ao_iniciar' LOG | tail -10
```

Como interpretar:

| Log mostra | Significa | Vá para |
|---|---|---|
| `dados=` não responde (ou processo sumiu) | o servidor de dados caiu | ação A abaixo |
| `pedidos.desativado motivo=Não foi possível decifrar...` | a chave não abre o arquivo de pedidos | **cenário 6** |
| `pedidos.desativado motivo=...` com outro texto | faltou chave/segredo na configuração | escalar |
| `plano.pedido_falhou status=... motivo=...` | a vitrine não conseguiu falar com o vizinho | escalar |
| `interno.requisicao_rejeitada` | o canal assinado entre as duas metades recusou | escalar |
| `pedido.falha_ao_persistir` | o disco/escreva falhou | escalar |
| Nada disso aparece, mas o cliente insiste | pode ser sessão/conexão dele | ação B |

### (c) Ação de primeira linha

**Ação A — o servidor de dados caiu: reinicie na ordem certa.**

A ordem importa: **primeiro o servidor de dados, depois a vitrine.** Vitrine nova
contra servidor de dados antigo derruba o canal e o 503 continua.

```bash
# Com Docker
docker compose up -d data-server
sleep 3
docker compose ps
curl -s -o /dev/null -w 'dados=%{http_code}\n' http://localhost:4100/api/health

# Sem Docker: no terminal 1
npm run start:data
# Depois, no terminal 2
npm start
```

Confirme que os dois `health` responderam `200` antes de falar com o cliente.

**Ação B — tudo responde, o cliente não consegue:** peça para ele **recarregar a
página e tentar uma vez mais**. Se persistir, colete: horário exato do erro,
produto e navegador. Não peça os dados dele de novo.

### (d) Quando escalar para engenharia (N2)

- Os dois `health` continuam respondendo `200`, mas o pedido continua em 503.
- Apareceu `interno.requisicao_rejeitada`, `plano.pedido_falhou` ou
  `pedido.falha_ao_persistir`.
- Você reiniciou na ordem certa e em 5 minutos não voltou.
- Apareceu `pedidos.desativado` → **mão para o teclado e vá direto ao cenário 6.**

**O que enviar para N2:** horário exato, saída dos dois `health`, e as 10 linhas
de `LOG` que você pegou no passo 2. Nada mais.

---

## 2. `/api/pedidos/rascunho` devolve 429 (limite temporário)

**Mensagem exata que o cliente vê:**

> `Limite temporário de pré-pedidos atingido. Tente novamente em um minuto.`

### (a) O que o cliente descreve

- "Tentei enviar e falou que atingi um limite."
- "Deu erro, esperei e deu de novo."
- **Vários clientes ao mesmo tempo** com a mesma reclamação — este é o sinal
  vermelho (ver abaixo).

### (b) O que você verifica

```bash
# 1. É UM cliente ou TODO MUNDO?
grep 'status=429' LOG | tail -20

# 2. A resposta traz quanto tempo falta (Retry-After, em segundos)
curl -s -D - -o /dev/null -X POST http://localhost:3000/api/pedidos/rascunho \
  -H 'Content-Type: application/json' -d '{}' | grep -i retry-after
```

Como interpretar:

| O que aparece | Significado |
|---|---|
| Poucas linhas `status=429`, de um mesmo IP | **normal** — aquele cliente mandou 10 pedidos em 1 minuto |
| Muitos IPs diferentes em `status=429` ao mesmo tempo | **anormal** — quase sempre é o IP real do cliente não estar sendo reconhecido (todos caem no mesmo balde) |
| `Limite temporário de consultas...` | é outro limite (leitura/assistente), não o de pedido |
| `Muitas requisições. Aguarde um minuto...` | orçamento geral da API, 600/min por IP |

O teto de pedido é **10 por minuto por IP** de propósito: a rota grava dado
pessoal cifrado e segura estoque. Ele não é um defeito e **não se sobe por conta
própria**.

### (c) Ação de primeiro linha

1. **Explique ao cliente que é uma proteção temporária e que ele espera 1 minuto
   e volta.** Não é bloqueio da conta dele, não é erro do cartão, não é recusa.
2. Se só ele foi atingido: **resolvido** — ele tenta em 60 segundos.
3. Se `Retry-After` vier no cabeçalho, diga o número de segundos exatos.

### (d) Quando escalar

- **Muitos clientes diferentes** reportando limite no mesmo intervalo → N2.
  É o cenário clássico de IP do proxy não declarado: todo mundo divide o mesmo
  balde e o público legível se bloqueia sozinho.
- Recusa acontece **mesmo** depois de 5 minutos de espera → N2.
- Alguém pedir para "aumentar o limite" em produção → N2 decide; N1 não edita.

---

## 3. 409 — estoque insuficiente

**Mensagens exatas que o cliente vê:**

> `Estoque insuficiente para <Nome do produto>. Revise a quantidade na sacola.`

> `O estoque deste produto ainda não foi configurado.`

### (a) O que o cliente descreve

- "Quero levar 3 e só deixou comprar 1."
- "Diz que não tem estoque, mas a página mostra que tem."
- "Fala que o estoque do produto não foi configurado."

### (b) O que você verifica

```bash
# O estoque real daquele produto (substitua o id)
curl -s http://localhost:3000/api/estoque/brinco-1
# resposta: {"productId":"brinco-1","disponivel":2}

# O sistema registrou a recusa?
grep 'pedido.recusado_por_estoque' LOG | tail -10
```

Como interpretar:

| Resposta | Significado |
|---|---|
| `disponivel: 2` e o cliente pediu 3 | **o sistema está certo** — é o estoque dele |
| `disponivel: 0` | alguém reservou tudo; ver nota sobre reserva abaixo |
| `404` / "Produto não encontrado no catálogo" | o produto saiu do catálogo — cenário 4 |
| Resposta vazia ou 503 | a loja não sabe o estoque → **cenário 1** |

**Nota sobre reserva:** ao registrar um pedido, as unidades ficam **reservadas por
30 minutos** (`LOLA_RESERVATION_TTL_MS`, padrão 1.800.000 ms). Passado esse tempo,
o estoque volta sozinho. Ou seja: **um pedido abandonado segura peça por meia hora.**

### (c) Ação de primeira linha

1. Confirme no comando acima se é estoque de verdade ou reserva.
2. Se é reserva: oriente o cliente a **tentar em até 30 minutos** — sem prometer
   que vai sobrar peça.
3. Se é estoque baixo de verdade: peça para **reduzir a quantidade** ao que
   `disponivel` mostra.
4. `Estoque deste produto ainda não foi configurado` → o produto está no catálogo
   mas sem número de estoque definido. Isso é **dado da loja**, não é erro do
   cliente: encaminhe para N2 e **não** diga ao cliente que "está quebrado".

### (d) Quando escalar

- O número de `disponivel` está **acima** do que existe fisicamente (vendeu mais
  do que tinha) — **prioridade alta**, é dinheiro e é reclamação de cliente.
- `O estoque deste produto ainda não foi configurado.` em produto que já deveria
  estar à venda → N2 (dado inicial do catálogo).
- Reserva que **não volta** após 30 minutos → N2.
- Vários produtos em `404` ao mesmo tempo → N2.

---

## 4. 400 — mensagem de validação (CEP, nome, endereço)

### (a) O que o cliente descreve

- "Não deixa eu continuar, fala para conferir meus dados."
- "Meu CEP está certo e ele fala que não é."
- "Foi recusado e não diz o que fazer."

**Os 400 vêm com uma frase já pronta. Peça a frase exata ao cliente** — ela é
suficiente para saber qual campo está errado. É a mensagem que aparece no modal
"Pré-pedido não registrado".

### (b) O que você verifica

```bash
# As recusas de validação aparecem no log
grep 'status=400' LOG | tail -20
```

**Tabela das mensagens e do que fazer:**

| Mensagem exata | O que está errado | O que orientar o cliente |
|---|---|---|
| `Preencha os dados de entrega.` | bloco de endereço vazio | preencher nome, rua, número, bairro, cidade |
| `Confira nome, logradouro, número e endereço antes de continuar.` | algum campo vazio ou curto demais | revisar campo a campo: nome (mín. 3 letras), rua (mín. 5), número, bairro, cidade |
| `Informe um telefone válido com DDD.` | telefone com menos de 10 ou mais de 11 dígitos | digitar DDD + número, com ou sem máscara |
| `Informe um CEP brasileiro válido com 8 dígitos.` | CEP fora da faixa real ou repetido (`00000000`, `11111111`) | digitar só os 8 números; se o CEP for real e falhar, anotar e escalar |
| `Selecione um estado brasileiro válido.` | UF vazia ou inexistente | escolher a UF na lista |
| `É necessário aceitar os termos para registrar a solicitação.` | caixinha dos termos desmarcada | marcar a caixa |
| `Os campos de endereço não podem conter caracteres de marcação (< ou >).` | `<` ou `>` digitados no endereço | apagar os símbolos |
| `Selecione uma forma de pré-pedido válida.` | forma de pagamento não escolhida | escolher Pix ou boleto |
| `Pagamento por cartão indisponível: a integração segura com o provedor ainda não foi configurada.` | cartão de crédito está desligado | escolher Pix ou boleto — **não é erro, é o estado atual** |
| `Modalidade de frete inválida.` | frete não escolhido | escolher o frete oferecido na tela |
| `O cupom informado não é válido.` / `Este cupom expirou.` / `Este cupom vale a partir de R$ X em produtos.` / `Este cupom já atingiu o limite de usos.` | cupom | retirar o cupom ou usar outro |
| `A solicitação deve conter de 1 a 30 linhas de produto.` | sacola vazia ou grande demais | ajustar a sacola |
| `A quantidade de cada item deve ser um inteiro entre 1 e 99.` | quantidade 0 ou acima de 99 | corrigir a quantidade |
| `Um dos produtos não existe no catálogo atual.` | item da sacola saiu do catálogo | recarregar a página e refazer a sacola |
| `Um dos itens da solicitação é inválido.` / `Uma das variações do produto é inválida.` | item malformado | recarregar a página; se persistir, escalar |
| `Dados do pré-pedido inválidos.` | o pedido chegou pela metade | recarregar e enviar de novo |
| `Opção de embalagem de presente inválida.` | opção de embrulho inválida | recarregar e reescolher |
| `Cupom inválido.` | cupom longo demais (mais de 40 caracteres) | digitar o código curto |

### (c) Ação de primeira linha

**O 400 é sempre do cliente e nunca é incidente.** Você lê a mensagem, compara
com a tabela acima e orienta o campo. Não precisa de engenharia.

### (d) Quando escalar

- A mensagem recebida **não está na tabela** → N2 (pode ser erro novo).
- CEP real e corretamente digitado é recusado (o sistema confere faixa, não a
  base dos Correios) → N2, anotando o CEP. **Não peça o endereço completo.**
- Erro de validação acontece **mesmo com o campo preenchido corretamente** → N2.
- Vários clientes com o mesmo 400 inesperado → N2.

---

## 5. 401 no painel administrativo — chave ausente × chave errada

**Mensagem exata, nos DOIS casos:**

> `Chave administrativa inválida ou operação não habilitada neste servidor.`

### ⚠️ Leia isto antes de concluir que é bug

**As duas situações respondem igual de propósito.** Se "chave errada" e
"chave não existir no servidor" dessem respostas diferentes, qualquer pessoa
fora da loja poderia descobrir se existe chave administrativa no servidor só
testando. A recusa idêntica **é a proteção funcionando**, não é defeito.

O diagnóstico real **nunca aparece na resposta** — ele fica no log. É por isso
que existe o passo 2 abaixo.

Tambem existe um limite: **10 tentativas por minuto por IP**. Se a mensagem do
limite aparecer, a resposta é:

> `Muitas tentativas administrativas. Aguarde um minuto e tente novamente.`

### (a) O que o cliente/dono descreve

- "Não entra no painel, diz chave inválida."
- "A chave que eu tenho não funciona mais."
- "Fiz isso umas vezes e agora deu outra mensagem."

### (b) O que você verifica

```bash
# 1. A chave EXISTE no servidor? (mostra só o TAMANHO — nunca o valor)
awk -F= '/^LOLA_ADMIN_API_KEY=/{print length($2)}' .env
#   0 ou nada  → a chave NÃO existe
#   1..31      → a chave existe mas é CURTA demais (precisa de 32+)
#   32+        → a chave existe

# 2. O servidor avisou na subida?
grep 'admin.desativado' LOG | tail -5
#   motivo=LOLA_ADMIN_API_KEY ausente  → confirmado: não existe
#   motivo=LOLA_ADMIN_API_KEY curta    → confirmado: existe, mas curta
#   (sem essa linha)                   → a chave está lá; o problema é a digitada

# 3. Tentativas registradas (a chave nunca aparece aqui)
grep 'admin.access' LOG | tail -10
#   outcome=denied reason=chave_ausente_ou_inválida      → chave errada (ou header faltando)
#   outcome=denied reason=origem fora de LOLA_ADMIN_ALLOWED_IPS → É A REDE, ver abaixo
#   outcome=not_configured                               → confirmado: não existe
#   outcome=allow                                        → funcionou
```

Como interpretar:

| Achado | Situação | Culpado |
|---|---|---|
| `length=0` **ou** `admin.desativado motivo=... ausente` | **chave ausente** | configuração |
| `length` entre 1 e 31 **ou** `motivo=... curta` | chave curta (mínimo 32) | configuração |
| `length≥32`, sem `admin.desativado`, e `outcome=denied` | **chave errada** | quem digitou/copiou |
| `403` com `Origem não autorizada para esta operação.` | **rede**, não chave | a máquina está fora da lista liberada |
| `Muitas tentativas administrativas` | bloqueou por excesso de tentativas | esperar 1 minuto |
| `404 Endpoint de API não encontrado.` na vitrine | **esperado no modo dividido** | não é erro: o painel mora só no servidor de dados |

### (c) Ação de primeira linha

1. **Se a chave não existe ou é curta:** você **não** gera chave. Encaminhe para
   N2 com a linha `admin.desativado`. O dono decide (`openssl rand -hex 32` é a
   forma de gerar — N2 faz isso, nunca por mensagem).
2. **Se a chave existe e a digitada não bate:** confirme se a cópia veio **sem
   espaço no início/fim** e se o cabeçalho usado é `x-admin-key`. Peça para
   **esperar 60 segundos** (limite de tentativas) e tentar uma vez só.
3. **Se é 403 de origem:** a chave está certa, a máquina é que está fora da
   lista. Isso se resolve entrando pela rede/túnel liberado — encaminhe, não
   tente contornar.
4. **Nunca mande a chave por mensagem, telefone ou e-mail.** Nem a sua, nem a do
   cliente.

### (d) Quando escalar

- Não foi possível localizar **nenhuma** das duas explicações no log.
- Mais de 3 tentativas seguidas sem sucesso.
- O dono pedir para **trocar** a chave (troca é N2 — a antiga precisa ser revogada).
- Qualquer vontade de "testar mais umas chaves" — **pare**. Cada tentativa fica
  registrada em log.

---

## 6. A chave de cifra não casa com `orders.enc.json`

> **Isto já aconteceu uma vez.** Os dados daquela vez **não foram apagados**: estão
> preservados em `~/backups/lola-pedidos-ilegiveis-20261013-203712/`.

### (a) O que o cliente/dono descreve

- **A loja inteira está no ar**, catálogo carrega, estoque aparece — e **só o
  checkout falha**, sempre com `O registro de pré-pedidos está temporariamente
  indisponível. Tente novamente mais tarde ou fale com o atendimento.`
- "Isso começou depois que mexeram em alguma configuração."

Esse desenho (tudo bem, menos o pedido) é a assinatura deste cenário.

### (b) O que você verifica

```bash
# 1. O motivo no log (é a frase que confirma o cenário)
grep 'pedidos.desativado' LOG | tail -5
# esperado:
#   motivo=Não foi possível decifrar o arquivo de pré-pedidos (.data/orders.enc.json).
#   Verifique LOLA_ORDERS_ENCRYPTION_KEY / LOLA_ORDERS_KEY_FILE ou restaure o backup
#   do arquivo. O arquivo não foi alterado.

# 2. Prova seca e SOMENTE LEITURA — a chave abre o arquivo?
cd ~/lola_site
node deploy/verify-orders-restore.mjs --file .data/orders.enc.json --inventory .data/inventory.json
```

Saídas possíveis do passo 2:

| Saída | Significado |
|---|---|
| `[restauração] OK: N pré-pedido(s) decifrado(s).` | a chave **casa** — este NÃO é o cenário 6; volte ao cenário 1 |
| `[restauração] FALHOU: a tag GCM não confere: a chave está errada OU o arquivo foi alterado.` | **é o cenário 6** |

Para conferir o par antigo (somente leitura, não altera nada):

```bash
node deploy/verify-orders-restore.mjs \
  --file ~/backups/lola-pedidos-ilegiveis-20261013-203712/orders.enc.json \
  --key-file ~/backups/lola-pedidos-ilegiveis-20261013-203712/orders.key
# resultado conhecido: FALHOU — a tag GCM não confere
```

### (c) Ação de primeira linha

**Mãos para o lado. Você não conserta isso.**

- O servidor **sobe normalmente** e o arquivo **não é alterado**. Nenhum dado foi
  perdido e nada foi corrompido pela falha.
- Enquanto durar, nenhum pedido novo é gravado — todos recebem o 503 e você
  orienta o cliente pelo cenário 1.
- **Não apague** `orders.enc.json`. **Não gere chave nova.** **Não "limpe" `.data/`.**
  Gerar chave nova faria o arquivo antigo ficar permanentemente ilegível.

**O que registre para N2:** a linha completa de `pedidos.desativado` e a saída do
`verify-orders-restore.mjs`.

### (d) Quando escalar

**Sempre.** 100% dos casos deste cenário vão para N2 (engenharia), porque envolve
chave e dado cifrado.

- Se a chave antiga aparecer em algum backup → N2 decifra o par guardado.
- **Apagar os dados preservados é decisão do dono** — está registrado em
  `BLOCKERS.md`, seção "Dado preservado (aguardando chave antiga)". N1 e N2 não
  decidem isso.

---

## 7. TLS do servidor de dados expira ou não sobe

### Regra que causa quase todos os problemas

> **`LOLA_TLS_CERT_FILE` e `LOLA_TLS_KEY_FILE` precisam existir juntos.**
> Um sem o outro → o servidor **não sobe**.

### (a) O que o dono/N2 descreve

- "O servidor de dados não liga, morre logo depois de iniciar."
- "O navegador avisa que o certificado expirou / não é confiável."
- "Depois de renovar o certificado, parou de subir."

### (b) O que você verifica

```bash
# 1. O motivo da queda (processo sai com erro e some)
grep -E 'dados.falha_ao_iniciar|dados.sem_tls_em_endereco_publico|dados.falha_configuracao' LOG | tail -5
```

**Mensagens exatas e o que cada uma quer dizer:**

| Mensagem no log | Significado |
|---|---|
| `LOLA_TLS_CERT_FILE e LOLA_TLS_KEY_FILE precisam ser configurados juntos: um sem o outro não sobe TLS.` | um dos dois está vazio — **não sobe** |
| `LOLA_TLS_CERT_FILE e LOLA_TLS_KEY_FILE não podem apontar para o mesmo arquivo.` | os dois apontam para o mesmo arquivo |
| `LOLA_TLS_CERT_FILE aponta para arquivo inexistente: <caminho>` | certificado não existe nesse caminho |
| `LOLA_TLS_KEY_FILE aponta para arquivo inexistente: <caminho>` | chave não existe nesse caminho |
| `dados.sem_tls_em_endereco_publico bind=... acao=configure LOLA_TLS_CERT_FILE e LOLA_TLS_KEY_FILE ou restrinja o bind a 127.0.0.1` | **sobe sem TLS** (aviso, não é queda) — mas os dados trafegariam em claro na rede |

```bash
# 2. Os dois estão preenchidos? (mostra 1 = tem, 0 = não tem; nunca o valor)
grep -cE '^LOLA_TLS_CERT_FILE=.+' .env.dados
grep -cE '^LOLA_TLS_KEY_FILE=.+' .env.dados

# 3. Os arquivos existem? (mostra só ok/ausente)
test -f /caminho/do/certificado.pem && echo ok || echo ausente
test -f /caminho/da/chave.pem       && echo ok || echo ausente

# 4. Quando o certificado vence?
openssl x509 -in /caminho/do/certificado.pem -enddate -noout

# 5. Vence nos próximos 15 dias? (1296000 segundos = 15 dias)
openssl x509 -in /caminho/do/certificado.pem -checkend 1296000 -noout \
  && echo "mais de 15 dias" || echo "VENCE EM MENOS DE 15 DIAS"
```

### (c) Ação de primeira linha

1. Anote **qual** das mensagens apareceu — é ela que diz a correção exata.
2. Se é "um sem o outro": N2 preenche **os dois** ou **apaga os dois**. Você não
   edita arquivo de configuração nem de segredo.
3. Se é "arquivo inexistente": N2 corrige o caminho.
4. Se o certificado **venceu em menos de 15 dias** (ou já venceu): N2 renova e
   reinicia. **Renovação de certificado é N2, sempre.**
5. Se apareceu o aviso `sem_tls_em_endereco_publico`: não é queda, mas é risco de
   dado pessoal em claro — **escalar hoje**.
6. Depois da correção, reinicie **primeiro o servidor de dados e depois a
   vitrine** e confirme os dois `health` em `200`.

### (d) Quando escalar

- **Sempre** que houver qualquer uma das quatro mensagens de erro — N1 só
  diagnostica e confirma a volta.
- Certificado expirado ou a vencer em menos de 15 dias → N2, **mesmo com a loja
  no ar** (vai cair no próximo acesso).
- `sem_tls_em_endereco_publico` → N2 + dono (é decisão de endereço de rede).

---

## 8. Backup falhou ou a restauração não decifra

### (a) O que o dono descreve

- "O backup de ontem não rodou / falhou."
- "Abri o log e tem um `FALHOU`."
- "Testei restaurar e não abre."

### (b) O que você verifica

```bash
# 1. O log do backup — leia as últimas linhas
tail -40 ~/lola-backups/backup.log

# 2. Só as falhas e avisos
grep -E 'FALHOU|ATENÇÃO' ~/lola-backups/backup.log | tail -20

# 3. Os arquivos existem e são recentes?
ls -lt ~/lola-backups/*.tar.gz | head -5
```

**Mensagens exatas:**

| Mensagem | É falha? | O que fazer |
|---|---|---|
| `[backup] FALHOU: inventory.json não encontrado em <dir>. Diretório errado, ou o servidor nunca subiu nele.` | **sim** | o caminho `LOLA_DATA_DIR` está errado ou o servidor nunca subiu → N2 |
| `[backup] FALHOU: o conteúdo NÃO pôde ser decifrado/validado. Nada foi gravado em <destino>. Causas típicas: chave ausente/errada no ambiente, ciphertext corrompido, ou arquivo trocado no meio da cópia.` | **sim, a mais grave** | **é o cenário 6**: a chave não abre o arquivo. Vá ao cenário 6 |
| `[backup] FALHOU: inventory.json inválido.` | **sim** | arquivo de estoque fora do formato esperado → N2 |
| `[backup] FALHOU: nem sha256sum nem shasum disponíveis.` | **sim** | faltou ferramenta na máquina → N2 |
| `[restauração] FALHOU: a tag GCM não confere: a chave está errada OU o arquivo foi alterado.` | **sim** | chave errada → cenário 6 |
| `[backup] ATENÇÃO: orders.enc.json ainda não existe (nenhum pré-pedido gravado ou o servidor ainda não subiu). Segue só com o estoque.` | **não** | comportamento normal em loja nova |
| `[backup] ATENÇÃO: a chave AES está AO LADO do ciphertext...` | **não, mas importante** | é o modo de desenvolvimento. Em produção a chave não deveria viajar dentro do backup → informar N2 |
| `ok=... itens=... bytes=...` (última linha) | **não** | **deu tudo certo** |

**Bom saber:** o backup **recusa gravar** o que não conseguiu ler. Ou seja: se
apareceu `FALHOU`, **não existe backup novo ruim** — só continua existindo o
último que era bom. Isso é de propósito: um backup que ninguém consegue abrir é
pior do que nenhum.

### (c) Ação de primeira linha

1. Anote **qual** mensagem `FALHOU` apareceu.
2. **Não apague nenhum `.tar.gz`.** Nada de "limpar espaço" durante um incidente.
3. Se o texto falar em decifrar/chave → **cenário 6**, escalar.
4. Se a última linha for `ok=...` → **o backup está saudável**; avise o dono.
5. Rode o teste de leitura de um backup **sem modificar nada** (somente leitura):

```bash
# extrai para uma pasta temporária e testa se decifra
T=$(mktemp -d)
tar -xzf ~/lola-backups/lola-MAIS_RECENTE.tar.gz -C "$T"
node ~/lola_site/deploy/verify-orders-restore.mjs \
  --file "$T/dados/orders.enc.json" --inventory "$T/dados/inventory.json"
# OK = restaurável | FALHOU = escalonar
rm -rf "$T"
```

### (d) Quando escalar

- **Qualquer** linha `FALHOU` → N2.
- Restauração não decifra → N2 + **dono** (a chave AES é guardada fora da máquina,
  no cofre do dono; ninguém da equipe tem).
- Backup **nunca rodou** (não há log nem `.tar.gz`) → dono + N2: backup agendado
  é prioridade de lançamento.
- Já passou de 1 dia sem backup → N2 hoje.

---

## 9. Chat do assistente parou

### (a) O que o cliente descreve

- "O assistente não responde."
- "Ele responde sempre a mesma coisa, genérica."
- Aparece: `No momento, o assistente virtual está indisponível para consulta em tempo real. Por favor, tente novamente mais tarde ou entre em contato pelo canal de atendimento.`

### ⚠️ Aviso importante antes de tratar como incidente

**Faltar `GEMINI_API_KEY` ou estar sem saldo NÃO derruba a loja.** Quando isso
acontece, o sistema cai no **motor local de regras** e continua respondendo — com
respostas mais genéricas, mas responde. O site, o carrinho e o pedido **não
dependem** do chat.

Ou seja: **resposta genérica não é pane**. É o modo de reserva funcionando.

Além disso, hoje existe uma **decisão pendente do dono** sobre manter ou desligar
o Gemini (`BLOCKERS.md`, item B3). Uma chave vazia pode ser, portanto, **estado
desejado**, não incidente.

### (b) O que você verifica

```bash
# 1. O modelo falhou alguma vez? (a chave da API NUNCA aparece aqui)
grep '\[assistente\]' LOG | tail -10
#   [assistente] Falha ao chamar o modelo: <motivo>

# 2. A chave existe? (só o TAMANHO, nunca o valor)
grep -cE '^GEMINI_API_KEY=.+' .env      # 1 = preenchida, 0 = vazia

# 3. Foi limite de uso?
grep 'status=429' LOG | grep -E 'ai|consulta' | tail -10
```

**Mensagens exatas de limite (429):**

| Mensagem | Significado |
|---|---|
| `Limite temporário de consultas atingido. Tente novamente em um minuto.` | 20 consultas/min por IP |
| `Limite horário de consultas atingido. Tente novamente mais tarde.` | 120 consultas/hora por IP |
| `Limite diário de consultas atingido. Fale com o atendimento se precisar de ajuda.` | 400 consultas/dia por IP |
| `Campo "pergunta" é obrigatório.` (400) | pergunta vazia — do cliente |
| `A pergunta deve ter no máximo 1200 caracteres.` (413) | pergunta longa demais — do cliente |

### (c) Ação de primeira linha

| Situação | O que fazer |
|---|---|
| Mensagem de indisponível, mas a loja funciona | oriente o cliente a falar pelo **canal de atendimento**; não é incidente |
| Resposta genérica, sem `[assistente]` no log | a chave está vazia — **comportamento previsto**; informe N2 e **não** ligue nada |
| `[assistente] Falha ao chamar o modelo: <motivo>` no log | a chave existe mas a chamada falhou (quase sempre **saldo/cota**) → N2 |
| `429` de minuto | cliente espera 1 minuto |
| `429` de hora | cliente espera até a hora virar; não force |
| `429` de dia | não há o que fazer hoje → escalar se for afetando muita gente |

### (d) Quando escalar

- `Falha ao chamar o modelo` aparece **repetidamente** → N2 (saldo/chave).
- Vários clientes sem conseguir usar o chat no mesmo período → N2.
- **Decisão de manter/desligar o Gemini é do dono** (`BLOCKERS.md`, B3) — não
  peça a N2 para "resolver sozinho".
- **Se o chat não é o único problema** — a loja também está lenta ou fora — vá
  direto ao **cenário 10** e trate isso primeiro.

---

## 10. Loja lenta ou fora do ar — primeiro diagnóstico

**Rode nesta ordem. Pare no primeiro sinal.**

### Passo 1 — ela responde?

```bash
curl -s -o /dev/null -w 'vitrine=%{http_code} em %{time_total}s\n' http://localhost:3000/api/health
curl -s -o /dev/null -w 'pagina=%{http_code} em %{time_total}s\n'  http://localhost:3000/
```

| Saída | Leitura |
|---|---|
| `vitrine=200` em menos de `1s` e `pagina=200` | a loja está viva — o problema é outro |
| `000` (conexão falhou) ou demora mais de `5s` | **fora do ar** → passo 2 |
| `500`/`503` | erro do servidor → passo 3 |

### Passo 2 — o processo existe?

```bash
pgrep -af 'tsx server.ts'
docker compose ps 2>/dev/null
```

- **Não existe** → reinicie na ordem: **servidor de dados primeiro, vitrine
depois** (comandos do cenário 1) e volte ao Passo 1.
- **Existe mas não responde** → passo 3.

### Passo 3 — o que o log diz

```bash
grep -E 'ERROR|WARN|falha' LOG | tail -30
grep -c 'status=500' LOG
grep -c 'status=429' LOG
grep 'http.logs_suppressed' LOG | tail -3
```

| O que aparece | Leitura |
|---|---|
| `dados.falha_ao_iniciar` | servidor de dados não subiu → **cenário 7** (TLS) ou falta de segredo |
| `pedidos.desativado` | → **cenário 6** |
| Muitos `status=500` | erro interno → escalar com as linhas do log |
| `http.logs_suppressed` | chegaram mais de 600 linhas por minuto: **estão inundando a loja** → escalar |
| Muitos `status=429` | limite de requisições batendo em massa → **cenário 2** |

### Passo 4 — a máquina aguenta?

```bash
uptime          # load average: os 3 números. Acima do número de núcleos = sobrecarregada
free -m         # linha "available": se perto de 0, falta memória
df -h /         # uso do disco: acima de 90% = problema
```

### Passo 5 — é só a loja ou tudo?

Abra **outro site qualquer** no mesmo computador.
- **Outro site abre** → o problema é da loja → escalar.
- **Nenhum site abre** → é a conexão/ provedor → não é incidente da loja; avise
e aguarde.

### (c) Ação de primeira linha

1. **Reinicie na ordem** (dados → vitrine) se o processo sumiu.
2. **Não reinicie em loop.** Se reiniciou duas vezes e não voltou, **pare** e
   escalone — reiniciar às cegas apaga o rastro no log.
3. **Aviso ao cliente:** "A loja está passando por uma instabilidade; já estamos
   verificando. Peço que não tente repetidas vezes." Nunca diga "volta em X
   minutos".

### (d) Quando escalar

- **Imediato:** loja inteira fora por mais de 2 minutos.
- **Imediato:** qualquer `500` em série (mais de 5 seguidos).
- **Alta:** `free -m` sem memória, disco acima de 90%, `uptime` acima dos núcleos.
- **Alta:** `http.logs_suppressed` (inundação).
- **Média:** loja viva mas página acima de 3 segundos consistentemente.

---

## Tabela de escala

| O que aconteceu | Nível | Quem resolve | Observação |
|---|---|---|---|
| 400 de validação (CEP, nome, endereço, termos, cupom) | **N1** | você | orienta o campo pela tabela do cenário 4 |
| 429 isolado, um cliente só | **N1** | você | espera 60 s e explica |
| 409 de estoque, número confere | **N1** | você | reserva de 30 min ou reduzir quantidade |
| 401 com chave ausente/errada — só diagnóstico | **N1** | você | distingue pelos logs, **nunca** mostrando o valor |
| Loja lenta, mas `health` 200 e máquina ok | **N1** | você | observa e registra |
| 403 de origem no painel | **N2** | engenharia | é allowlist de rede |
| 429 em massa / vários clientes | **N2** | engenharia | quase sempre IP real do proxy |
| 503 de checkout persistindo após reinício | **N2** | engenharia | canal interno/assinatura |
| Chave que não casa com `orders.enc.json` | **N2** | engenharia | **N1 nunca** toca em `.data/` |
| TLS com mensagem de erro ou certificado a vencer | **N2** | engenharia | renovação e `.env` são de N2 |
| Backup com `FALHOU` | **N2** | engenharia | nunca apagar `.tar.gz` |
| Restauração que não decifra | **N2 + dono** | engenharia + dono | a chave AES só existe no cofre do dono |
| `[assistente] Falha ao chamar o modelo` | **N2** | engenharia | quase sempre saldo/cota |
| `http.logs_suppressed` / inundação | **N2** | engenharia | |
| Gerar/trocar chave AES ou administrativa | **N2** | engenharia | N1 só reporta que falta |
| Escolher gateway de pagamento | **Dono** | `BLOCKERS.md` **B1** | não existe gateway hoje |
| Dados da empresa na política de privacidade | **Dono** | `BLOCKERS.md` **B2** | |
| Manter ou desligar o Gemini | **Dono** | `BLOCKERS.md` **B3** | chave vazia já funciona |
| Docker/compose nunca executados | **Dono** | `BLOCKERS.md` **B4** | |
| Cotação de frete | **Dono** | `BLOCKERS.md` **B5** | hoje é tabela fixa |
| Canal de atendimento publicado | **Dono** | `BLOCKERS.md` **B6** | hoje só Instagram |
| Apagar os pedidos preservados de 13/10 | **Dono** | `BLOCKERS.md`, seção "Dado preservado" | nada foi apagado |
| Qualquer pedido de force-push ou apagão | **Integrador** | fora do N1 | nunca é sua decisão |

---

## Mensagens prontas para enviar ao cliente

> Cordial, sem jargão, **sem prometer prazo**. Substitua `<nome>`.

**1. Checkout — 503**
> Oi, <nome>! Obrigada por avisar. Aqui tivemos uma instabilidade no momento do
> envio do pedido — o seu cadastro não foi perdido, nada foi cobrado e nada
> ficou registrado pela metade. Pode tentar de novo daqui a pouco? Se continuar
> falhando, me chama aqui que eu acompanho com o time. 💛

**2. Limite temporário — 429**
> Oi, <nome>! Isso é só uma proteção da loja contra envios repetidos, e ele
> libera sozinho em cerca de 1 minuto. Pode esperar um pouquinho e tentar de
> novo que deve funcionar. Qualquer coisa, me avisa que eu acompanho. 💛

**3. Estoque insuficiente — 409**
> Oi, <nome>! A quantidade que você pediu é maior do que a disponível agora
> dessa peça. Dá pra ajustar a quantidade na sacola e tentar de novo — mas
> prefiro ser sincera: não consigo garantir que as unidades continuem lá. Se
> quiser, posso te avisar quando chegar mais. 💛

**4. Estoque não configurado**
> Oi, <nome>! Esse produto ainda está com a ficha de estoque em ajuste aqui
> pela nossa equipe, por isso não está liberado para pedido neste momento.
> Já anotei e quem cuida disso vai resolver. Enquanto isso, posso te mostrar
> peças parecidas, se quiser. 💛

**5. Erro de validação — 400**
> Oi, <nome>! Deu uma recusa em um dos campos do endereço, nada grave. Me
> manda de novo a frase exata que apareceu na tela que eu te digo certinho o
> que ajustar — assim você não precisa refazer tudo às cegas. 💛

**6. Painel administrativo — 401**
> Boa noite! O acesso ao painel recusou a chave. Só pra eu saber onde olhar:
> você está recebendo a mensagem "Chave administrativa inválida ou operação não
> habilitada neste servidor"? Esse retorno é idêntico nos dois casos possíveis,
> de propósito — é uma proteção da loja. Me confirma o horário da tentativa que
> eu verifico o registro e te digo qual dos dois é. Não me envie a chave por
> aqui, por favor. 💛

**7. Chave de cifra / pedido não decifra (para o dono)**
> Olá! Localizei a causa: o arquivo de pedidos não está sendo aberto pela chave
> configurada agora. Nada foi apagado nem alterado — os dados continuam
> intactos, inclusive os preservados de 13/10. Isso precisa ser resolvido pela
> engenharia, porque envolve chave de criptografia, e eu não mexo nisso por
> segurança. Já encaminhei com o registro completo do que encontrei. 💛

**8. TLS / certificado**
> Olá! O serviço de dados não subiu por causa da configuração de certificado —
> é preciso ter o certificado e a chave configurados juntos, e pelo que vi um
> dos dois está faltando (ou o certificado já venceu). Vou encaminhar para a
> engenharia ajustar e reiniciar. Enquanto isso, a loja pode ficar instável no
> envio de pedidos. 💛

**9. Backup falhou**
> Olá! O backup de hoje recusou gravar porque não conseguiu validar o conteúdo.
> Ponto importante: isso é proposital — nunca fica um backup ruim no lugar de um
> bom. Os backups anteriores continuam intactos e nada foi apagado. Já
> encaminhei para a engenharia verificar hoje mesmo. 💛

**10. Chat do assistente parado**
> Oi, <nome>! A nossa assistente está respondendo no modo de reserva por agora,
> por isso as respostas estão mais diretas que o normal. Ela continua sabendo o
> que temos no catálogo — e para qualquer detalhe de peça, prazo ou entrega,
> falo eu por aqui com certeza. Pode perguntar à vontade. 💛

**11. Loja fora do ar**
> Oi, <nome>! A loja está passando por uma instabilidade agora e o time já está
> cuidando. Peço só que não tente várias vezes seguidas, tá? Assim que estabilizar
> eu te aviso por aqui. 💛

**12. Loja lenta**
> Oi, <nome>! Estamos com uma lentidão pontual, nada com o seu pedido. Se
> puder, tente de novo em instantes — e me avise se continuar difícil que eu
> acompanho. 💛

**13. Quando você não sabe ainda**
> Oi, <nome>! Obrigada por trazer isso com o detalhe — me ajuda muito. Já
> registrei e estou verificando com o time. Te retorno assim que eu tiver
> confirmação do que aconteceu, sem chute. 💛

---

## Regra de ouro

> **Nunca peça dado pessoal completo do cliente por mensagem.**

- **Não peça:** CPF, dados de cartão, endereço completo, senha, chave nenhuma,
  nem "todos os dados de novo".
- **A busca oficial de um cliente no painel é feita por TELEFONE** —
  `GET /api/admin/titular?telefone=...` — e **fica registrada**. Toda tentativa
  administrativa gera linha de log com origem, caminho e desfecho
  (**art. 37** da LGPD: registro das operações de tratamento). Ou seja: **a busca
  é rastreável, e é assim que tem que ser.**
- Prefira **número do pré-pedido** (é identificador de negócio, entregue uma vez
  no pedido) antes de qualquer outro dado.
- Se o cliente mandar dado sensível espontaneamente por canal aberto: **não
  repasse, não copie, não guarde**. Responda com o número do pedido e siga.
- **Chave alguma circula por mensagem** — nem a sua, nem a dele, nem a da loja.
- Se o cliente pedir para **excluir** seus dados: isso **existe** (exclusão e
  anonimização). Ele pede, você registra, N2 executa. **Correção** de dado
  (art. 18, IV) **não existe** hoje — não finja que existe.
