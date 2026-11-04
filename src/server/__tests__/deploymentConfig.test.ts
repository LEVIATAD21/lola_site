import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production Docker Compose secret boundaries', () => {
  const compose = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf8');
  const vitrineStart = compose.indexOf('\n  vitrine:');
  const dataStart = compose.indexOf('\n  data-server:');
  const volumesStart = compose.indexOf('\nvolumes:', dataStart);
  const vitrine = compose.slice(vitrineStart, dataStart);
  const dataServer = compose.slice(dataStart, volumesStart);

  it('never injects the data-only secret file into the public storefront', () => {
    expect(vitrineStart).toBeGreaterThanOrEqual(0);
    expect(dataStart).toBeGreaterThan(vitrineStart);
    expect(vitrine).toContain('path: .env');
    expect(vitrine).not.toContain('.env.dados');
    expect(vitrine).not.toContain('LOLA_ORDERS_ENCRYPTION_KEY');
    expect(vitrine).not.toContain('LOLA_ADMIN_API_KEY');
  });

  it('loads the data-only secret file only into the private data service', () => {
    expect(dataServer).toContain('path: .env.dados');
    expect(dataServer).toContain('required: true');
    expect(dataServer).not.toMatch(/^\s+ports:/m);
    expect(dataServer).toContain('LOLA_PRIVATE_NETWORK_ISOLATED: "true"');
  });

  it('keeps the data network internal and without a public route', () => {
    const privateNetwork = compose.slice(compose.indexOf('  lola-interna:'), compose.length);
    expect(privateNetwork).toContain('internal: true');
    expect(privateNetwork).toContain('subnet: 172.31.1.0/24');
  });
});
