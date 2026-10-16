import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTrustProxy } from '../trustedProxy';

const linhasDeErro = () => vi.mocked(console.error).mock.calls.map((call) => String(call[0]));

afterEach(() => vi.restoreAllMocks());

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

// Cada recusa vira evento `config.proxy_rejeitado` com o motivo, em vez de
// texto solto: o operador precisa diagnosticar pela linha estruturada.
describe('resolveTrustProxy — registro estruturado das recusas', () => {
  it('registra `true` como evento, com impacto e ação', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(resolveTrustProxy('true')).toBeUndefined();

    const linha = linhasDeErro().find((entry) => entry.includes('config.proxy_rejeitado')) ?? '';
    expect(linha).toContain('ERROR');
    expect(linha).toContain('variavel=LOLA_TRUSTED_PROXY');
    expect(linha).toContain('motivo=confianca_total_em_x-forwarded-for');
    expect(linha).toContain('impacto=rate_limit_sem_confianca_em_proxy');
    expect(linha).toContain('acao=informe_ips_ou_cidrs_dos_proxies_ex_127.0.0.1,10.0.0.0/8');
  });

  it('registra saltos acima do teto com o valor declarado e o limite', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(resolveTrustProxy('11')).toBeUndefined();

    const linha = linhasDeErro().find((entry) => entry.includes('config.proxy_rejeitado')) ?? '';
    expect(linha).toContain('motivo=saltos_acima_do_limite');
    expect(linha).toContain('valor=11');
    expect(linha).toContain('limite=10');
  });

  it('registra as entradas inválidas para o operador corrigir o ambiente', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(resolveTrustProxy('127.0.0.1,evil,999.1.1.1')).toBeUndefined();

    const linha = linhasDeErro().find((entry) => entry.includes('entradas_invalidas')) ?? '';
    expect(linha).toContain('entradas=evil,999.1.1.1');
    expect(linha).toContain('total=2');
  });

  it('valor aceito não escreve linha nenhuma', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(resolveTrustProxy('127.0.0.1,10.0.0.0/8')).toEqual(['127.0.0.1', '10.0.0.0/8']);

    expect(linhasDeErro()).toHaveLength(0);
  });
});
