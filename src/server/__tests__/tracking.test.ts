import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TrackingStore } from '../tracking';

const dirs: string[] = [];
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'lola-tracking-'));
  dirs.push(directory);
  return new TrackingStore(directory, 'a'.repeat(64), true);
}
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe('TrackingStore', () => {
  const orderNumber = 'LOLA-20261011-ABCDEF123456';
  it('creates an unguessable token and returns only public tracking data', () => {
    const store = setup();
    const created = store.create(orderNumber);
    expect(created).not.toBeNull();
    expect(created!.token.length).toBeGreaterThanOrEqual(40);
    expect(store.lookup(created!.token)?.orderNumber).toBe(orderNumber);
    expect(store.lookup('wrong-token')).toBeNull();
    expect(JSON.stringify(store.lookup(created!.token))).not.toContain('tokenHash');
  });
  it('updates a status and validates carrier codes', () => {
    const store = setup();
    const created = store.create(orderNumber);
    expect(created).not.toBeNull();
    expect(store.update(orderNumber, { status: 'posted', carrierCode: 'AB123456789BR' })?.carrierCode).toBe('AB123456789BR');
    expect(store.update(orderNumber, { status: 'in_transit', carrierCode: 'bad' })).toBeNull();
  });
  it('persists encrypted tracking and does not store the raw access token', () => {
    const store = setup();
    const created = store.create(orderNumber);
    expect(created).not.toBeNull();
    const reloaded = new TrackingStore(dirs[dirs.length - 1], 'a'.repeat(64), true);
    expect(reloaded.lookup(created!.token)?.orderNumber).toBe(orderNumber);
  });
});
