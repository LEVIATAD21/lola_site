# =============================================================================
# LOLA Aço Inox & Acessórios — imagem multi-stage para produção
# =============================================================================
# UMA imagem só atende os DOIS modos de operação:
#
#   embutido : CMD padrão                     -> vitrine + API (+ admin opt-in)
#   dividido : command: data-server           -> só a metade privada
#
# Por que multi-stage:
#   * o build do Vite precisa de devDependencies (Tailwind, TypeScript, plugins)
#     e de TODO o código-fonte;
#   * o runtime precisa apenas de `dist/`, dos dois entrypoints TS e das
#     dependências de produção.
# Separar os dois mantém o toolchain de build FORA da imagem final: menos
# superfície (nada de compilador/gerador de bundle no processo que conversa com
# a internet) e menos peso para baixar.
#
# Por que Node 22 (bookworm-slim): `.nvmrc` e `engines` exigem >= 22.12.0 — é o
# piso do Vite 8, a restrição mais estrita das dependências. A variante slim já
# traz o glibc que os binários nativos (esbuild, oxide do Tailwind) exigem,
# sem precisar de toolchain de compilação.
# =============================================================================


# -----------------------------------------------------------------------------
# Estágio 1 — build da vitrine
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app

# CI=true silencia prompts de atualização/instalação do npm dentro do build:
# build de imagem precisa ser previsível, não interativo.
ENV CI=true

# Primeiro só o manifesto de dependências: o cache de camada fica válido toda
# vez que `package*.json` não mudar, e o `npm ci` pesado roda uma única vez.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Código-fonte depois das dependências — trocar um componente React não pode
# invalidar a camada do `npm ci`.
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

# `npm run build` = `vite build` -> gera ./dist
RUN npm run build


# -----------------------------------------------------------------------------
# Estágio 2 — runtime
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# NODE_ENV embutido na imagem (não só no compose): se alguém subir o container
# sem compose, ele ainda assim serve `dist/` estático em vez de expor os
# middlewares do Vite em modo de desenvolvimento na porta da aplicação.
ENV NODE_ENV=production \
    PORT=3000 \
    HOME=/tmp \
    npm_config_update_notifier=false \
    npm_config_cache=/tmp/.npm

# Somente dependências de produção. `vite`/`tsx` são `dependencies` no
# package.json (o `tsx` é quem executa os entrypoints TS em produção), então a
# lista é maior que o estrito necessário — mexer nisso altera package.json e o
# CI, então fica para um próximo passo.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# tsconfig lido pelo `tsx` (paths/allowImportingTsExtensions) e entrypoints.
COPY tsconfig.json ./
COPY server.ts data-server.ts ./

# Copia a árvore inteira de `src/` por segurança: o backend importa
# `src/server/**` e `src/data/**`, e nada impede um próximo import de atravessar
# pastas. Os testes ficam de fora via `.dockerignore`.
COPY src ./src

# Vitrine compilada (estágio 1) — é o ÚNICO conteúdo servido por
# `express.static` em produção.
COPY --from=build /app/dist ./dist

# Runbook + scripts de operação (backup, verificação de restauração, rotação de
# chave). Contêm apenas placeholders: nenhum segredo é copiado porque
# `.dockerignore` derruba `.env*` e qualquer `*.key`.
COPY deploy ./deploy

# Só o diretório de DADOS é gravável pelo processo. `node_modules`, `src/` e
# `dist/` continuam do dono root e imutáveis pelo usuário que roda a aplicação:
# um processo comprometido não consegue reescrever o próprio código.
RUN mkdir -p /app/.data && chown node:node /app/.data

# Nunca root. O usuário `node` (uid/gid 1000) já existe na imagem base.
USER node

# 3000 = vitrine (server.ts, padrão) / 4100 = servidor de dados (data-server.ts).
# EXPOSE é documentação: nenhuma porta é publicada pelo Dockerfile, quem decide
# é o `docker-compose.yml` (e o data-server não publica nenhuma).
EXPOSE 3000 4100

# Healthcheck real, não um "ping" cego: bate em GET /api/health, que é O(1) e
# fica FORA do rate limit de leitura de propósito (monitor de uptime e
# balanceador consultam com frequência). Sai 0 só com 2xx.
#   - sem shell: forma exec, então `$PORT` é lido pelo próprio Node;
#   - PORT vem do ambiente, então o mesmo healthcheck serve os dois modos
#     (3000 na vitrine, 4100 no servidor de dados);
#   - start-period folgado porque o `tsx` transforma o TS na largada.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# `node --import tsx` em vez de `npm run start`: mesmo efeito de `tsx
# server.ts`, porém sem o npm como intermediário — nada aqui precisa escrever em
# `~/.npm`, e com `read_only: true` no compose isso deixa de ser uma dúvida.
CMD ["node", "--import", "tsx", "server.ts"]
