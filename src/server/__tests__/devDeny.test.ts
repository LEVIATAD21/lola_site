import { describe, expect, it } from 'vitest';
import { DEV_DENY } from '../../../vite.config';

/**
 * VUL-A (confirmado ao vivo): `GET /data-server.ts` em `npm run dev` era
 * transformado pelo Vite e entregue como `text/javascript` — o visitante lia o
 * entrypoint do serviço PRIVADO, com as rotas `/internal`, o formato da
 * assinatura HMAC e as variáveis de ambiente que controlam o canal.
 *
 * `server.ts` e `src/server/**` já estavam negados; o entrypoint raiz do vizinho
 * ficou de fora. Este teste impede que a lacuna volte por esquecimento.
 */
describe('DEV_DENY do servidor de desenvolvimento', () => {
  const denied = (pattern: string) => DEV_DENY.includes(pattern);

  it('nega o entrypoint do serviço de dados e seu source map', () => {
    expect(denied('data-server.ts')).toBe(true);
    expect(denied('data-server.ts.map')).toBe(true);
    expect(denied('**/data-server.ts')).toBe(true);
    expect(denied('**/data-server.ts.map')).toBe(true);
  });

  it('mantém negado o resto do backend já coberto antes', () => {
    expect(denied('server.ts')).toBe(true);
    expect(denied('vite.config.ts')).toBe(true);
    expect(denied('**/src/server/**')).toBe(true);
    expect(denied('**/.data/**')).toBe(true);
    expect(denied('.env')).toBe(true);
    expect(denied('.env.*')).toBe(true);
  });

  it('nega source map de qualquer arquivo em src/server', () => {
    expect(denied('src/server/*.ts.map')).toBe(true);
    expect(denied('**/src/server/**/*.ts.map')).toBe(true);
  });
});
