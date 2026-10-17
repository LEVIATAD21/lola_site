# Cadeia de suprimentos e superfície de build — LOLA Aço Inox & Acessórios

Auditoria de dependências, proveniência e superfície de build.
Ambito: `package.json`, `package-lock.json`, `.npmrc`, `.nvmrc`, `Dockerfile`,
`docker-compose.yml`, `.dockerignore`, `.github/workflows/*`.
Nada foi alterado — este documento é o diagnóstico; a remediação é da onda 2.

Ferramentas: leitura estática do lockfile (224 entradas), execução real de
`npm audit` (Node v22.23.3 / npm 10.9.9) e `npm outdated`. Suíte de testes não
rodou (protocolo).

---

## 1. Gerenciador e versão

| Onde | Node | npm |
|---|---|---|
| `.nvmrc` | `22.14.0` | — |
| `package.json` `engines` | `>=22.12.0` | — |
| CI (`.github/workflows/ci.yml:15-17`) | `node-version: 22` | vem com a action |
| `Dockerfile` (linhas 28 e 54) | `node:22-bookworm-slim` | vem com a imagem |
| Máquina (`~/.local/bin/node`) | v22.23.3 | 10.9.9 |

**Consistente.** Todos os quatro caminhos caem na mesma faixa (major 22), e o
piso real `>=22.12.0` é o do Vite 8. O `.npmrc` traz `engine-strict=true`, o que
faz esse `engines` valer de verdade: instalar em Node fora da faixa **falha** em
vez de emitir aviso e quebrar depois em runtime. É o comportamento correto.

Ressalva menor: o Node do sistema é v18.19.1 — quem chamar `npm` sem o
`~/.local/bin` no PATH levaria `ERR_UNKNOWN_FILE_EXTENSION` no `tsx`. O
`engine-strict` barra o dano silencioso, mas o `.dockerignore` descarta o
`.npmrc` (linha 34), então dentro do build da imagem o `engine-strict` não vale.
Na prática não importa: a imagem é `node:22` e o `npm ci` usa o lockfile.

Gerenciador é **npm puro** — não existe `.yarnrc`, `pnpm-lock.yaml` nem
`bun.lockb` no repositório. Um gerenciador só, um lockfile só.

---

## 2. Scripts de lifecycle

**`package.json` raiz: nenhum.** Não existe `preinstall`, `postinstall` nem
`prepare` no projeto — os scripts são `dev`, `dev:data`, `build`, `start`,
`start:data`, `preview`, `clean`, `lint`, `test`. Nada roda código próprio do
repositório na hora do install.

O que **executa código na instalação** vem da árvore de dependências — o
lockfile marca com `hasInstallScript`. Foram 4 entradas em 224:

| Pacote | Papel | O que roda no install | Veredito |
|---|---|---|---|
| `@google/genai` 2.28.0 | produção (Gemini) | `preinstall: echo 'preinstall: no-op'` | benigno hoje, mas marca a dependência como "executa código no install" |
| `esbuild` 0.28.2 | dev (transitive de tsx/vite/vitest) | `postinstall: node install.js` — valida o binário da plataforma | necessário e esperado |
| `protobufjs` 7.6.6 | produção (transitive do genai) | `postinstall: node scripts/postinstall` | aceitável, mas é código de terceiro executado no install do caminho de produção |
| `fsevents` 2.3.3 | opcional, só macOS | instalador nativo | não instala em Linux — irrelevante aqui |

Nenhum dos quatro é inesperado; todos são pacotes conhecidos do ecossistema.
O ponto não é que algum seja malicioso — é que **existem quatro pontos em que
código de terceiro roda com permissão de quem instala**, e o caminho de
produção (genai → protobufjs) é um deles.

---

## 3. Lockfile — `package-lock.json`

- **Versionado no git**, `lockfileVersion: 3`.
- **224 entradas, 100% com `resolved` + `integrity`.** Nenhuma entrada sem
  hash, nenhuma sem URL de origem.
