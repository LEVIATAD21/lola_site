import { BlockList, isIP } from 'node:net';
import {
  buildInternalHeaders, INTERNAL_NONCE_HEADER, INTERNAL_RESPONSE_SIG_HEADER,
  verifyInternalResponse,
} from './internalAuth';

/**
 * Cliente do canal interno, usado pelo site público para falar com o servidor
 * de dados.
 *
 * As proteções aqui existem porque o caminho de requisição é o vetor mais
 * produtivo que existe — e porque "confiar no servidor vizinho" é justamente o
 * pressuposto que uma rede comprometida derruba:
 *
 *  - a URL base vem **só do ambiente**, nunca de header, query ou corpo do
 *    visitante: não há como apontar a requisição para outro lugar (anti-SSRF);
 *  - **nenhum redirect** é seguido: um `302` não reescreve o destino;
 *  - **HTTP fora de loopback é recusado** por padrão, porque a requisição carrega
 *    dado pessoal do cliente em claro;
 *  - **faixa link-local é recusada** (`169.254.x.x`, `fe80::`): nenhum servidor
 *    de dados legítimo mora onde ficam os metadata services de nuvem, e um typo
 *    de configuração ali enviaria o canal inteiro — com PII — para o hipervisor;
 *  - **timeout curto e abortável**: servidor de dados pendurado não segura a
 *    requisição da vitrine aberta para sempre;
 *  - a resposta é **assinada pelo vizinho** (nonce + status + corpo) e só então
 *    **limitada em bytes e validada em forma** antes de chegar ao cache: um
 *    corpo forjado, gigante ou malformado vira indisponibilidade, não vaza
 *    para dentro da aplicação.
 */

export const DEFAULT_INTERNAL_TIMEOUT_MS = 3_000;
const MAX_REQUEST_BYTES = 16_000;
const MAX_RESPONSE_BYTES = 64_000;
/** Caminho interno: segmentos simples, sem `..`, sem query, sem esquema. */
const PATH_PATTERN = /^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/;

export interface InternalClientOptions {
  /** URL do servidor de dados, fixada no boot. */
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
  /** Permite `http://` fora de loopback. Só com isto ligado explicitamente. */
  allowPlaintext?: boolean;
}

export interface InternalCallResult {
  /** `true` quando a resposta chegou e é um JSON objeto utilizável. */
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
  /** Motivo da falha de transporte, para log do operador. Nunca vai ao cliente. */
  failure?: string;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  const family = isIP(host);
  if (family === 4) return host === '127.0.0.1' || host.startsWith('127.');
  return false;
}

/**
 * Faixas link-local: `169.254.0.0/16` (IPv4) e `fe80::/10` (IPv6).
 *
 * Todos os metadata services de nuvem (AWS, GCP, Azure) moram em
 * `169.254.169.254`. Um servidor de dados nunca é legítimo nessa faixa, então
 * aceitá-la é só abrir uma porta para o hipervisor: com
 * `LOLA_INTERNAL_PLAINTEXT=true` — legítimo em rede privada — um typo na URL
 * enviaria o canal inteiro, corpos de pedido com PII, direto para o metadata
 * service. Recusar é falha fechada sem custo para deploy legítimo.
 */
const LINK_LOCAL_RANGES = new BlockList();
LINK_LOCAL_RANGES.addSubnet('169.254.0.0', 16, 'ipv4');
LINK_LOCAL_RANGES.addSubnet('fe80::', 10, 'ipv6');

/** Literal IP em faixa link-local, incluindo a forma IPv4-mapeada `::ffff:a.b.c.d`. */
function isLinkLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
  const target = mapped && isIP(mapped[1]) === 4 ? mapped[1] : host;
  const family = isIP(target);
  if (!family) return false;
  return LINK_LOCAL_RANGES.check(target, family === 4 ? 'ipv4' : 'ipv6');
}

async function readCappedBody(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks).toString('utf8');
}

export class InternalClient {
  private readonly endpoint: string;
  private readonly secret: string;
  private readonly timeoutMs: number;

