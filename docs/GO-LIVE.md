# Ir ao ar — o que falta

Documento único. Os detalhes técnicos estão em `docs/auditorias/*.md`; isto aqui é
**só o que impede o lançamento e o que precisa de uma sua decisão**.

> Regra de leitura: tudo em **Bloco 1** é coisa que eu não consigo resolver sozinho
> porque depende de dinheiro, de dados da empresa ou de uma escolha sua.
> Nada disso é opinião — é requisito.

---

## O que já está fechado

Verificado, não precisa voltar a discutir.

| Área | Estado |
|---|---|
| Testes | **378** verdes · `tsc --noEmit` limpo · `vite build` ok |
| Dependências | `npm audit` **0 vulnerabilidades** (prod e dev) |
| Preço / estoque / cupom | calculados só no servidor; `price` do cliente é ignorado |
| Canal interno | assinado nos **dois** sentidos — testado com proxy MITM forjando `201` → recusado (`503`) |
| Superfície | admin **404** na vitrine mesmo com a chave certa; `/internal` sem assinatura **401** |
| LGPD | IP mascarado · PII cifrada · retenção 90 d com purga · rotas de art. 18 com log |
| Rodapé | deixou de mentir sobre destino dos dados (commit `f24dcbc`) |
| Bundle | `ReportModal` (painel de demonstração morto) removido · js 478 → 456 kB |
| Deploy | `Dockerfile`, compose nos 2 modos, Caddy/nginx, backup, rotação de chave, checklist |

---

## Bloco 1 — bloqueia o lançamento

### 1. Não existe gateway de pagamento ⛔

O mais grave de todos. Não é bug: **a integração nunca foi feita**.

```
src/server/orders.ts:56,67,260,278  →  paymentStatus: 'not_configured'
```

Busquei por Mercado Pago, Pagar.me, Asaas, Stripe, PagBank, Efí — **nenhum no
código**. A loja registra o pré-pedido e reserva o estoque, mas **não cobra ninguém**.

> **Por que eu não "resolvo" isso sozinho:** escolher um PSP é decisão de
> custo/conta/bandeira, e a integração precisa de credenciais que só você tem.

**Consequência prática:** enquanto isso não existir, a escrita
*"Nesta demonstração, nenhum pedido ou cobrança é realizado"*
(`CheckoutPaymentMethod.tsx:197`) é **verdadeira** e **não pode ser removida**.
Tirá-la faria o cliente achar que consegue pagar.

**Pra resolver:** escolher o PSP → me passar as credenciais → eu integro
(webhook, idempotência, `paymentStatus` real).

---

### 2. Política de Privacidade e Termos incompletos ⛔

A mentira do rodapé foi corrigida, mas o texto completo ainda **não existe** —
falta identificação do controlador e do encarregado (art. 9º, I e art. 41).

**Preciso de você:** razão social · CNPJ · endereço · e-mail do encarregado.

O texto já está **escrito e redigido** na `docs/auditorias/lgpd.md` §8.4 — é só
preencher os dados e publicar.

---

### 3. Gemini: manter ou desligar ⛔

O texto digitado no chat vai para o **Google** (`server.ts:449`) hoje **sem aviso
nem consentimento** da cliente.

| Opção | O que fazer |
|---|---|
| **A — manter** | publicar aviso + consentimento antes do envio (redigido na §8.2 do relatório LGPD) |
| **B — desligar** | `GEMINI_API_KEY` vazia; o assistente cai no motor local de regras, que **já funciona** |

Sem essa decisão o lançamento não é defensável do ponto de vista de transferência
internacional de dados (art. 33/39).

---

### 4. `Dockerfile` e `docker-compose.yml` nunca foram executados ⚠️

Nesta máquina **não existe Docker**, e o agente que os escreveu também não tinha.
Estão revisados por leitura, mas **nunca passaram por um build**.