- **Todas as `resolved` apontam para `https://registry.npmjs.org/`.** Zero
  resoluções para git, zero tarballs fora do registro, zero `link:`, zero
  `file:`. A árvore inteira vem do registro público, autenticada por hash
  SHA-512 na hora da instalação.
- Distribuição: 150 produção, 44 dev, 32 opcionais (plataformas que não são
  esta).

O histórico do arquivo mostra que isso **já foi corrigido uma vez**:

```
a37c12d fix(lockfile): restaura resolved e integrity nas 178 entradas (VUL-13)
f649307 fix(package): declara Node mínimo e conserta o npm start quebrado (VUL-14, VUL-15)
```

Ou seja: houve um momento em que 178 entradas estavam sem `resolved`/`integrity`
e isso foi tratado como vulnerabilidade e remediado. Hoje o arquivo está
íntegro e casado com o `package.json` (o `npm audit` só roda destrinchando o
lockfile, e ele passou — prova de que o lockfile está coerente).

### `overrides` / `resolutions`

**Nenhuma das duas chaves existe** no `package.json` nem no lockfile, e **não
falta nenhuma** hoje. `resolutions` é mecanismo do Yarn (irrelevante num projeto
npm); `overrides` do npm só se justifica para forçar um pin quando (a) há
CVE sem versão corrigida na faixa declarada, ou (b) uma transitiva precisa ser
segurada abaixo/acima da resolução automática. Com audit limpo e resolução
100% do registro, não há motivo para nenhuma das duas — a ausência é o estado
correto, não uma lacuna.

---

## 4. `npm audit` — resultado real

Executado na máquina, com Node v22.23.3 e npm 10.9.9 (a mesma faixa que o CI e
a imagem usam).

**Auditoria completa** (`npm audit`, produção + dev):

```
found 0 vulnerabilities
```

```json
"vulnerabilities": { "info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0 }
"dependencies":    { "prod": 150, "dev": 44, "optional": 32, "total": 224 }
```

**Só produção** (`npm audit --omit=dev`):

```
found 0 vulnerabilities
```

Zero em todas as severidades, nos dois recortes. O CI repete esse gate a cada
push e PR (`.github/workflows/ci.yml:23-24`, step "Dependency audit") e o
CodeQL roda semanal (`.github/workflows/codeql.yml:8-9`). A régua de
monitoramento existe e está ligada.

`npm outdated` mostra 8 pacotes com versão mais nova disponível fora da faixa
declarada (express 5, dotenv 18, motion 14, lucide 1.x, etc.), mas **todos os
declarados estão na mais nova dentro da faixa** — não há dívida de versão
silenciosa dentro dos ranges.

---

## 5. Inventário de dependências

### Produção (`dependencies`) — 11

| Pacote | Declarado → resolvido | O que faz | Veredito |
|---|---|---|---|
| `express` | ^4.21.2 → 4.22.3 | servidor HTTP da vitrine e da API (importado em 12 módulos de `src/server/**`) | **manter** — espinha dorsal do servidor |
| `react` | ^19.0.1 → 19.3.0 | UI | **manter** |
| `react-dom` | ^19.0.1 → 19.3.0 | render da UI | **manter** |
| `lucide-react` | ^0.546.0 → 0.546.0 | ícones (importado em ~20 componentes) | **manter** |
| `dotenv` | ^17.2.3 → 17.4.2 | carrega `.env` nos dois entrypoints (`server.ts:25`, `data-server.ts:39`) | **manter** — pequeno e usado |
| `tsx` | ^4.21.0 → 4.23.15 | executa os entrypoints TS em produção (`CMD node --import tsx`) | **manter** — é runtime, não é tool |
| `@google/genai` | ^2.4.0 → 2.28.0 | cliente do Gemini (`server.ts:5`) | **avaliar** — depende do bloqueio B3 do dono; ver §5.1 |
| `vite` | ^8.3.0 → 8.3.4 | build da vitrine | **avaliar** — é ferramenta de build morando em produção; ver §5.2 |
| `@tailwindcss/vite` | ^4.3.3 → 4.3.3 | plugin do build CSS (`vite.config.ts:1`) | **avaliar** — idem |
| `@vitejs/plugin-react` | ^6.1.1 → 6.1.2 | plugin do build (`vite.config.ts:2`) | **avaliar** — idem |
| `motion` | ^12.23.24 → 12.43.0 | animações | **remover** — ver §5.3 |

