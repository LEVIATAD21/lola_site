import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createSecurityHeadersMiddleware, type SecurityHeadersOptions } from '../securityHeaders';

const servers: Server[] = [];

async function startEndpoint(options: SecurityHeadersOptions = {}) {
  const app = express();
  app.use(createSecurityHeadersMiddleware(options));
  app.get('/', (_req, res) => res.send('ok'));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  ));
});

describe('security headers', () => {
  it('sets baseline browser protections', async () => {
    const response = await fetch(await startEndpoint());
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('adds CSP for production without enabling HSTS by accident', async () => {
    const response = await fetch(await startEndpoint({ production: true }));
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('content-security-policy')).toContain("object-src 'none'");
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });

  it('enables HSTS only when explicitly requested for production HTTPS', async () => {
    const response = await fetch(await startEndpoint({ production: true, enableHsts: true }));
    expect(response.headers.get('strict-transport-security')).toBe('max-age=15552000');
  });

  // VUL-12: includeSubDomains tranca também os subdomínios pelo período inteiro
  // do max-age, então precisa ser pedido explicitamente.
  it('só inclui subdomínios quando pedido explicitamente', async () => {
    const semSub = await fetch(await startEndpoint({ production: true, enableHsts: true }));
    expect(semSub.headers.get('strict-transport-security')).toBe('max-age=15552000');

    const comSub = await fetch(await startEndpoint({
      production: true, enableHsts: true, includeSubDomains: true,
    }));
    expect(comSub.headers.get('strict-transport-security')).toBe('max-age=15552000; includeSubDomains');
  });

  it('limita o max-age a uma faixa razoável mesmo se vier lixo do ambiente', async () => {
    const baixo = await fetch(await startEndpoint({
      production: true, enableHsts: true, hstsMaxAgeSeconds: 1,
    }));
    expect(baixo.headers.get('strict-transport-security')).toBe('max-age=300');

    const alto = await fetch(await startEndpoint({
      production: true, enableHsts: true, hstsMaxAgeSeconds: Number.MAX_SAFE_INTEGER,
    }));
    expect(alto.headers.get('strict-transport-security')).toBe('max-age=31536000');
  });

  it('não envia HSTS fora de produção mesmo quando habilitado', async () => {
    const response = await fetch(await startEndpoint({ enableHsts: true }));
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });
});