  constructor(options: InternalClientOptions) {
    const secret = (options.secret ?? '').trim();
    if (secret.length < 32) {
      throw new Error('LOLA_INTERNAL_SECRET precisa de pelo menos 32 caracteres.');
    }

    let url: URL;
    try {
      url = new URL(options.baseUrl);
    } catch {
      throw new Error('LOLA_DATA_SERVICE_URL não é uma URL válida.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('LOLA_DATA_SERVICE_URL precisa usar http:// ou https://.');
    }
    // Credencial na URL vaza para logs, histórico e erros de `fetch`.
    if (url.username || url.password) {
      throw new Error('LOLA_DATA_SERVICE_URL não pode conter usuário ou senha.');
    }
    if (url.search || url.hash) {
      throw new Error('LOLA_DATA_SERVICE_URL não pode ter query string ou fragmento.');
    }
    if (isLinkLocalHost(url.hostname)) {
      throw new Error(
        'LOLA_DATA_SERVICE_URL aponta para faixa link-local (169.254.x.x ou fe80::), onde ficam os '
        + 'metadata services de nuvem. Aponte para o IP privado do servidor de dados.',
      );
    }
    const loopback = isLoopbackHost(url.hostname);
    if (url.protocol === 'http:' && !loopback && !options.allowPlaintext) {
      throw new Error(
        'LOLA_DATA_SERVICE_URL usa http:// fora de loopback. O canal interno carrega dado pessoal: '
        + 'use https:// ou declare LOLA_INTERNAL_PLAINTEXT=true se a rede privada for realmente privada.',
      );
    }
    if (url.protocol === 'http:' && !loopback && options.allowPlaintext) {
      console.warn(
        '[seguranca] Canal interno em texto puro fora de loopback (LOLA_INTERNAL_PLAINTEXT=true): '
        + 'a assinatura impede forja e replay, mas não impede leitura de dado pessoal em trânsito.',
      );
    }

    const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    this.endpoint = url.origin + basePath;
    this.secret = secret;
    const timeout = Number(options.timeoutMs ?? DEFAULT_INTERNAL_TIMEOUT_MS);
    this.timeoutMs = Number.isFinite(timeout) ? Math.min(Math.max(Math.floor(timeout), 100), 30_000) : DEFAULT_INTERNAL_TIMEOUT_MS;
  }

  /** Origin do servidor de dados, para log. */
  get target(): string {
    return this.endpoint;
  }

  private buildUrl(path: string): string {
    // Defesa em profundidade: o chamador só passa constantes, e mesmo assim o
    // caminho é rejeitado se tiver `..`, query, esquema ou qualquer byte fora
    // do alfabeto de segmento simples.
    if (!PATH_PATTERN.test(path) || path.split('/').some((segment) => segment === '..')) {
      throw new Error('Caminho interno inválido.');
    }
    return this.endpoint + path;
  }

  async call(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<InternalCallResult> {
    let url: string;
    try {
      url = this.buildUrl(path);
    } catch (error) {
      return { ok: false, status: 0, body: null, failure: (error as Error).message };
    }

    const rawBody = payload === undefined
      ? Buffer.alloc(0)
      : Buffer.from(JSON.stringify(payload), 'utf8');
    if (rawBody.byteLength > MAX_REQUEST_BYTES) {
      return { ok: false, status: 413, body: null, failure: 'corpo_interno_grande_demais' };
    }

    try {
      const headers = buildInternalHeaders(this.secret, { method, path, body: rawBody });
      const nonce = headers[INTERNAL_NONCE_HEADER];
      const response = await fetch(url, {
        method,
        headers,
        body: payload === undefined ? undefined : rawBody,
        // Um redirect reescreveria o destino da assinatura: recusar em vez de seguir.
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const text = await readCappedBody(response, MAX_RESPONSE_BYTES);
      if (text === null) {
        return { ok: false, status: response.status, body: null, failure: 'resposta_grande_demais' };
      }
      if (!text) {
        return { ok: false, status: response.status, body: null, failure: 'resposta_vazia' };
      }

      // Autenticidade antes de forma: a resposta precisa estar assinada com o
      // MESMO nonce desta requisição, sobre o status e os bytes exatos. Sem
      // isso um atacante na rede privada forjava `201` de pré-pedido (corpo
      // com formato público adivinhável) e a vitrine entregava um código de
      // confirmação inexistente. Sem assinatura válida a resposta não passa —
      // falha fechada, com o motivo real só no log do operador.
      const assinaturaValida = verifyInternalResponse(
        this.secret,
        { nonce, status: response.status, body: Buffer.from(text, 'utf8') },
        response.headers.get(INTERNAL_RESPONSE_SIG_HEADER),
      );
      if (!assinaturaValida) {
        return { ok: false, status: response.status, body: null, failure: 'assinatura_resposta_invalida' };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, status: response.status, body: null, failure: 'resposta_nao_json' };
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, status: response.status, body: null, failure: 'resposta_nao_objeto' };
      }
      return { ok: true, status: response.status, body: parsed as Record<string, unknown> };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, status: 0, body: null, failure: reason.slice(0, 200) };
    }
  }
}