### Desenvolvimento (`devDependencies`) — 9

| Pacote | Declarado → resolvido | O que faz | Veredito |
|---|---|---|---|
| `typescript` | ^7.0.2 → 7.0.2 | typecheck (`npm run lint`) | **manter** |
| `vitest` | ^5.0.3 → 5.0.3 | suíte de testes | **manter** |
| `tailwindcss` | ^4.3.3 → 4.3.3 | framework de CSS (`@import "tailwindcss"` no `src/index.css`) | **manter** |
| `@types/express` | ^4.17.21 → 4.17.25 | tipos | **manter** |
| `@types/node` | ^22.14.0 → 22.20.5 | tipos | **manter** |
| `@types/react` | ^19.3.0 → 19.3.0 | tipos | **manter** |
| `@types/react-dom` | ^19.3.0 → 19.3.0 | tipos | **manter** |
| `autoprefixer` | ^10.4.21 → 10.6.1 | prefixos CSS | **remover** — não referenciado (ver §5.4) |
| `esbuild` | ^0.28.0 → 0.28.2 | bundler | **avaliar remoção** — não referenciado (ver §5.4) |

### 5.1 `@google/genai` — condicionada ao dono

A faixa `^2.4.0` é larga demais: ela aceita de 2.4.0 até 2.28.0 — 24 minors de
drift. O lockfile hoje fixa 2.28.0, então a instalação é reprodutível; mas
qualquer `npm update` pode pular 24 minors de mudanças de uma vez, incluindo a
dependência transitiva `protobufjs`, que executa código no install.

Dois encaminhamentos, ambos do dono (BLOCKERS B3): se o Gemini for **desligado**
(`GEMINI_API_KEY` vazia já funciona), a dependência sai inteira e leva o
`protobufjs` junto — menor superfície de produção e um ponto de execução a
menos. Se **continuar**, fechar a faixa na versão testada:
`npm install @google/genai@2.28.0`.

### 5.2 Ferramenta de build em `dependencies`

`vite`, `@tailwindcss/vite` e `@vitejs/plugin-react` são usados **só** por
`vite.config.ts`. O runtime (`server.ts` via tsx) não importa nenhum dos três.
Como estão em `dependencies`, o `npm ci --omit=dev` do estágio de runtime do
Dockerfile (linha 72) os instala na imagem final — junto com a árvore deles.
O próprio `Dockerfile` (linhas 67-70) já documenta isso como dívida conhecida:
"a lista é maior que o estrito necessário".

Mover os três para `devDependencies` enxuga a imagem final sem mudar o build
(build stage instala tudo, linhas 38-39). É mudança de `package.json` — fora do
meu território; fica como ação para a onda 2.

### 5.3 `motion` — declarado e nunca usado

`motion` está em `dependencies` mas **não existe um único import dele no
código-fonte**. A busca por `motion`, `motion/`, `framer-motion` e
`AnimatePresence` em `src/**` retorna zero ocorrências (fora testes). As
animações da vitrine são CSS puro. É a dependência de produção mais cara em
peso relativo que não precisa estar lá — e uma delas é a que tem mais versões
novas atrás (`12.43.0` → `14.2.0`).

**Remover:** `npm uninstall motion`.

### 5.4 `autoprefixer` e `esbuild` — declarados e nunca referenciados

