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
const DEV_DENY = [
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
  'package-lock.json',
  'package.json',
  'tsconfig*.json',
  'server.ts',
  'server.ts.map',
  'vite.config.ts',
  'vite.config.ts.map',
  'vitest.config.ts',
  '**/src/server/**',
];

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname ?? '.', '.'),
      },
    },
    server: {
      fs: { deny: DEV_DENY },
    },
  };
});
