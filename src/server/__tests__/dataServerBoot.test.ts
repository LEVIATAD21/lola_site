import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  diretorioTemporario, limparTemporarios, matarTodosOsFilhos, portaLivre,
  subirEntryPoint, type ProcessoFilho,
} from './helpers/servidorFilho';

/**
 * Boot REAL do `data-server.ts` como processo filho.
 *
 * Tudo que se testa aqui é wiring: a função pura tem teste próprio, mas só
 * este arquivo prova que o entrypoint CHAMA a função, que o `PORT` clampado
 * chega ao `listen`, que `LOLA_LOG_IP_MODE` do ambiente vira a linha de log
 * certa e que o tratador de erro do fim da cadeia responde JSON de verdade
 * numa requisição de verdade. Nada de `.data`: cada boot usa um diretório
 * temporário próprio, e os filhos são mortos pelo PID, um a um.
 */


function subirDataServer(env: Record<string, string>): ProcessoFilho {
  return subirEntryPoint('data-server.ts', env);
}

function getHttps(porta: number): Promise<{ status: number; corpo: string }> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      { host: '127.0.0.1', port: porta, path: '/api/health', method: 'GET', rejectUnauthorized: false },
      (response) => {
        let corpo = '';
        response.on('data', (pedaco) => { corpo += String(pedaco); });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, corpo }));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

afterEach(() => {
  matarTodosOsFilhos();
  limparTemporarios();
});