Nenhum dos dois aparece em `vite.config.ts`, em `tsconfig.json`, em script de
`deploy/` ou em workflow. Não existe `postcss.config.*` no repositório. Com
Tailwind 4 via `@tailwindcss/vite`, o prefixado é feito pelo próprio plugin
(lightningcss) — `autoprefixer` não tem consumo. `esbuild` explícito também não
tem consumo: `tsx` e `vite` trazem o seu embutido.

São devDependencies, então **não entram na imagem de produção** — o custo é
ruído e um `postinstall` extra (o do esbuild) sem necessidade.

**Remover:** `npm uninstall autoprefixer esbuild`.

---

## 6. Superfície de build (Docker)

**Quem escreve na imagem.** Build multi-stage. No estágio 1 (`build`), o npm
instala tudo como root e o Vite escreve `dist/`. No estágio 2 (`runtime`), o
`npm ci --omit=dev` roda como root, e depois o `chown` limita o que o usuário
`node` pode gravar: **só `/app/.data`** (`Dockerfile:96`). `node_modules`, `src`
e `dist` ficam do dono root — um processo comprometido não reescreve o próprio
código. O container sobe com `USER node`, `read_only: true`, `tmpfs: /tmp`,
`cap_drop: ALL` e `no-new-privileges` (`docker-compose.yml:42-55`).

**`.dockerignore` — confirmado, está completo.** As exigências do protocolo de
segurança (`DECISIONS.md`: `.data/`, `.env*`, `*.key` nunca em imagem) estão
todas cobertas:

| Exigência | Linha no `.dockerignore` | Status |
|---|---|---|
| `.data/` | 17-18 (`.data`, `**/.data`) | excluído |
| `.env*` | 21-24 (`.env`, `.env.*`, `**/…`) | excluído |
| `*.key` | 25 (mais `*.pem`, `*.p12`, `*.pfx`, `*.crt`) | excluído |
| `.git` | 31 (mais `.github`, `.gitignore`) | excluído |

Também fora: `node_modules`, `dist`, testes (`**/__tests__`, `*.test.ts`,
`*.spec.ts`), docs e logs. O runbook `deploy/` fica de propósito (é o que o
operador lê de dentro do container) e contém só placeholders.

**Duas observações de superfície, sem gravidade:**

1. O `npm ci` dentro do Docker usa `--no-audit --no-fund` (linhas 39 e 72) —
   **nenhum gate de auditoria no build de imagem**. Hoje isso é coberto pelo CI
   (que roda `npm audit` antes) e pelo fato de o lockfile ser imutável. Mas
   quem buildar a imagem fora do CI não passa por nenhuma checagem. Uma linha
   de CI de imagem com `npm audit --omit=dev --audit-level=high` fecha isso.
2. O estágio de runtime copia a árvore **inteira** de `src/` (`Dockerfile:82`),
   incluindo o TS cru, por segurança de importação. Não é cadeia de suprimento
   — é superfície de leitura dentro da imagem — e já está comentado; registro
   só para o dono do runtime saber.

---

## 7. Pontos de confiança — o que precisa de pinning, o que executa código

**Já está pinado (bem):**

- Toda a árvore de instalação vem do registro com `integrity` — `npm ci`
  rejeita qualquer bytes fora do hash. Isso cobre os 4 install scripts da §2:
  o código que roda é exatamente o código auditado.
- `npm ci` (e não `npm install`) no CI e no Docker: resolução nunca flutua.
- Usuário não-root, rootfs leitura-somente, sem capabilities.

**Precisa de pinning / atenção:**

1. **GitHub Actions pinadas por tag mutável.** `actions/checkout@v4`,
   `actions/setup-node@v4`, `github/codeql-action/init@v4` e
   `github/codeql-action/analyze@v4` — a tag `v4` é mutável; quem controls o
   repositório da action pode movê-la e o CI passa a executar código
   diferente. Padrão da indústria é pinar por SHA completo com comentário da
   versão. Afeta os dois workflows.
