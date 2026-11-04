import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production Docker Compose secret boundaries', () => {
  const compose = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf8');
  const dockerignore = readFileSync(join(process.cwd(), '.dockerignore'), 'utf8');
  const embeddedStart = compose.indexOf('\n  embutido:');
  const vitrineStart = compose.indexOf('\n  vitrine:');
  const dataStart = compose.indexOf('\n  data-server:');
  const volumesStart = compose.indexOf('\nvolumes:', dataStart);
  const embedded = compose.slice(embeddedStart, vitrineStart);
  const vitrine = compose.slice(vitrineStart, dataStart);
  const dataServer = compose.slice(dataStart, volumesStart);

  it('injects embedded-only secrets into the embedded service, never the public split-mode services', () => {
    expect(embeddedStart).toBeGreaterThanOrEqual(0);
    expect(embedded).toContain('path: .env.embutido');
    expect(vitrine).not.toMatch(/path:\s*\.env\.embutido/);
    expect(dataServer).not.toMatch(/path:\s*\.env\.embutido/);
  });

  it('never injects the data-only secret file into the public storefront', () => {
    expect(vitrineStart).toBeGreaterThanOrEqual(0);
    expect(dataStart).toBeGreaterThan(vitrineStart);
    expect(vitrine).toContain('path: .env');
    expect(vitrine).not.toMatch(/path:\s*\.env\.dados/);
    expect(vitrine).toContain('LOLA_ORDERS_ENCRYPTION_KEY: ""');
    expect(vitrine).toContain('LOLA_ORDERS_KEY_FILE: ""');
    expect(vitrine).toContain('LOLA_TRACKING_ENCRYPTION_KEY: ""');
    expect(vitrine).toContain('LOLA_ADMIN_API_KEY: ""');
    expect(vitrine).toContain('LOLA_EMBEDDED_ADMIN: "false"');
    expect(vitrine).toContain('LOLA_ADMIN_ALLOW_PRIVATE_PROXY: "false"');
  });

  it('loads the data-only secret file only into the private data service', () => {
    expect(dataServer).toContain('path: .env.dados');
    expect(dataServer).toContain('required: false');
    expect(dataServer).not.toMatch(/^\s+ports:/m);
    expect(dataServer).toContain('LOLA_PRIVATE_NETWORK_ISOLATED: "true"');
  });

  it('excludes environment secrets and customer data from Docker build context', () => {
    expect(dockerignore).toMatch(/^\\.env$/m);
    expect(dockerignore).toMatch(/^\\.env\\.\\*$/m);
    expect(dockerignore).toMatch(/^\\.data$/m);
    expect(dockerignore).toMatch(/^\\.git$/m);
  });

  it('keeps the data network internal and without a public route', () => {
    const privateNetwork = compose.slice(compose.indexOf('  lola-interna:'), compose.length);
    expect(privateNetwork).toContain('internal: true');
    expect(privateNetwork).toContain('subnet: 172.31.1.0/24');
  });
});
