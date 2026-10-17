import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrackingStore } from '../tracking';

const dirs: string[] = [];
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'lola-tracking-'));
  dirs.push(directory);
  return new TrackingStore(directory, 'a'.repeat(64), true);
}
afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

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
  // RT-E-02: arquivo corrompido derrubava o processo inteiro no boot com
  // exit(1); agora sobe degradado, preserva o arquivo e registra o evento.
  it('arquivo corrompido não derruba o boot e é preservado (RT-E-02)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = setup();
    expect(store.create(orderNumber)).not.toBeNull();
    const dir = dirs[dirs.length - 1];
    const file = join(dir, 'tracking.enc.json');
    writeFileSync(file, '{ envelope quebrado');
    const quebrado = new TrackingStore(dir, 'a'.repeat(64), true);
    expect(quebrado.ready).toBe(false);
    expect(quebrado.lookup('qualquer-token')).toBeNull();
    expect(readFileSync(file, 'utf8')).toBe('{ envelope quebrado');
  });
  // RT-E-05: `<`/`>` quebravam o padrão do resto da casa — nada de marcação
  // nos textos de logística exibidos na página pública de rastreio.
  it('neutraliza marcação nos textos de logística (RT-E-05)', () => {
    const store = setup();
    expect(store.create(orderNumber)).not.toBeNull();
    const updated = store.update(orderNumber, {
      status: 'posted',
      description: '<img src=x onerror=alert(1)> enviado',
      location: '<b>Centro</b>',
    });
    expect(updated).not.toBeNull();
    const ultimo = updated!.events[updated!.events.length - 1];
    expect(ultimo.description).not.toMatch(/[<>]/);
    expect(ultimo.location ?? '').not.toMatch(/[<>]/);
  });
});