2. **`@google/genai` com faixa ampla** (^2.4.0 → 2.28.0) — fechar na versão
   testada, ou remover se o B3 desligar o Gemini (§5.1).
3. **Google Fonts carregado por CDN em runtime.** `index.html:12-14` faz
   `<link>` para `fonts.googleapis.com`/`fonts.gstatic.com` no caminho crítico
   de toda página. Sem SRI (CSS não suporta), é terceiro externo que o
   navegador do visitante contata a cada visita — cadeia de suprimento em
   runtime e fuga de IP para a Google num site que opera sob LGPD (o bloqueio
   B2 já pendência de controlador). Self-host das fontes (baixadas no build,
   servidas de `public/`) resolve os dois lados. Território de `seo-eng` /
   `data-eng` na onda 2.

   **Resolvido na onda 2** (`8f36fc4`): 10 `.woff2` (SIL OFL) em
   `public/fonts/` com `@font-face`, preload dos críticos e
   `font-display: swap`; o `<link>` do CDN saiu do `index.html`; as origens
   do Google saíram do CSP em seguida.
4. **`get.docker.com | sh`** aparece em `deploy/CHECKLIST.md:14` como
   instrução de instalação do Docker. É doc de operação, não código do build —
   mas é pipe remoto para shell, e vale a alternativa de instalar pelo
   repositório oficial quando chegar a hora.

---

## 8. Veredito de superfície

**Exposição à cadeia de suprimentos: baixa.** E o projeto pode dizer isso com
propriedade — não é generosidade desta auditoria:

- Lockfile íntegro, versionado, 100% registro público, 100% com hash de
  integridade, zero resoluções suspeitas.
- `npm audit` real: **0 vulnerabilidades**, produção e completo.
- Gate de auditoria no CI a cada push/PR + CodeQL semanal — o monitoramento
  continua depois desta auditoria.
- Zero scripts de lifecycle próprios; 4 pontos de execução na árvore, todos
  esperados e nenhum fora do registro.
- Imagem multi-stage, usuário não-root, rootfs leitura-somente, `.dockerignore`
  cobrindo `.data/`, `.env*`, `*.key` e `.git`.
- `engine-strict` garante que ninguém instala em Node errado.

O que sobra é higiene, não brecha: uma dependência de produção sem uso
(`motion`), três ferramentas de build morando em produção (`vite`,
`@tailwindcss/vite`, `@vitejs/plugin-react`), duas devDeps sem uso
(`autoprefixer`, `esbuild`), actions por tag mutável e fontes por CDN. Nada disso
está quebrado hoje; tudo diminui superfície se for resolvido.

---

## 9. Ações

Ordem de valor. Nenhuma foi executada nesta onda — `package.json` e lockfile
não são território do diagnóstico. Quem executar deve rodar com Node 22
(`nvm use` lê o `.nvmrc`) e commitar o lockfile junto.

| # | Ação | Comando | Dono sugerido |
|---|---|---|---|
| 1 | Remover `motion` (não usado) | `npm uninstall motion` | `fe-catalog` |
| 2 | Remover `autoprefixer` e `esbuild` (não usados) | `npm uninstall autoprefixer esbuild` | `fe-catalog` |
| 3 | Mover ferramentas de build para devDeps | `npm install -D vite @tailwindcss/vite @vitejs/plugin-react` | `fe-perf` + `devops-hard` (validar Dockerfile) |
| 4 | Se B3 = desligar Gemini, remover cliente | `npm uninstall @google/genai` | `devops-hard` (após decisão do dono) |
| 5 | Se B3 = manter Gemini, fechar faixa | `npm install @google/genai@2.28.0` | idem |
| 6 | Pinar actions por SHA nos 2 workflows | editar `.github/workflows/ci.yml` e `codeql.yml` | `devops-ci` |
| 7 | Gate de audit no build de imagem | adicionar step `npm audit --omit=dev --audit-level=high` no CI | `devops-ci` |
| 8 | Self-host das fontes Google | baixar no build, servir de `public/`, remover `<link>` do CDN | `seo-eng` / `data-eng` |

