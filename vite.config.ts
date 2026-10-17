/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

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
];

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
    plugins: [react(), tailwindcss()],
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
