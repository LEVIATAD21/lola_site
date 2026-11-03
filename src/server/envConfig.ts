import { existsSync } from 'node:fs';
import { isIP } from 'node:net';

/**
 * Guardas de configuração de ambiente — funções puras, testáveis sem subir
 * nenhum servidor.
 *
 * Antes estas validações viviam INLINE dentro de `startDataService()` (TLS) e
 * `startServer()` (PORT), logo antes do `listen`: impossível exercitar o
 * caminho de falha sem de fato subir o processo. Um `PORT=99999` ou um
 * `LOLA_TLS_CERT_FILE` órfão só seriam descobertos em produção, quando o
 * processo morre no meio da subida. Aqui a regra é função exportada, com
 * teste — e os dois entrypoints consomem exatamente esta implementação.
 */

export type Env = Record<string, string | undefined>;

/**
 * Lê um inteiro do ambiente com faixa segura; fora da faixa, usa o padrão.
 *
 * `Number('')` é 0 e `Number(undefined)` é `NaN`, então variável ausente ou
 * vazia cai no padrão sem exceção. Só inteiro seguro DENTRO de [min, max]
 * passa: `PORT=99999`, `PORT=0`, `PORT=-1`, `PORT=abc` e `PORT=1e400` viram o
 * fallback — nunca um valor que derrube o `listen` no meio da subida.
 */
export function envInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
  env: Env = process.env,
): number {
  const value = Number(env[name]);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

/** Configuração TLS resolvida: ou está completa, ou o motivo da recusa. */
export type TlsConfigResult =
  | { enabled: false; certFile: ''; keyFile: '' }
  | { enabled: true; certFile: string; keyFile: string }
  | { error: string };

/**
 * Guarda de TLS do servidor de dados.
 *
 * A regra de segurança: `LOLA_TLS_CERT_FILE` e `LOLA_TLS_KEY_FILE` só valem
 * juntos (um sem o outro não sobe TLS nenhum — e um operador acharia que o
 * canal privado está cifrado quando não está), e não podem apontar para o
 * mesmo arquivo (certificado não é chave privada). Além disso os caminhos
 * precisam EXISTIR: falhar cedo, com mensagem que nomeia a variável, é melhor
 * do que morrer com ENOENT no `readFileSync` lá na hora de criar o socket.
 *
 * `fileExists` é injetável só para o teste não depender do filesystem; em
 * produção o padrão é `existsSync`.
 */
export function resolveTlsConfig(
  env: Env = process.env,
  fileExists: (path: string) => boolean = existsSync,
): TlsConfigResult {
  const certFile = (env.LOLA_TLS_CERT_FILE || '').trim();
  const keyFile = (env.LOLA_TLS_KEY_FILE || '').trim();

  if (Boolean(certFile) !== Boolean(keyFile)) {
    return {
      error: 'LOLA_TLS_CERT_FILE e LOLA_TLS_KEY_FILE precisam ser configurados juntos: um sem o outro não sobe TLS.',
    };
  }
  if (certFile && certFile === keyFile) {
    return { error: 'LOLA_TLS_CERT_FILE e LOLA_TLS_KEY_FILE não podem apontar para o mesmo arquivo.' };
  }
  if (!certFile) return { enabled: false, certFile: '', keyFile: '' };
  if (!fileExists(certFile)) {
    return { error: `LOLA_TLS_CERT_FILE aponta para arquivo inexistente: ${certFile}` };
  }
  if (!fileExists(keyFile)) {
    return { error: `LOLA_TLS_KEY_FILE aponta para arquivo inexistente: ${keyFile}` };
  }
  return { enabled: true, certFile, keyFile };
}


/**
 * Endereço unicast privado permitido para o canal interno sem TLS quando
 * existe opt-in explícito. Não aceita endereço público, wildcard ou link-local
 * (metadata de cloud). O HMAC continua obrigatório e protege autenticidade/
 * integridade; esta exceção não oferece confidencialidade contra quem já está
 * dentro da rede privada.
 */
export function isPrivateUnicastAddress(host: string): boolean {
  if (isIP(host) === 4) {
    const octets = host.split('.').map(Number);
    const [a, b] = octets;
    return a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
  }
  if (isIP(host) === 6) return /^f[cd]/i.test(host);
  return false;
}

/** Opt-in de texto puro restrito a IP privado unicast, nunca a host público. */
export function allowPrivatePlaintext(bindHost: string, env: Env = process.env): boolean {
  return env.LOLA_INTERNAL_PLAINTEXT === 'true' && isPrivateUnicastAddress(bindHost);
}
