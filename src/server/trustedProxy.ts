import { isIP } from 'node:net';
import { log } from './logger';

/**
 * Interpreta LOLA_TRUSTED_PROXY de forma explícita e restrita.
 *
 * Sem proxy declarado, `req.ip` é o endereço do socket e `X-Forwarded-For` é
 * ignorado — isso impede que um atacante fabrique IPs novos para escapar do
 * rate limit. Quando a aplicação fica atrás de um balanceador, porém, todos os
 * clientes passam a compartilhar o mesmo bucket e um único atacante derruba o
 * checkout de todo mundo (VUL-06). A solução é declarar exatamente quais
 * proxies são confiáveis, nunca "confiar em todos".
 */
const NAMED_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);
const HOPS = /^\d{1,2}$/;
/** Teto de saltos declaráveis: acima disso a cadeia de proxies não é rastreável. */
const MAX_HOPS = 10;

export type TrustProxyValue = string[] | number | undefined;

/**
 * Aceita apenas endereços que `net.isIP` valida, com prefixo CIDR dentro do
 * tamanho da família (32 para IPv4, 128 para IPv6) e as faixas nomeadas que o
 * proxy-addr reconhece. Qualquer coisa fora disso é recusada para que o Express
 * não lance TypeError no boot.
 */
function isAddressOrCidr(entry: string): boolean {
  if (NAMED_RANGES.has(entry.toLowerCase())) return true;

  const slash = entry.lastIndexOf('/');
  const address = slash === -1 ? entry : entry.slice(0, slash);
  const prefix = slash === -1 ? null : entry.slice(slash + 1);
  const family = isIP(address);
  if (!family) return false;
  if (prefix === null) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 6 ? 128 : 32);
}

/**
 * Returns the value for Express `trust proxy`, or `undefined` when the variable
 * is absent or unsafe. `true`/`false` are rejected on purpose: `true` faria o
 * Express confiar em qualquer X-Forwarded-For, transformando o rate limit em
 * algo que o atacante contorna a cada requisição.
 */
export function resolveTrustProxy(raw?: string | null): TrustProxyValue {
  const value = (raw ?? '').trim();
  if (!value) return undefined;

  if (value === 'true') {
    log('error', 'config.proxy_rejeitado', {
      variavel: 'LOLA_TRUSTED_PROXY',
      motivo: 'confianca_total_em_x-forwarded-for',
      valor: 'true',
      impacto: 'rate_limit_sem_confianca_em_proxy',
      acao: 'informe_ips_ou_cidrs_dos_proxies_ex_127.0.0.1,10.0.0.0/8',
    });
    return undefined;
  }
  if (value === 'false') return undefined;

  if (HOPS.test(value)) {
    const hops = Number(value);
    if (hops <= MAX_HOPS) return hops;
    log('error', 'config.proxy_rejeitado', {
      variavel: 'LOLA_TRUSTED_PROXY',
      motivo: 'saltos_acima_do_limite',
      valor: hops,
      limite: MAX_HOPS,
      impacto: 'rate_limit_sem_confianca_em_proxy',
      acao: 'informe_no_maximo_10_saltos',
    });
    return undefined;
  }

  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length) return undefined;
  const invalid = entries.filter((entry) => !isAddressOrCidr(entry));
  if (invalid.length) {
    log('error', 'config.proxy_rejeitado', {
      variavel: 'LOLA_TRUSTED_PROXY',
      motivo: 'entradas_invalidas',
      entradas: invalid.join(',').slice(0, 300),
      total: invalid.length,
      impacto: 'rate_limit_sem_confianca_em_proxy',
      acao: 'use_ips_ou_cidrs_validos',
    });
    return undefined;
  }
  return entries;
}
