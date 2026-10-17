/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/**
 * Arquivos que o servidor de desenvolvimento NUNCA deve servir por HTTP.
 *
 * Em `npm run dev`, os middlewares do Vite ficam expostos na porta da aplicação e
 * transformam qualquer `.ts` solicitado — inclusive `server.ts` e todo o código
 * do backend em `src/server/**`, além de `.data/orders.enc.json` (pedidos
 * cifrados), `.data/inventory.json`, `package-lock.json` e chaves locais.
 * Produção não passa por aqui (usa `express.static` sobre `dist/`), mas um dev
 * rodando numa rede corporativa entrega tudo isso a qualquer um na mesma rede.
 */
/** Exportado para o teste de regressão que impede o vazamento do `data-server.ts`. */
export const DEV_DENY = [
  '.env',
  '.env.*',
  '**/.env',
  '**/.env.*',
  '**/.git/**',
  '**/.data/**',
  '*.key',
  '*.pem',
  '*.crt',
  '*.p12',
  '*.pfx',
  '*.der',
  '.npmrc',
  '.yarnrc.yml',
  '**/.npmrc',
  '**/.yarnrc.yml',
  // Cofre local e pedido cifrado: `**/.data/**` já cobre o dado em disco, mas
  // estes padrões seguram cópia que alguém deixe fora do diretório de dados.
  '**/*.enc.json',
  '**/.local-secrets/**',
  '*.cer',
  'package-lock.json',
  'package.json',
  'tsconfig*.json',
  'server.ts',
  'server.ts.map',
  'vite.config.ts',
  'vite.config.ts.map',
  'vitest.config.ts',
  // O entrypoint do serviço PRIVADO. Sem esta entrada, `GET /data-server.ts`
  // era transformado e entregue em texto/javascript — o atacante lia o
  // protocolo interno, as rotas /internal e como o canal é autenticado.
  // VUL-A (confirmado ao vivo: 200 + text/javascript).
  'data-server.ts',
  'data-server.ts.map',
  '**/data-server.ts',
  '**/data-server.ts.map',
  // Source maps de qualquer arquivo de backend serviriam o original.
  'src/server/*.ts.map',
  '**/src/server/**/*.ts.map',
  '**/src/server/**',
  // Documentação interna, material de deploy e templates de infraestrutura:
  // não são conteúdo do site, e o transformador do Vite os entregava em dev
  // (RT-E-03/RT-D-01 do red-team — o README.md foi servido ao vivo).
  '**/docs/**',
  '**/deploy/**',
  '**/.github/**',
  '**/README.md',
  '**/*.http',
  '**/docker-compose.yml',
  '**/Dockerfile',
  '**/.dockerignore',
];

/**
 * Remove os comentários HTML do `index.html` no build de produção (RT-R-01):
 * as notas internas de desenvolvimento (bloqueios, decisões de preload) ficam
 * visíveis no HTML publicado. Em dev os comentários continuam no lugar.
 */
const stripHtmlComments: Plugin = {
  name: 'lola-strip-html-comments',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(/<!--[\s\S]*?-->\s*/g, '');
  },
};

/**
 * RT-D-04: o 403 do deny de `server.fs` vazava o caminho ABSOLUTO do arquivo
 * negado no corpo (ex.: `The request id "/home/<usuario>/lola_site/docs/..."
 * is outside of Vite serving allow list`) — quem pedia um arquivo negado
 * descobria usuário e árvore de diretórios da máquina.
 *
 * Este plugin entra no INÍCIO da cadeia de middlewares e envolve
 * `writeHead`/`write`/`end` da resposta: quando o status final é 403, o corpo
 * é limpo antes do flush. Status, headers e todo o fluxo fora do 403
 * (inclusive streaming e HMR) passam intactos.
 *
 * Interceptar a SAÍDA em vez de replicar o matcher da deny list: replicar
 * exigiria acompanhar `server.fs.deny` E os defaults internos do Vite a cada
 * atualização — a limpeza do corpo vale para qualquer caminho negado,
 * inclusive `/@fs/` apontando para fora da raiz, e para futuros templates de
 * erro do próprio Vite.
 */
