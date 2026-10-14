# Relatório de qualidade — `lola_site`

Trabalho feito em um worktree isolado (`/tmp/opencode/lola-testes`, branch `agente/testes`).
Nada foi escrito no repositório do usuário e nada foi empurrado para remoto.

## Números

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| Arquivos de teste | 21 | 27 |
| Testes | 258 | 326 |
| Novos testes | — | +68 |
| `npx tsc --noEmit` | limpo | limpo |

Os 258 testes originais continuam passando sem ter sido enfraquecidos. O ganho está em
código que antes não tinha teste nenhum: configuração de ambiente, o tratador de erro do
fim da cadeia, o relógio do rate limit, falhas de rede do plano de dados e — o mais
importante — o **boot real** dos dois entrypoints, que é a única coisa que prova que os
middlewares estão registrados na ordem certa.

Os 68 testes novos, por arquivo:

| Arquivo | Testes | O que cobre |
| --- | ---: | --- |
| `src/server/__tests__/serverBoot.test.ts` | 17 | `server.ts` de verdade (produção, embutido e dividido) |
| `src/server/__tests__/dataServerBoot.test.ts` | 12 | `data-server.ts` de verdade (produção, TLS, IP, porta) |
| `src/server/__tests__/envConfig.test.ts` | 17 | clamp de `PORT` e pareamento do par TLS |
| `src/server/__tests__/httpError.test.ts` | 7 | tratador JSON do fim da cadeia |
| `src/server/__tests__/logger.test.ts` | +5 | `configureIpLoggingFromEnv` (LGPD) |
| `src/server/__tests__/rateLimitRelogio.test.ts` | 5 | expiração de janela, `Retry-After`, teto diário |
| `src/server/__tests__/httpDataPlaneRede.test.ts` | 5 | rede de verdade: porta morta, DNS, timeout, socket cortado |

## Os três buracos mais perigosos fechados

### 1. Tratador de erro do fim da cadeia (VUL-B) — `httpError.ts`

Antes, o `express.json` rejeitava JSON malformado e o erro escapava para o
`finalhandler` do Express, que em não-produção devolve **HTML com a stack trace
completa**: arquivo, linha e trecho de código na resposta. Qualquer visitante mandava
`{"cliente": ` e recebia o mapa interno do servidor.

Hoje o `createJsonErrorHandler` está registrado **depois** do body parser, do
`express.static` e dos middlewares do Vite, e devolve `400`/`413`/`500` em JSON, com a
mensagem interna só no log. O teste de boot (`serverBoot.test.ts`) é que prova a ordem
na cadeia real — um teste unitário da função não veria se ela está registrada no lugar
certo.

### 2. Guarda cross-site antes dos limites por rota (VUL-E) — `requestGuard.ts`

Se o guard ficasse registrado **depois** do `limitOrderDraft`, um site malicioso
disparava `POST` simples contra uma visitante e consumia os 10 pré-pedidos por minuto
dela antes do 403 acontecer. O teste de boot envia um `POST` com `Origin` de domínio
estranho e espera o `403` — provando que a guarda alcança a rota antes do limite.

### 3. Preço enviado pela cliente é ignorado (bloco 10)

O `POST /api/pedidos/rascunho` aceita `unitPriceCents`/`price` no corpo, mas o subtotal
sai do catálogo do servidor. O teste de boot envia `brinco-1` com `unitPriceCents: 1`
e confere que o subtotal devolvido é **R$ 49,90**, o preço real. Se um dia a validação
deixar de sobrepor o preço, o teste falha.

## Bugs e comportamentos encontrados

### `PORT` fora da faixa derrubava a subida no meio do `listen`

`PORT=99999` passava direto para `app.listen`, que morria com `RangeError` depois de
todo o resto já ter sido inicializado — processo "vivo" sem HTTP, que um supervisor não
reiniciaria. Corrigido com `envInt` (clamp para 1–65535) nos dois entrypoints, e
testado no boot: `PORT=99999` sobe na porta padrão 4100 em vez de morrer.

### Par TLS incompleto morria mudo com `ENOENT`