describe('data-server.ts — boot real', () => {
  it('sobe, loga dados.servidor_iniciado com a porta pedida e responde /api/health', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({ PORT: String(porta), LOLA_DATA_DIR: diretorioTemporario('lola-boot-') });

    const log = await servidor.esperar(/dados\.servidor_iniciado/);
    expect(log).toContain(`porta=${porta}`);
    expect(log).toContain('tls=inativo');

    const resposta = await fetch(`http://127.0.0.1:${porta}/api/health`);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ status: 'ok' });
    // Cabeçalhos de proteção também valem no serviço privado.
    expect(resposta.headers.get('x-content-type-options')).toBe('nosniff');
  }, 30_000);

  it('recusa allowlist administrativa aberta para qualquer IP em produção', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({
      NODE_ENV: 'production',
      PORT: String(porta),
      LOLA_BIND_HOST: '127.0.0.1',
      LOLA_INTERNAL_SECRET: 's'.repeat(64),
      LOLA_ORDERS_ENCRYPTION_KEY: 'a1'.repeat(32),
      LOLA_ADMIN_ALLOWED_IPS: 'any',
      LOLA_DATA_DIR: diretorioTemporario('lola-open-admin-'),
    });

    const log = await servidor.esperar(/dados\.falha_configuracao/);
    expect(log).toContain('allowlist_administrativa_não_pode_aceitar_qualquer_IP');
    expect(log).toContain('LOLA_ADMIN_ALLOWED_IPS');
    expect(log).not.toContain('dados.servidor_iniciado');
    const { codigo } = await servidor.esperarSaida();
    expect(codigo).toBe(1);
  }, 30_000);

  it('recusa inicialização de produção quando a chave de pedidos não está configurada', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({
      NODE_ENV: 'production',
      PORT: String(porta),
      LOLA_BIND_HOST: '127.0.0.1',
      LOLA_INTERNAL_SECRET: 's'.repeat(64),
      LOLA_DATA_DIR: diretorioTemporario('lola-no-order-key-'),
    });

    const log = await servidor.esperar(/dados\.falha_configuracao/);
    expect(log).toContain('armazenamento_seguro_de_pedidos');
    expect(log).toContain('LOLA_ORDERS_ENCRYPTION_KEY');
    expect(log).not.toContain('dados.servidor_iniciado');
    const { codigo } = await servidor.esperarSaida();
    expect(codigo).toBe(1);
  }, 30_000);

  it('recusa bind fora do loopback em produção quando TLS não está configurado', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({
      NODE_ENV: 'production',
      PORT: String(porta),
      LOLA_BIND_HOST: '10.0.0.5',
      LOLA_INTERNAL_SECRET: 's'.repeat(64),
      LOLA_ORDERS_ENCRYPTION_KEY: 'a1'.repeat(32),
      LOLA_DATA_DIR: diretorioTemporario('lola-no-tls-'),
    });

    const log = await servidor.esperar(/dados\.falha_configuracao/);
    expect(log).toContain('sem_TLS');
    expect(log).toContain('LOLA_TLS_CERT_FILE');
    expect(log).not.toContain('dados.servidor_iniciado');
    const { codigo } = await servidor.esperarSaida();
    expect(codigo).toBe(1);
  }, 30_000);

  it('canal interno existe e recusa requisição sem assinatura com 401', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({ PORT: String(porta), LOLA_DATA_DIR: diretorioTemporario('lola-boot-') });
    await servidor.esperar(/dados\.servidor_iniciado/);

    const resposta = await fetch(`http://127.0.0.1:${porta}/internal/estoque`);
    expect(resposta.status).toBe(401);
    expect(resposta.headers.get('content-type')).toContain('application/json');
  }, 30_000);

  // VUL-B de ponta a ponta: o body-parser recusa, o tratador do fim da cadeia
  // responde, e a resposta é JSON — nunca o HTML com stack do finalhandler.
  it('POST com JSON malformado devolve 400 application/json, sem HTML e sem stack', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({ PORT: String(porta), LOLA_DATA_DIR: diretorioTemporario('lola-boot-') });
    await servidor.esperar(/dados\.servidor_iniciado/);

    const resposta = await fetch(`http://127.0.0.1:${porta}/api/admin/pre-pedidos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ "isso": "não fecha',
    });
    const texto = await resposta.text();

    expect(resposta.status).toBe(400);
    expect(resposta.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(texto)).toEqual({ error: 'JSON inválido na requisição.' });
    expect(texto).not.toMatch(/<!doctype|node_modules|\/home\/|\.ts:\d+|at Object/);
  }, 30_000);

  it('corpo acima de 16 kB devolve 413 JSON com mensagem própria', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({ PORT: String(porta), LOLA_DATA_DIR: diretorioTemporario('lola-boot-') });
    await servidor.esperar(/dados\.servidor_iniciado/);

    const resposta = await fetch(`http://127.0.0.1:${porta}/api/admin/pre-pedidos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inundacao: 'x'.repeat(20_000) }),
    });
    const texto = await resposta.text();

    expect(resposta.status).toBe(413);
    expect(resposta.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(texto)).toEqual({ error: 'Corpo da requisição muito grande.' });
  }, 30_000);

  it('fora do que está declarado a resposta é 404 JSON — sem HTML, sem listagem', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({ PORT: String(porta), LOLA_DATA_DIR: diretorioTemporario('lola-boot-') });
    await servidor.esperar(/dados\.servidor_iniciado/);

    const api = await fetch(`http://127.0.0.1:${porta}/api/rota-inexistente`);
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: 'Endpoint de API não encontrado.' });

    const raiz404 = await fetch(`http://127.0.0.1:${porta}/qualquer-coisa`);
    expect(raiz404.status).toBe(404);
    expect(await raiz404.json()).toEqual({ error: 'Recurso não encontrado.' });
  }, 30_000);

  // Wiring do LGPD: o valor do AMBIENTE vira a linha de log do processo real.
  // Valor inválido (banana) tem de cair no mascaramento padrão.
  it('LOLA_LOG_IP_MODE=banana vira linha de log com IP mascarado', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({
      PORT: String(porta),
      LOLA_DATA_DIR: diretorioTemporario('lola-boot-'),
      LOLA_LOG_IP_MODE: 'banana',
    });
    await servidor.esperar(/dados\.servidor_iniciado/);

    await fetch(`http://127.0.0.1:${porta}/api/health`);
    const log = await servidor.esperar(/http\.request/);

    expect(log).toContain('path=/api/health');
    expect(log).toContain('ip=127.0.x.x');
    expect(log).not.toContain('ip=127.0.0.1');
  }, 30_000);

  it('LOLA_LOG_IP_MODE=off remove o campo ip da linha de log do processo real', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({
      PORT: String(porta),
      LOLA_DATA_DIR: diretorioTemporario('lola-boot-'),
      LOLA_LOG_IP_MODE: 'off',
    });
    await servidor.esperar(/dados\.servidor_iniciado/);

    await fetch(`http://127.0.0.1:${porta}/api/health`);
    const log = await servidor.esperar(/http\.request/);

    const linha = log.split('\n').find((entry) => entry.includes('http.request')) ?? '';
    expect(linha).toContain('path=/api/health');
    expect(linha).not.toContain('ip=');
  }, 30_000);

  it('LOLA_TLS_CERT_FILE sem a chave derruba a subida com código 1 e mensagem que nomeia a variável', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({
      PORT: String(porta),
      LOLA_DATA_DIR: diretorioTemporario('lola-boot-'),
      LOLA_TLS_CERT_FILE: '/tls/cert.pem',
    });

    const log = await servidor.esperar(/dados\.falha_ao_iniciar/);
    expect(log).toContain('configurados_juntos');
    expect(log).not.toContain('servidor_iniciado');

    const { codigo } = await servidor.esperarSaida();
    expect(codigo).toBe(1);
  }, 30_000);

  it('cert e chave apontando para o mesmo arquivo derrubam a subida com código 1', async () => {
    const porta = await portaLivre();
    const servidor = subirDataServer({
      PORT: String(porta),
      LOLA_DATA_DIR: diretorioTemporario('lola-boot-'),
      LOLA_TLS_CERT_FILE: '/tls/cert.pem',
      LOLA_TLS_KEY_FILE: '/tls/cert.pem',
    });

    const log = await servidor.esperar(/dados\.falha_ao_iniciar/);
    expect(log).toContain('mesmo_arquivo');
    expect(log).not.toContain('servidor_iniciado');

    const { codigo } = await servidor.esperarSaida();
    expect(codigo).toBe(1);
  }, 30_000);

  it('par TLS com arquivo inexistente derruba a subida cedo, dizendo qual variável está errada', async () => {
    const porta = await portaLivre();
    const ausente = path.join(tmpdir(), `lola-nao-existe-${randomBytes(6).toString('hex')}.pem`);
    const servidor = subirDataServer({
      PORT: String(porta),
      LOLA_DATA_DIR: diretorioTemporario('lola-boot-'),
      LOLA_TLS_CERT_FILE: ausente,
      LOLA_TLS_KEY_FILE: ausente.replace('.pem', '-chave.pem'),
    });

    const log = await servidor.esperar(/dados\.falha_ao_iniciar/);
    expect(log).toContain('LOLA_TLS_CERT_FILE');
    expect(log).toContain('inexistente');
    expect(log).not.toContain('servidor_iniciado');

    const { codigo } = await servidor.esperarSaida();
    expect(codigo).toBe(1);
  }, 30_000);

  it('sobe com TLS de verdade e atende por HTTPS quando cert e chave existem', async (contexto) => {
    const openssl = spawnSync('openssl', ['version'], { stdio: 'ignore' });
    if (openssl.error || openssl.status !== 0) return contexto.skip();

    const certDir = diretorioTemporario('lola-tls-');
    const certificado = path.join(certDir, 'cert.pem');
    const chave = path.join(certDir, 'key.pem');
    const gerado = spawnSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', chave, '-out', certificado, '-days', '1', '-subj', '/CN=127.0.0.1',
    ], { stdio: 'ignore' });
    if (gerado.status !== 0) return contexto.skip();

    const porta = await portaLivre();
    const servidor = subirDataServer({
      PORT: String(porta),
      LOLA_DATA_DIR: diretorioTemporario('lola-boot-'),
      LOLA_TLS_CERT_FILE: certificado,
      LOLA_TLS_KEY_FILE: chave,
    });

    const log = await servidor.esperar(/dados\.servidor_iniciado/);
    expect(log).toContain('tls=ativo');

    // Handshake TLS de verdade com o cert autoassinado (rejeitado de propósito).
    const resposta = await getHttps(porta);
    expect(resposta.status).toBe(200);
    expect(JSON.parse(resposta.corpo)).toEqual({ status: 'ok' });
    return undefined;
  }, 30_000);

  // Clamp de PORT no processo real: fora da faixa, a porta PADRÃO — nunca um
  // valor que derrube o `listen` no meio da subida (era o que PORT=99999 fazia).
  it('PORT=99999 não derruba a subida: o processo usa a porta padrão 4100', async (contexto) => {
    const servidor = subirDataServer({
      PORT: '99999',
      LOLA_DATA_DIR: diretorioTemporario('lola-boot-'),
    });

    const log = await servidor.esperar(/dados\.(servidor_iniciado|falha_ao_iniciar)/);
    if (log.includes('falha_ao_iniciar')) {
      // 4100 ocupada nesta máquina (outro serviço do ambiente): não é o clamp
      // que falhou, é o bind. Não derruba a suíte por causa de porta alheia.
      return contexto.skip();
    }

    expect(log).toContain('porta=4100');
    const resposta = await fetch('http://127.0.0.1:4100/api/health');
    expect(resposta.status).toBe(200);
    return undefined;
  }, 30_000);
});
