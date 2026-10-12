import { describe, expect, it } from 'vitest';
import { resolveTrustProxy } from '../trustedProxy';

describe('resolveTrustProxy', () => {
  it('leaves proxy trust off when the variable is absent or empty', () => {
    expect(resolveTrustProxy(undefined)).toBeUndefined();
    expect(resolveTrustProxy(null)).toBeUndefined();
    expect(resolveTrustProxy('')).toBeUndefined();
    expect(resolveTrustProxy('   ')).toBeUndefined();
    expect(resolveTrustProxy('false')).toBeUndefined();
  });

  // VUL-06: `true` faria o Express aceitar qualquer X-Forwarded-For.
  it('rejects the unsafe `true` value so X-Forwarded-For stays untrusted', () => {
    expect(resolveTrustProxy('true')).toBeUndefined();
    expect(resolveTrustProxy(' TRUE ')).toBeUndefined();
  });

  it('accepts an explicit list of addresses and CIDR ranges', () => {
    expect(resolveTrustProxy('127.0.0.1')).toEqual(['127.0.0.1']);
    expect(resolveTrustProxy('127.0.0.1,10.0.0.0/8')).toEqual(['127.0.0.1', '10.0.0.0/8']);
    expect(resolveTrustProxy(' 192.168.1.10 ')).toEqual(['192.168.1.10']);
    expect(resolveTrustProxy('::1')).toEqual(['::1']);
    expect(resolveTrustProxy('::ffff:192.168.0.1')).toEqual(['::ffff:192.168.0.1']);
    expect(resolveTrustProxy('loopback')).toEqual(['loopback']);
    expect(resolveTrustProxy('uniquelocal')).toEqual(['uniquelocal']);
  });

  it('accepts a bounded hop count', () => {
    expect(resolveTrustProxy('1')).toBe(1);
    expect(resolveTrustProxy('2')).toBe(2);
    expect(resolveTrustProxy('11')).toBeUndefined();
    expect(resolveTrustProxy('99')).toBeUndefined();
  });

  it('fails closed on malformed entries instead of trusting blindly', () => {
    expect(resolveTrustProxy('not-an-ip')).toBeUndefined();
    expect(resolveTrustProxy('127.0.0.1,evil')).toBeUndefined();
    expect(resolveTrustProxy('*')).toBeUndefined();
    expect(resolveTrustProxy('999.1.1.1')).toBeUndefined();
  });
});
