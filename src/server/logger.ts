import { createHmac } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Como o IP aparece nos logs.
 *
 * IP endereçável é dado pessoal (LGPD, art. 5º, I — identifica pessoa natural
 * quando combinado com outros dados), e o logger registra IP em três eventos.
 * O padrão mascara: preserva o suficiente para reconhecer padrão de tráfego e
 * investigar incidente, sem guardar o endereço completo nem precisar de base
 * legal para retenção.
 */
export type IpLogMode = 'full' | 'mask' | 'hash' | 'off';

let ipLogMode: IpLogMode = 'mask';
let ipHashKey: Buffer | undefined;

/** Lê `LOLA_LOG_IP_MODE`. Valor fora da lista cai no padrão mascarado. */
export function resolveIpLogMode(value: string | undefined): IpLogMode {
  return value === 'full' || value === 'hash' || value === 'off' || value === 'mask'
    ? value
    : 'mask';
}

export function configureIpLogging(mode: IpLogMode, secret?: string): void {
  ipLogMode = mode;
  ipHashKey = mode === 'hash'
    ? createHmac('sha256', secret || 'lola-log-ip-salt')
      .update('ip-log-v1').digest()
    : undefined;
}

function maskIp(ip: string): string {
  // IPv4: mantém a rede, esconde o host. `189.45.x.x` continua mostrando se o
  // tráfego vem do mesmo provedor, sem apontar o assinante.
  const v4 = ip.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (v4) return ip.split('.').slice(0, 2).join('.') + '.x.x';
  // IPv6: mantém os 4 primeiros grupos (geralmente o agregado do provedor).
  const groups = ip.split(':');
  if (groups.length > 2) return groups.slice(0, 4).join(':') + '::x';
  return 'x';
}

/** Endereço tratado para log. `undefined` remove o campo da linha. */
export function loggableIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  switch (ipLogMode) {
    case 'off': return undefined;
    case 'mask': return maskIp(ip);
    case 'hash':
      // HMAC e não hash puro: sem a chave, um dicionário de IPs candidatos não
      // confirma nada. 12 hex bastam para agrupar sem identificar.
      return 'ip:' + createHmac('sha256', ipHashKey!).update(ip).digest('hex').slice(0, 12);
    default: return ip;
  }
}

/**
 * Log estruturado sem dependência externa.
 *
 * VUL-08: a aplicação tinha três `console.*` no total e o tratador de erro
 * descartava o motivo real (`console.error('Erro interno na API.')`), o que
 * impedia investigar incidentes e atendia mal a obrigação de registro do art. 46
 * da LGPD.
 *
 * Regras fixas: nunca registrar corpo de requisição, cabeçalho de autenticação,
 * chave administrativa, dados pessoais do cliente ou conteúdo do assistente.
 */
function emit(level: LogLevel, event: string, fields: Record<string, unknown>) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, '_')}`);
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${event}${parts.length ? ' ' + parts.join(' ') : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  emit(level, event, fields);
}

export interface RequestLoggerOptions {
  /** Limite de linhas por minuto; acima disso as linhas são suprimidas e contadas. */
  maxPerMinute?: number;
}

/**
 * Caminho de no máximo 200 caracteres para log.
 *
 * `express.json({limit:'16kb'})` deixa chegar um `originalUrl` enorme; sem teto
 * isso vira 16 KB por linha, e poucas requisições já enchem o disco. O corte
 * acontece ANTES de qualquer teste de prefixo, então um path longo também não
 * passa pela checagem `startsWith('/api/')` disfarçado.
 */
const MAX_LOG_PATH = 200;

export function truncatePath(rawPath: string | undefined): string {
  const value = rawPath || '/';
  return value.length > MAX_LOG_PATH ? value.slice(0, MAX_LOG_PATH) + '…' : value;
}

/**
 * Registra uma linha por requisição de API ao finalizar.
 *
 * Só `/api/*`: arquivos estáticos e o HTML da vitrine multiplicariam o volume.
 * O volume é limitado por janela para que um flood de requisições não consiga
 * encher o disco com logs — a supressão própria vira evento em log.
 */
export function createRequestLogger(options: RequestLoggerOptions = {}): RequestHandler {
  const maxPerMinute = Math.max(60, options.maxPerMinute ?? 600);
  let windowStart = Date.now();
  let written = 0;
  let suppressed = 0;

  return (req, res, next) => {
    // Capturado AGORA e a partir de `originalUrl`: `req.path` é avaliado de
    // forma preguiçosa sobre `req.url`, que middlewares montados aparajam e nem
    // sempre restauram (no 404 do `/api` ele ficaria `/admin/pre-pedidos`).
    // A query string fica de fora de propósito — filtros podem carregar dados
    // digitados pela cliente.
    const requestPath = truncatePath(req.originalUrl.split('?')[0] || '/');
    if (!requestPath.startsWith('/api/')) return next();
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const now = Date.now();
      if (now - windowStart >= 60_000) {
        if (suppressed > 0) emit('warn', 'http.logs_suppressed', { count: suppressed, windowMs: now - windowStart });
        windowStart = now;
        written = 0;
        suppressed = 0;
      }
      if (written >= maxPerMinute) {
        suppressed += 1;
        return;
      }
      written += 1;
      emit('info', 'http.request', {
        ip: loggableIp(req.ip),
        method: req.method,
        path: requestPath,
        status: res.statusCode,
        ms: (Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(1),
      });
    });

    next();
  };
}

/** Resultado de uma tentativa administrativa. Nunca registra a chave em si. */
export type AdminAccessOutcome = 'allow' | 'denied' | 'not_configured';

/** Caminho sem query string e truncado para log, capturado de `originalUrl` (nunca mutado). */
export function safePath(req: Pick<Request, 'originalUrl'>): string {
  return truncatePath(req.originalUrl.split('?')[0] || '/');
}

export function auditAdminAccess(req: Request, outcome: AdminAccessOutcome, reason?: string) {
  emit(outcome === 'allow' ? 'info' : 'warn', 'admin.access', {
    ip: loggableIp(req.ip),
    method: req.method,
    path: safePath(req),
    outcome,
    reason,
  });
}
