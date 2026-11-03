import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { allowPrivatePlaintext, envInt, resolveTlsConfig } from '../envConfig';

/**
 * Estas validações viviam INLINE dentro de `startDataService()`, logo antes do
 * `listen`: impossível exercitar o caminho de falha sem subir o processo. Um
 * `PORT=99999` ou um `LOLA_TLS_CERT_FILE` órfão só apareceriam em produção,
 * quando o processo morre no meio da subida. Os testes protegem a função
 * pura exportada — e os dois entrypoints consomem exatamente esta função.
 */

const temporarios: string[] = [];

function arquivoTemporario(prefixo: string, conteudo = 'conteudo-de-teste'): string {
  const dir = mkdtempSync(join(tmpdir(), 'lola-envconfig-'));
  temporarios.push(dir);
  const arquivo = join(dir, prefixo);
  writeFileSync(arquivo, conteudo);
  return arquivo;
}

afterEach(() => {
  for (const dir of temporarios.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('envInt — clamp de variável de ambiente', () => {
  // O clamp de PORT: fora da faixa, o padrão — nunca um valor que derrube o
  // `listen` no meio da subida (era exatamente o que PORT=99999 fazia).
  const clampPorta = (valor: string | undefined) => envInt('PORT', 3000, 1, 65_535, { PORT: valor });

  it('aceita inteiro dentro da faixa, inclusive os dois limites', () => {
    expect(clampPorta('4100')).toBe(4100);
    expect(clampPorta('1')).toBe(1);
    expect(clampPorta('65535')).toBe(65535);
  });

  it('cai no padrão com PORT fora da faixa: 99999, 65536, 0 e -1', () => {
    expect(clampPorta('99999')).toBe(3000);
    expect(clampPorta('65536')).toBe(3000);
    expect(clampPorta('0')).toBe(3000);
    expect(clampPorta('-1')).toBe(3000);
  });

  it('cai no padrão quando o valor não vira número', () => {
    for (const valor of ['abc', '', '   ', '12,5', 'NaN', '1e400', undefined]) {
      expect(clampPorta(valor), String(valor)).toBe(3000);
    }
  });

  it('cai no padrão com número fracionário ou fora do intervalo seguro', () => {
    expect(clampPorta('3000.5')).toBe(3000);
    // 2^53 e maiores não são inteiros seguros: arredondamento não pode virar porta.
    expect(clampPorta('9007199254740993')).toBe(3000);
    expect(clampPorta('1e20')).toBe(3000);
  });

  // Documenta o contrato da leitura: `Number()` do JavaScript normaliza. Se
  // alguém trocar a implementação por um parseInt e passar a aceitar '4100abc',
  // este teste grita.
  it('lê com Number(): espaços nas bordas, notação científica e "1.0" passam dentro da faixa', () => {
    expect(clampPorta(' 4100 ')).toBe(4100);
    expect(clampPorta('4e3')).toBe(4000);
    expect(clampPorta('1.0')).toBe(1);
    expect(clampPorta('4100abc')).toBe(3000);
  });

  it('lê exatamente a variável pedida, com o padrão dela', () => {
    const env = { PORT: '50', OUTRA: '99' };
    expect(envInt('PORT', 7, 1, 100, env)).toBe(50);
    expect(envInt('AUSENTE', 7, 1, 100, env)).toBe(7);
    expect(envInt('PORT', 7, 55, 60, env)).toBe(7);
  });
});

describe('resolveTlsConfig — guarda de TLS do servidor de dados', () => {
  const SEM_PAR: Parameters<typeof resolveTlsConfig>[1] = () => true;

  it('desliga o TLS quando as duas variáveis estão ausentes', () => {
    expect(resolveTlsConfig({}, SEM_PAR)).toEqual({ enabled: false, certFile: '', keyFile: '' });
  });

  it('trata valor que é só espaço em branco como ausente — não tenta abrir um caminho vazio', () => {
    const resultado = resolveTlsConfig(
      { LOLA_TLS_CERT_FILE: '   ', LOLA_TLS_KEY_FILE: '\t\n' },
      SEM_PAR,
    );
    expect(resultado).toEqual({ enabled: false, certFile: '', keyFile: '' });
  });

  // VUL-TLS: um sem o outro não sobe TLS nenhum — e quem opera acharia que o
  // canal privado está cifrado quando trafega em claro (admin key + PII).
  it('recusa LOLA_TLS_CERT_FILE sem LOLA_TLS_KEY_FILE', () => {
    const resultado = resolveTlsConfig({ LOLA_TLS_CERT_FILE: '/tls/cert.pem' }, SEM_PAR);
    expect(resultado).toHaveProperty('error');
    expect((resultado as { error: string }).error).toContain('configurados juntos');
  });

  it('recusa LOLA_TLS_KEY_FILE sem LOLA_TLS_CERT_FILE', () => {
    const resultado = resolveTlsConfig({ LOLA_TLS_KEY_FILE: '/tls/key.pem' }, SEM_PAR);
    expect((resultado as { error: string }).error).toContain('configurados juntos');
  });

  it('recusa a chave presente e o certificado só com espaços, que é o mesmo desequilíbrio', () => {
    const resultado = resolveTlsConfig(
      { LOLA_TLS_CERT_FILE: '   ', LOLA_TLS_KEY_FILE: '/tls/key.pem' },
      SEM_PAR,
    );
    expect((resultado as { error: string }).error).toContain('configurados juntos');
  });

  it('recusa cert e chave apontando para o mesmo arquivo', () => {
    const resultado = resolveTlsConfig(
      { LOLA_TLS_CERT_FILE: '/tls/cert.pem', LOLA_TLS_KEY_FILE: '/tls/cert.pem' },
      SEM_PAR,
    );
    expect((resultado as { error: string }).error).toContain('não podem apontar para o mesmo arquivo');
  });

  it('recusa o mesmo arquivo mesmo com espaços nas bordas de uma das variáveis', () => {
    // Depois do trim, ' /tls/cert.pem ' e '/tls/cert.pem' são o MESMO arquivo:
    // abrir um certificado como chave privada falharia ou pior.
    const resultado = resolveTlsConfig(
      { LOLA_TLS_CERT_FILE: ' /tls/cert.pem ', LOLA_TLS_KEY_FILE: '/tls/cert.pem' },
      SEM_PAR,
    );
    expect((resultado as { error: string }).error).toContain('não podem apontar para o mesmo arquivo');
  });

  it('aceita caminhos distintos e devolve-os aparados, com TLS ligado', () => {
    const resultado = resolveTlsConfig(
      { LOLA_TLS_CERT_FILE: '  /tls/cert.pem ', LOLA_TLS_KEY_FILE: '/tls/key.pem  ' },
      SEM_PAR,
    );
    expect(resultado).toEqual({ enabled: true, certFile: '/tls/cert.pem', keyFile: '/tls/key.pem' });
  });

  it('recusa arquivo de certificado inexistente, nomeando a variável culpada', () => {
    // Antes o processo morria com ENOENT mudo no `readFileSync` lá na hora de
    // criar o socket; agora a falha é cedo e diz qual variável está errada.
    const ausente = join(tmpdir(), `lola-nao-existe-${randomBytes(8).toString('hex')}.pem`);
    const resultado = resolveTlsConfig(
      { LOLA_TLS_CERT_FILE: ausente, LOLA_TLS_KEY_FILE: '/tls/key.pem' },
    );
    expect((resultado as { error: string }).error).toContain('LOLA_TLS_CERT_FILE aponta para arquivo inexistente');
    expect((resultado as { error: string }).error).toContain(ausente);
  });

  it('recusa chave inexistente mesmo com o certificado existindo de verdade', () => {
    const cert = arquivoTemporario('cert.pem');
    const ausente = join(tmpdir(), `lola-nao-existe-${randomBytes(8).toString('hex')}.pem`);
    const resultado = resolveTlsConfig({ LOLA_TLS_CERT_FILE: cert, LOLA_TLS_KEY_FILE: ausente });
    expect((resultado as { error: string }).error).toContain('LOLA_TLS_KEY_FILE aponta para arquivo inexistente');
  });

  it('aceita o par quando os dois arquivos existem de verdade no disco', () => {
    const cert = arquivoTemporario('cert.pem');
    const chave = arquivoTemporario('key.pem');
    expect(resolveTlsConfig({ LOLA_TLS_CERT_FILE: cert, LOLA_TLS_KEY_FILE: chave }))
      .toEqual({ enabled: true, certFile: cert, keyFile: chave });
  });
});


describe('allowPrivatePlaintext', () => {
  it('permite somente opt-in explícito em endereço privado unicast', () => {
    expect(allowPrivatePlaintext('172.31.1.10', { LOLA_INTERNAL_PLAINTEXT: 'true' })).toBe(true);
    expect(allowPrivatePlaintext('10.0.0.5', { LOLA_INTERNAL_PLAINTEXT: 'true' })).toBe(true);
    expect(allowPrivatePlaintext('192.168.1.2', { LOLA_INTERNAL_PLAINTEXT: 'true' })).toBe(true);
    expect(allowPrivatePlaintext('fd00::10', { LOLA_INTERNAL_PLAINTEXT: 'true' })).toBe(true);
  });

  it('recusa sem opt-in, endereços públicos, wildcard, loopback e link-local', () => {
    expect(allowPrivatePlaintext('172.31.1.10', {})).toBe(false);
    expect(allowPrivatePlaintext('8.8.8.8', { LOLA_INTERNAL_PLAINTEXT: 'true' })).toBe(false);
    expect(allowPrivatePlaintext('0.0.0.0', { LOLA_INTERNAL_PLAINTEXT: 'true' })).toBe(false);
    expect(allowPrivatePlaintext('127.0.0.1', { LOLA_INTERNAL_PLAINTEXT: 'true' })).toBe(false);
    expect(allowPrivatePlaintext('169.254.10.10', { LOLA_INTERNAL_PLAINTEXT: 'true' })).toBe(false);
    expect(allowPrivatePlaintext('fe80::1', { LOLA_INTERNAL_PLAINTEXT: 'true' })).toBe(false);
  });
});