const respostas403SemCaminhoAbsoluto: Plugin = {
  name: 'lola-403-sem-caminho-absoluto',
  apply: 'serve',
  configureServer(server) {
    // `config.root` é absoluto e sem barra final: é o prefixo que o middleware
    // de deny embute no corpo. A variante com `\` cobre o estilo do Windows.
    const raizes = server.config.root.includes('\\')
      ? [server.config.root, server.config.root.replaceAll('\\', '/')]
      : [server.config.root, server.config.root.replaceAll('/', '\\')];

    // Mesma semântica do template do Vite ("403 Restricted"), sem caminho algum.
    const corpoGenerico = '<body><h1>403 Restricted</h1><p>Forbidden</p></body>';

    const limparCorpo = (corpo: string): string => {
      // O 403 padrão do deny vem do template do Vite, que pode citar caminhos
      // até fora da raiz (requisição `/@fs/...`): nesse caso o corpo inteiro
      // vira texto genérico. O marcador é a âncora do template; se o Vite
      // mudar a frase, o fallback abaixo ainda remove o caminho da raiz.
      if (corpo.includes('outside of Vite serving allow list')) return corpoGenerico;
      let limpo = corpo;
      for (const raiz of raizes) limpo = limpo.split(raiz).join('');
      return limpo;
    };

    server.middlewares.use((_req, res, next) => {
      // Assinaturas largas: o wrapper repassa os argumentos como vieram.
      type EscreverCru = (pedaco?: unknown, encoding?: unknown, callback?: unknown) => boolean;
      type FinalizarCru = (pedaco?: unknown, encoding?: unknown, callback?: unknown) => unknown;
      type CabecalhoCru = (status: number, ...resto: unknown[]) => unknown;

      const escreverOriginal = res.write.bind(res) as unknown as EscreverCru;
      const finalizarOriginal = res.end.bind(res) as unknown as FinalizarCru;
      const cabecalhoOriginal = res.writeHead.bind(res) as unknown as CabecalhoCru;

      // Status declarado em writeHead explícito; enquanto ausente, vale o
      // `res.statusCode` mutável (caminho do deny do Vite).
      let statusDeCabecalho: number | undefined;
      // `null` = resposta comum, nada é retido; `[]` = corpo 403 retido para
      // limpeza (chunks de 403 são minúsculos; um caminho pode atravessar a
      // fronteira entre dois chunks, então a troca acontece só no `end`).
      let retido: Buffer[] | null = null;

      const eh403 = () => (statusDeCabecalho ?? res.statusCode) === 403;

      const comoBuffer = (pedaco: unknown, encoding: unknown): Buffer | null => {
        if (typeof pedaco === 'string') {
          const codificacao = typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8';
          return Buffer.from(pedaco, codificacao);
        }
        if (Buffer.isBuffer(pedaco)) return pedaco;
        // `ArrayBuffer.isView` cobre TypedArray (inclusive Uint8Array) e DataView.
        if (ArrayBuffer.isView(pedaco)) {
          return Buffer.from(pedaco.buffer, pedaco.byteOffset, pedaco.byteLength);
        }
        return null;
      };

      res.writeHead = function writeHead403(status: number, ...resto: unknown[]) {
        statusDeCabecalho = status;
        return cabecalhoOriginal(status, ...resto);
      } as unknown as typeof res.writeHead;

      res.write = function write403(pedaco?: unknown, encoding?: unknown, callback?: unknown) {
        if (!eh403()) return escreverOriginal(pedaco, encoding, callback);
        const buffer = comoBuffer(pedaco, encoding);
        if (buffer) (retido ??= []).push(buffer);
        // Callback de write só sinaliza "aceito"; como o corpo fica retido até
        // o `end`, avisar já mantém o fluxo de quem escreve (pipe, etc.).
        const aviso = typeof encoding === 'function' ? encoding : typeof callback === 'function' ? callback : null;
        if (aviso) queueMicrotask(aviso as () => void);
        return true;
      } as unknown as typeof res.write;

      res.end = function end403(pedaco?: unknown, encoding?: unknown, callback?: unknown) {
        if (!eh403() && retido !== null) {
          // Status mudou entre write e end: devolve os pedaços retidos intactos.
          for (const pedacoRetido of retido) escreverOriginal(pedacoRetido);
          retido = null;
          return finalizarOriginal(pedaco, encoding, callback);
        }
        if (!eh403()) return finalizarOriginal(pedaco, encoding, callback);
        const finalizador = typeof pedaco === 'function' ? pedaco : typeof encoding === 'function' ? encoding : callback;
        const buffer = typeof pedaco === 'function' ? null : comoBuffer(pedaco, encoding);
        if (buffer) (retido ??= []).push(buffer);
        if (retido === null) {
          // 403 sem corpo retido: nada a limpar, segue o fluxo normal.
          return finalizarOriginal(pedaco, encoding, callback);
        }
        const cru = Buffer.concat(retido);
        retido = null;
        const textoCru = cru.toString('utf8');
        const limpo = limparCorpo(textoCru);
        if (res.headersSent) {
          // Headers já saíram (inclusive Content-Length, se declarado):
          // completa com espaços para o corpo manter o mesmo tamanho em bytes.
          const faltando = cru.byteLength - Buffer.byteLength(limpo);
          const corpoFinal = faltando > 0 ? limpo + ' '.repeat(faltando) : limpo;
          return finalizarOriginal(corpoFinal, undefined, finalizador);
        }
        if (limpo !== textoCru) res.removeHeader('content-length');
        return finalizarOriginal(limpo, undefined, finalizador);
      } as unknown as typeof res.end;

      next();
    });
  },
};

export default defineConfig(() => {
  return {
    test: {
      // A suíte E2E do dono vive em e2e/ com toolchain própria (Playwright,
      // package.json separado) e roda fora do vitest — sem esta exclusão o
      // runner da raiz passaria a colecionar os specs dela.
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/cypress/**',
        '**/.{idea,git,cache,temp,output}/**',
        'e2e/**',
      ],
    },
    plugins: [react(), tailwindcss(), stripHtmlComments, respostas403SemCaminhoAbsoluto],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname ?? '.', '.'),
      },
    },
    server: {
      // 127.0.0.1 de propósito: rodar exposto em 0.0.0.0 entregaria o
      // transformador do Vite (e com ele o backend) a qualquer um na rede.
      host: '127.0.0.1',
      fs: { deny: DEV_DENY },
    },
  };
});
