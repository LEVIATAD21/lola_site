import type { Request, RequestHandler } from 'express';

export type LogLevel = 'info' | 'warn' | 'error';

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
    const requestPath = req.originalUrl.split('?')[0] || '/';
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
        ip: req.ip,
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

/** Caminho sem query string, capturado de `originalUrl` (nunca mutado). */
export function safePath(req: Pick<Request, 'originalUrl'>): string {
  return req.originalUrl.split('?')[0] || '/';
}

export function auditAdminAccess(req: Request, outcome: AdminAccessOutcome, reason?: string) {
  emit(outcome === 'allow' ? 'info' : 'warn', 'admin.access', {
    ip: req.ip,
    method: req.method,
    path: safePath(req),
    outcome,
    reason,
  });
}
