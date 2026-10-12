import { describe, expect, it } from 'vitest';
import { resolveAdminAllowlist } from '../ipAllow';

describe('resolveAdminAllowlist', () => {
  it('sem configuração, aceita só loopback e faixa privada', () => {
    const allowlist = resolveAdminAllowlist(undefined);

    expect(allowlist.allowAny).toBe(false);
    expect(allowlist.check('127.0.0.1')).toBe(true);
    expect(allowlist.check('10.0.0.7')).toBe(true);
    expect(allowlist.check('172.16.3.4')).toBe(true);
    expect(allowlist.check('192.168.1.10')).toBe(true);
    expect(allowlist.check('::1')).toBe(true);
    expect(allowlist.check('fd00::1')).toBe(true);
    expect(allowlist.check('fe80::1')).toBe(true);
  });

  // O painel administrativo mora em outra máquina, mas não na internet.
  it('recusa qualquer origem pública', () => {
    const allowlist = resolveAdminAllowlist(undefined);

    expect(allowlist.check('8.8.8.8')).toBe(false);
    expect(allowlist.check('1.1.1.1')).toBe(false);
    expect(allowlist.check('203.0.113.9')).toBe(false);
    expect(allowlist.check('2001:4860:4860::8888')).toBe(false);
  });

  it('aceita lista explícita de IPs e CIDRs', () => {
    const allowlist = resolveAdminAllowlist('203.0.113.5, 2001:db8::1');

    expect(allowlist.check('203.0.113.5')).toBe(true);
    expect(allowlist.check('2001:db8::1')).toBe(true);
    expect(allowlist.check('127.0.0.1')).toBe(false);
    expect(allowlist.check('203.0.113.6')).toBe(false);
  });

  it('respeita a máscara do CIDR', () => {
    const allowlist = resolveAdminAllowlist('203.0.113.0/24');

    expect(allowlist.check('203.0.113.9')).toBe(true);
    expect(allowlist.check('203.0.113.255')).toBe(true);
    expect(allowlist.check('203.0.114.9')).toBe(false);
  });

  it('trata endereço IPv4 mapeado em IPv6 como o mesmo host', () => {
    const allowlist = resolveAdminAllowlist('192.168.1.10');

    expect(allowlist.check('::ffff:192.168.1.10')).toBe(true);
    expect(allowlist.check('::ffff:192.168.1.11')).toBe(false);
  });

  it('cai para a faixa privada quando a configuração é inválida', () => {
    const allowlist = resolveAdminAllowlist('8.8.8.8,nao-e-ip');

    expect(allowlist.check('8.8.8.8')).toBe(false);
    expect(allowlist.check('127.0.0.1')).toBe(true);
    expect(allowlist.check('10.0.0.1')).toBe(true);
  });

  it('cai para a faixa privada quando a lista vem vazia', () => {
    const allowlist = resolveAdminAllowlist(',');

    expect(allowlist.check('127.0.0.1')).toBe(true);
    expect(allowlist.check('8.8.8.8')).toBe(false);
  });

  it('`any` abre tudo, mas só quando declarado', () => {
    const allowlist = resolveAdminAllowlist('any');

    expect(allowlist.allowAny).toBe(true);
    expect(allowlist.check('8.8.8.8')).toBe(true);
  });

  // A allowlist lê o endereço do socket, nunca um header: origem não é algo que
  // o chamador escolhe.
  it('recusa origem desconhecida ou malformada', () => {
    const allowlist = resolveAdminAllowlist(undefined);

    expect(allowlist.check(undefined)).toBe(false);
    expect(allowlist.check('')).toBe(false);
    expect(allowlist.check('nao-e-ip')).toBe(false);
    expect(allowlist.check('999.999.999.999')).toBe(false);
    expect(allowlist.check('127.0.0.1, 8.8.8.8')).toBe(false);
  });
});