`resolveTlsConfig` agora recusa cedo o par incompleto nomeando a variável errada
(`LOLA_TLS_KEY_FILE` sem `LOLA_TLS_CERT_FILE`, e o inverso), e também um arquivo
**inexistente**. Antes, `readFileSync` derrubava com `ENOENT` sem dizer qual variável
apontava para lugar errado. Este é o único ponto em que o comportamento de subida
mudou de propósito: a mensagem saiu melhor e o processo sai com código 1 antes de
tentar escutar. Três testes de boot cobrem as três recusas.

### Logger convertia espaço em `_` nas mensagens

`httpError` tentava logar `motivo` com espaços; o logger normaliza campos para a linha
de log e troca espaço por `_`. O teste foi corrigido para esperar o formato real —
comportamento existente, não bug a corrigir.

### `.data/orders.key` não casa com `.data/orders.enc.json` na máquina do usuário

O `api-test.http` já documenta isso (itens 4–8 e 10 respondem 503 porque a chave
original se perdeu). Não toquei nos dados reais; os testes de boot usam sempre um
diretório temporário próprio.

### Catches silenciosos e TODOs

Auditoria completa: nenhum `TODO`/`FIXME` pendente real. Todos os `catch` sem re-throw
têm `reason`/log — nenhum erro está sendo engolido em silêncio.

## Mapeamento da sonda `api-test.http` (13 blocos)

| Bloco | O que testa | Coberto por |
| ---: | --- | --- |
| 1 | A vitrine responde (sanidade) | `serverBoot` — `/api/health` 200 |
| 2 | Código-fonte do servidor não servido pela web | `serverBoot` — `/server.ts`, `/data-server.ts` → SPA HTML |
| 3 | Arquivos de segredo negados | `serverBoot` — `/.env`, `/.data/orders.key` → SPA HTML |
| 4 | CEP inválido recusado | `serverBoot` — `00000-000` → 400 com a mensagem própria |
| 5 | Cupom sem subtotal mínimo recusado | `serverBoot` — `BEMVINDA` → 400 "a partir de R$ 150,00" |
| 6 | Cupom desconhecido recusado | `serverBoot` — `GRATIS100` → 400 "não é válido" |
| 7 | POST cross-site morre no guard (VUL-E) | `serverBoot` — Origin estranho → 403 |
| 8 | Sem `Origin` continua funcionando | `serverBoot` — rascunho sem Origin → 201 |
| 9 | Erro interno não vaza stack (VUL-B) | `serverBoot` + `httpError` — JSON malformado → 400 sem stack |
| 10 | Preço do cliente é ignorado | `serverBoot` — `unitPriceCents: 1` → subtotal 49,90 |
| 11 | Rota administrativa sem chave | `serverBoot` — 401 idêntico |
| 12 | Rota administrativa com chave errada | `serverBoot` — 401 idêntico; chave certa → 200 |
| 13 | Cabeçalhos de segurança presentes | `serverBoot` + `dataServerBoot` — HSTS, CSP, nosniff, DENY |

Blocos que a sonda marcava como "só funcionam em diretório de dados novo" (4–8, 10)
agora rodam em CI sem tocar no `.data` real, porque o boot usa diretório temporário.

## Por que não há teste do `server.ts` em modo dev

O modo dev sobe o middleware do Vite, que escreve o cache em `node_modules/.vite`. Neste
worktree `node_modules` é symlink para a cópia do usuário, então um boot de dev em teste
**contaminaria o repositório original** — já aconteceu uma vez e foi revertido. Por isso
todo boot de `server.ts` usa `NODE_ENV=production` (sem Vite, boot em ~1s, sem escrita
fora do diretório temporário). O caminho do Vite em dev continua protegido pelos testes
unitários dos middlewares (`securityHeaders`, `requestGuard`, `httpError`), que são os
mesmos middlewares, mas o wiring do dev em si só é exercitado manualmente.

## Nota sobre cobertura

`@vitest/coverage-v8` não está instalado e não há rede para instalar dependências, então a
análise de cobertura foi feita **manualmente, arquivo por arquivo**: cada teste novo foi
escrito contra comportamento observável que estava sem cobertura nenhuma, não para
aumentar número. O resultado é o painel da tabela "por arquivo" acima.

## Verificação

```
npx tsc --noEmit      # limpo
npx vitest run        # 27 arquivos, 326 testes, todos verdes
```
