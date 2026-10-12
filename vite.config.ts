import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname ?? '.', '.'),
    },
  },
  // This app runs Express around Vite in development; keep both layers local-only.
  // The explicit deny list includes Vite's defaults plus application data/secrets.
  server: {
    host: '127.0.0.1',
    fs: {
      deny: [
        '.env',
        '.env.*',
        '**/.git/**',
        '**/.data/**',
        '**/.local-secrets/**',
        '**/*.key',
        '**/*.enc.json',
        '*.{crt,pem,key,p12,pfx,cer,der}',
      ],
    },
  },
}));
