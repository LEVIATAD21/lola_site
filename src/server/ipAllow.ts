import { BlockList, isIP } from 'node:net';

/**
 * Restrição de origem das rotas administrativas.
 *
 * O servidor de dados vai ficar fora do site, mas não pode ficar aberto: sem
 * esta trava, qualquer um que alcance o endereço privado dele disputaria a chave
 * administrativa contra o limite de tentativas. O padrão é a faixa privada —
 * painel na mesma rede continua funcionando sem configuração, e a internet
 * pública não chega.
 */

/** Loopback, RFC1918, link-local IPv4, ULA e link-local IPv6. */
const DEFAULT_RANGES = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
];

export interface AdminAllowlist {
  /** `true` quando não há restrição (só em `LOLA_ADMIN_ALLOWED_IPS=any`). */
  allowAny: boolean;
  check(address: string | undefined): boolean;
}

function familyOf(address: string): 4 | 6 | 0 {
  const family = isIP(address);
  return family === 4 || family === 6 ? family : 0;
}

/** `::ffff:1.2.3.4` e `1.2.3.4` têm de cair no mesmo balde. */
function normalize(address: string): string[] {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped && isIP(mapped[1]) === 4) return [mapped[1], address];
  return [address];
}

function buildList(entries: string[]): BlockList {
  const list = new BlockList();
  for (const entry of entries) {
    const slash = entry.lastIndexOf('/');
    const address = slash === -1 ? entry : entry.slice(0, slash);
    const family = familyOf(address);
    if (!family) continue;
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (slash === -1) {
      list.addAddress(address, type);
      continue;
    }
    const prefix = Number(entry.slice(slash + 1));
    const max = family === 4 ? 32 : 128;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) continue;
    list.addSubnet(address, prefix, type);
  }
  return list;
}

/**
 * Interpreta `LOLA_ADMIN_ALLOWED_IPS`.
 *
 * - ausente/vazio → faixa privada (padrão seguro);
 * - `any`         → sem restrição, com aviso — só para quem aceita o risco;
 * - lista         → IPs e CIDRs; entrada inválida **derruba a lista inteira**
 *   para a privada em vez de deixar passar o que não foi entendido.
 */
export function resolveAdminAllowlist(raw: string | undefined): AdminAllowlist {
  const value = (raw ?? '').trim();
  if (value.toLowerCase() === 'any') {
    console.warn(
      '[seguranca] LOLA_ADMIN_ALLOWED_IPS=any: as rotas administrativas aceitam qualquer '
      + 'origem que alcance o servidor de dados. Restrinja a rede do painel administrativo.',
    );
    return { allowAny: true, check: () => true };
  }

  const entries = value
    ? value.split(',').map((entry) => entry.trim()).filter(Boolean)
    : [];

  const invalid = entries.filter((entry) => {
    const slash = entry.lastIndexOf('/');
    const address = slash === -1 ? entry : entry.slice(0, slash);
    const family = familyOf(address);
    if (!family) return true;
    if (slash === -1) return false;
    const prefix = Number(entry.slice(slash + 1));
    const max = family === 4 ? 32 : 128;
    return !Number.isInteger(prefix) || prefix < 0 || prefix > max;
  });

  // Falha para a faixa privada: é o padrão seguro, e um digitaço no ambiente não
  // pode deixar o painel administrativo inacessível sem aviso claro.
  let effective = entries;
  if (!value) {
    effective = [];
  } else if (entries.length === 0 || invalid.length > 0) {
    if (invalid.length > 0) {
      console.error(
        '[seguranca] LOLA_ADMIN_ALLOWED_IPS tem entradas inválidas: '
        + invalid.join(', ') + '. Caindo para a faixa privada padrão.',
      );
    } else {
      console.error(
        '[seguranca] LOLA_ADMIN_ALLOWED_IPS veio sem nenhuma entrada válida. '
        + 'Caindo para a faixa privada padrão.',
      );
    }
    effective = DEFAULT_RANGES;
  }

  const list = buildList(effective.length ? effective : DEFAULT_RANGES);

  return {
    allowAny: false,
    check(address: string | undefined): boolean {
      if (!address) return false;
      for (const candidate of normalize(address)) {
        const family = familyOf(candidate);
        if (!family) continue;
        if (list.check(candidate, family === 4 ? 'ipv4' : 'ipv6')) return true;
      }
      return false;
    },
  };
}