Verificação pós-qualquer ação acima: `npm audit` continuando limpo e
`npm run build` passando. A suíte completa roda na integração (protocolo).

---

## 9.1 Atualização — onda 2 + red-team (17/10/2026)

- **Ação 6 — feita:** as 3 actions dos 2 workflows estão pinadas por SHA com
  comentário de versão (`actions/checkout@11d5960a… # v4.4.0`,
  `actions/setup-node@49933ea5… # v4.4.0`,
  `github/codeql-action/{init,analyze}@6f2ac81f… # v4.39.0`; SHAs conferidos por
  `git ls-remote` em 17/10). Junto: `permissions: contents: read` no `ci.yml`
  (RT-S-09) e o `engines` duplicado removido do `package.json` (RT-S-11).
- **Árvore npm do `e2e/` — registrada e com portão:** o CI agora roda
  `cd e2e && npm ci && npm audit` a cada push/PR e o `e2e/README.md` passou a
  instruir `npm ci` (RT-S-02). Lockfile próprio, 0 vulnerabilidades em 17/10.
- **Ação 8 — feita** (`seo-eng`): fontes self-hosted em `public/fonts/`.
- **Ações 1–3 — feitas (onda 3 `supply-hyg`, 17/10):**
  - `motion`, `autoprefixer` e `esbuild` removidos do `package.json` (grep
    confirmou zero imports fora de `node_modules`; as três árvores saíram do
    lockfile — `esbuild` continua na árvore apenas como transitiva de `tsx`).
  - `vite`, `@tailwindcss/vite` e `@vitejs/plugin-react` movidas para
    `devDependencies` (mesmas faixas). Runtime de produção não importa `vite`:
    o `await import('vite')` do `server.ts:609` só executa quando
    `NODE_ENV !== 'production'`, e a imagem runtime roda com
    `NODE_ENV=production` + `npm ci --omit=dev` — confirmado no Dockerfile.
  - Lockfile regenerado com `npm install --package-lock-only`: nenhuma versão
    resolvida mudou; o diff são as remoções acima e `"dev": true` no ramo
    transitivo do `vite`. Verificado com `tsc --noEmit`, `vite build` e
    `npm audit` (0 vulnerabilidades).
  - **D18:** `name` de `react-example` para `lola-aco-inox` e script `clean`
    de `rm -rf dist server.js` para `rm -rf dist` (`server.js` nunca é
    gerado — `noEmit: true`; nenhum CI/doc chama o script).
- **RT-S-12 — feita:** `.github/dependabot.yml` (npm na raiz, npm em `/e2e` e
  github-actions, semanal, minor/patch agrupados por ecossistema para reduzir
  ruído; major segue em PR avulso). Também é o que mantém os SHAs das actions
  pinadas vivos.
- **RT-S-07 — feita:** os dois `FROM` do Dockerfile pinados por digest
  (`node:22-bookworm-slim@sha256:c3de60bf…`, índice multi-arch conferido em
  17/10 via API do Docker Hub) com receita de atualização em comentário no
  topo do arquivo.
- **Pendentes:** ações 4–5 (faixa do `@google/genai` — travada em **B3**) e
  ação 7 (gate de audit do build de imagem — sem Docker em execução no host;
  RT-S-13).
- Frente completa: `~/lola_coord/relatorios/redteam-onda2.md` (frente supply
  chain: `~/lola_coord/status/rt-supply.md`).

---

*Escrito por supply-eng — Onda 1 (diagnóstico). Nenhum arquivo de código ou de
configuração foi alterado. §9.1 acrescentada pelo integrador em 17/10.*
