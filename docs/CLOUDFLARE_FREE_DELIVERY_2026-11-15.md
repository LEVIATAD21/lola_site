# LOLA — entrega sem mensalidades / Cloudflare Pages + D1

**Corte operacional: 15 de novembro de 2026.** Este documento distingue
infraestrutura gratuita, catálogo publicado e venda realmente funcional.
Não marque PROD como aprovada apenas por um deploy verde.

## Acesso e limitações

- Cloudflare Workers/Pages + D1 têm limites do plano **Free**; não existe
  escalabilidade ilimitada sem custos.
- O GitHub já contém os artefatos, mas **conectar repositório a Pages e instalar
  os bindings D1 no painel da Cloudflare exigem sessão com permissão de escrita
  e aprovação do proprietário**. O UUID do banco não é senha.
- Não contratar plano pago nem habilitar faturamento por consumo automaticamente.
- O Asaas pode descontar tarifas por pagamentos recebidos, mesmo sem mensalidade.
- SMS de verificação exige serviço e, em geral, gera cobrança: desabilitado.
  Zero mensalidade sem SMS implica usar e-mail + opção futura de passkey/TOTP,
  não declarar telefone verificado.

## O que já existe no GitHub

| Responsabilidade | Arquivo |
| --- | --- |
| Layout React/Vite | `src/` |
| API pública GET de catálogo | `functions/api/catalog.js` |
| API pública GET de estoque | `functions/api/estoque/[productId].js` |
| Health D1 real | `functions/api/health.js` |
| Bloqueio de pedido não configurado | `functions/api/pedidos/rascunho.js` |
| Esquema SQLite de produtos e estoque | `infra/cloudflare/d1-preview/migrations/0001_catalog.sql` |
| Identidade separada, verificações e histórico | `infra/cloudflare/lola-runtime/migrations/users/0001_users.sql` |
| Pedidos e trilha financeira D1 | `infra/cloudflare/lola-runtime/migrations/commerce/0002_commerce.sql` |
| Rotina de limpeza em lote | `infra/cloudflare/lola-runtime/src/maintenance.js` |
| Testes | `infra/cloudflare/pages.contract.mjs` |

As funções Pages são realmente implantáveis e consultam o binding `DB`.
**Isso não significa que checkout, login ou Admin já estejam operando em D1.**
A build de produção carrega `src/ProductionApp.tsx` em vez da vitrine demonstrativa; ela consulta apenas `/api/catalog` (D1). Se não houver linhas publicadas, exibe **Nenhum produto cadastrado**. O código-fonte ainda mantém os componentes de demonstração para desenvolvimento, mas o build de produção rejeita marcadores de produtos fictícios e remove a pasta de imagens fictícias do `dist`.
O banco real só poderá receber produtos, preços e quantidades fornecidos pela proprietária.
Pedidos reais são rejeitados com HTTP 503 até existir transação e webhook seguros.

## Primeira publicação gratuita da vitrine (modo catálogo)

1. Entre em `https://dash.cloudflare.com/` pelo navegador já autenticado.
2. Abra **Workers & Pages** → **Create** → **Pages** → **Connect to Git**,
   conforme a interface disponível na conta. Escolha o GitHub e autorize o
   repositório `LEVIATAD21/lola_site` (sem compartilhar senha).
3. Projeto sugerido: `lola-site`. **Branch inicial**:
   `work/lola-integration-2026-11-07`, até passar auditoria e merge.
   Framework **Vite**. **Build command**: `npm ci && npm run build && node scripts/validate-pages-output.mjs` (falha antes do upload se houver arquivo privado no `dist`).
   **Build output directory**: `dist`. Root: raiz do repositório.
4. No painel Cloudflare, verifique a existência e a titularidade do banco D1 de catálogo.
   Crie ou selecione o banco autorizado da LOLA e associe o binding **D1 database**
   com nome de variável exatamente `DB` no ambiente **Production** (e **Preview**
   quando houver teste de preview). A configuração histórica do repositório cita
   `lola_db_2026` com UUID `5c523efb-8580-48ae-bdb0-bd4fb2ae7fb5`, porém **esse
   identificador não foi validado contra uma sessão Cloudflare nesta execução**.
   Não migre ou substitua banco de terceiros por coincidência de nome/UUID.
   O binding selecionado pelo painel é a fonte de verdade.
5. Aplique a migration SQLite `infra/cloudflare/d1-preview/migrations/0001_catalog.sql`
   no D1 **apenas após verificar o conteúdo real do banco, assegurar backup
   e confirmar que não conflita com tabelas existentes**. Não confundir
   `db/migrations/0001_core.sql` (PostgreSQL) com SQLite.