```bash
docker build --check .
docker compose --profile dividido config
```

Se falhar, o culpado mais provável é caminho de volume, não lógica.

---

### 5. Frete é tabela fixa, não cotação

`src/data/shippingOptions.ts` tem prazos fixos (`PAC → 4 a 7 dias úteis`).
Não há integração com Correios nem Melhor Envio.

Ou integra a cotação real, **ou** assume que é "tabela de fretes" e ajusta a
cópia — hoje o aviso diz "estimativas ilustrativas de protótipo"
(`ShippingCalculatorModal.tsx:178`).

---

### 6. Sem canal de atendimento publicado

`src/data/siteConfig.ts` só tem o Instagram (`@lola_acoinox`).
**Nenhum telefone, WhatsApp ou e-mail existe no código.**

O `WhatsAppModal.tsx:85` já avisa: *"o número oficial de atendimento será
integrado pela responsável"*. Sem isso, a cliente sem resposta não tem pra onde ir.

---

## Bloco 2 — decisão de produto (não trava, mas precisa de um sim/não)

| # | Assunto | Estado |
|---|---|---|
| 1 | **O catálogo de verdade é `src/data/mockData.ts`.** Não é só a vitrine que lê: `src/server/catalog.ts:1` importa `ALL_PRODUCTS` de lá, e é de lá que sai o preço que o servidor cobra (`orders.ts:202`). `GET /api/produtos` existe mas **nenhum componente chama**. | Dentro de um build os dois lados **não podem divergir** — leem a mesma fonte, então ninguém é cobrado errado hoje. O risco é do **modo dividido**: a vitrine e o servidor de dados são processos separados, e um redeploy de uma metade só deixa a cliente *exibir* um valor que não é mais o cobrado. Também é problema de nomenclature: o arquivo que se chama "mock" é a autoridade de preço. |
| 2 | **12 modais sem focus trap nem fechamento por `Escape`** (só o lightbox fecha). | Acessibilidade, não segurança. Sugestão: um hook central `useDialogA11y`. |
| 3 | **Correção de dados (art. 18, III)** | **Não existe hoje.** Exclusão e anonimização existem; correção ficou só com esboço de `PATCH` (§8.3). |

---

## Bloco 3 — operação (uma vez, antes do primeiro pedido)

1. **Ordem de deploy é obrigatória:** suba o **data-server novo primeiro**.
   Vitrine nova contra data-server antigo **derruba o canal em 503**
   (o sentido de volta passou a ser assinado).
2. **Cofre da chave AES** — o backup não a inclui de propósito. Escolha o destino
   (gerenciador de senha + papel no cofre físico) **antes** do primeiro backup.
3. **Cron de backup** — `deploy/backup.sh` está pronto, mas quem agenda é você.
   *Backup que não está agendado não existe no dia do apagão.*
4. **Pré-pedidos antigos**: o par `.data/orders.enc.json` + `orders.key` não
   casava e estava travando o checkout. **Nada foi apagado** — está preservado em
   `~/backups/lola-pedidos-ilegiveis-20261013-203712/`. Se aparecer a chave antiga
   em algum backup, dá pra decifrar. Do contrário, pode apagar com tranquilidade.
5. Painel do data-server **sem porta publicada** (rede `internal: true`) —
   entra por túnel SSH.

---

## Bloco 4 — cosmético (não muda nada em produção)

- **Histórico de commits**: 79 commits, misto pt-BR/inglês, e um `fix(ai):`
  (`9b7fe41`) que referencia a rota `/api/ai/consulta` — recurso do produto.
  Corrigir exige **force-push**; os dois outros commits que citavam IA já nem
  estão no histórico (objetos órfãos). **Não fiz, porque é destrutivo e não
  melhora a loja em produção.**

---

## Resumo em uma linha

> O código está endurecido e verificado. **O que falta não é código — é
> gateway de pagamento, dados da empresa e três decisões suas.**