6. Reimplante pelo painel e verifique `https://<projeto>.pages.dev/api/health`.
   Sucesso real devolve `{"status":"ok","database":"ready","mode":"catalog-read-only"}`.
   Erro 503 significa binding/migration ausente ou indisponível.
7. Confira `/api/catalog` e `/api/estoque/<id-real>`. Nunca interpretar uma
   vitrine com produtos fictícios como confirmação de estoque/pagamento.
8. Rode **em uma máquina com Node 22+**: `node scripts/smoke-catalog.mjs https://SEU-PROJETO.pages.dev`.
   O script exige HTTPS e valida CSP, D1 real, retorno do catálogo, URL interna,
   privacidade dos endpoints e bloqueio de cobranças; falha se a publicação
   estiver quebrada. Não copie a URL de exemplo como domínio confirmado.
9. Em builds de produção, a UI ativa **catálogo real somente leitura**. Não carrega itens de `mockData.ts`; checkout, edição de perfil e rastreamento permanecem ausentes. A loja consulta produtos publicados no D1 e mostra estado vazio ou de falha real, sem inventar estoque ou preços.
   O build remove imagens de produtos fictícios de `dist/images`, apaga preferências locais obsoletas do protótipo na primeira visita e rejeita marcadores de catálogo demonstrativo no pacote final.
   O JSON-LD de produtos demonstrativos não é publicado. Para operar vendas, implementar e validar o circuito financeiro e de estoque com backend transacional.
10. Não habilite compras enquanto o status financeiro estiver bloqueado.
    Em Pages, `POST /api/pedidos/rascunho` retorna 503 de propósito.

## Segundo banco e manutenção

- Criar no mesmo Cloudflare D1 um banco `lola-users-db`.
- Verificar o ID real. O gerador `infra/cloudflare/lola-runtime/generate-config.mjs`
  recusa identificador ausente ou duplicado.
- Revisar as migrations do banco de usuários/commerce e fazer backup antes de
  aplicar remotamente.
- Programar `lola-maintenance` (Cron 03 UTC), após configurar **ambos** os
  bindings. Remove apenas metadados temporários vencidos e sessões/códigos;
  não remove histórico de pedidos, pagamentos, reembolsos ou auditoria.

## E-mail, segurança e pagamentos

- Remetente profissional requer domínio validado no provedor de e-mail.
  O e-mail pessoal do operador pode ser conta de acesso ao painel, **não**
  deve ser exposto como chave nem colocado em `VITE_*`.
- Criar e-mail transacional e configurar `RESEND_API_KEY` como **secret**
  de Worker; a função privada de código já está implementada, mas falta
  endpoints públicos autenticados, rate limiting robusto e teste real de envio.
- Telefone pode ser armazenado sem documento de identidade; **não fingir**
  verificação por SMS quando o provedor está desabilitado.
- Asaas: conta titular aprovada, credenciais próprias por ambiente, webhooks
  com autenticidade/idempotência e histórico financeiro obrigatório.
  **Nunca executar cobrança enquanto não houver confirmação do destinatário
  dos recebimentos, política de estorno e testes ponta a ponta.**
- Admin `LEVIATAD21/lola_site_admin` está em processo Node separado;
  **não publicar a UI administrativa como estática com credenciais no browser**.
  O BFF precisa de runtime compatível, autenticação, segregação e validação.

## Checklist de aceite

- [ ] Cloudflare Pages publicado com HTTPS e binding D1 confirmado
- [ ] Produtos, preços e estoque reais autorizados no banco
- [x] Build de produção isolado do catálogo de demonstração e assets ilustrativos (CI verifica; **não significa banco remoto esvaziado**)
- [ ] Banco D1 de produção inspecionado e com **0 produtos e 0 estoque**, sem excluir outros dados nem executar `DELETE` em banco desconhecido
- [ ] Conta verificada no backend, sessão revogável, recuperação protegida
- [ ] Admin funcional e privado no runtime aprovado
- [ ] Asaas ligado à conta do destinatário, webhooks e estornos testados
- [ ] Backup, restauração, LGPD, frete e obrigações fiscais revisados
- [ ] Testes reais de compra, reembolso, concorrência e segurança aprovados

**Se houver apenas a vitrine pronta até o dia 15, entregar publicamente como
catálogo, não como loja que processa pagamentos.** Um lançamento parcial
transparente é preferível a cobrar clientes com fluxo incompleto.
