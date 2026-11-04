import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import express from 'express';
import dotenv from 'dotenv';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalDataPlane } from './src/server/dataPlane';
import { createInternalRouter } from './src/server/internalRoutes';
import { createAdminRouter } from './src/server/adminRoutes';
import { resolveAdminAllowlist } from './src/server/ipAllow';
import { configureIpLoggingFromEnv, createRequestLogger, log } from './src/server/logger';
import { createSecurityHeadersMiddleware } from './src/server/securityHeaders';
import { createJsonErrorHandler } from './src/server/httpError';
import { allowPrivatePlaintext, envInt, resolveTlsConfig } from './src/server/envConfig';
import { INTERNAL_SECRET_MIN_LENGTH } from './src/server/internalAuth';

/**
 * Servidor de dados — a metade privada da loja.
 *
 * Ele é quem tem os arquivos: estoque, pré-pedidos cifrados e a chave AES-256-GCM.
 * O site público não tem nada disso; só conversa com este processo por um canal
 * assinado. Por isso este processo é deliberadamente pequeno e fechado:
 *
 *  - **não serve a vitrine**, nem estático, nem SPA, nem o Vite;
 *  - **não tem CORS**: o painel administrativo fala por trás do próprio backend,
 *    que é quem guarda a chave — ela nunca existe dentro de um navegador;
 *  - **bind em loopback por padrão**; em produção, endereço coringa é recusado
 *    a menos que quem opere declare explicitamente;
 *  - **não sobe sem segredo interno** — sem LOLA_INTERNAL_SECRET não existe
 *    canal e não existe serviço.
 *
 * A chave de cifra dos pedidos e a chave administrativa só vivem aqui. Este é o
 * ganho concreto da separação: comprometer o servidor público não entrega nem a
 * base nem as chaves.
 */

dotenv.config({ quiet: true });

function fail(motivo: string, acao: string): never {
  log('error', 'dados.falha_configuracao', { motivo, acao });
  process.exit(1);
}

async function startDataService(): Promise<void> {
  const production = process.env.NODE_ENV === 'production';

  // O canal interno não existe sem segredo. Um segredo curto é um segredo
  // fraco, então a recusa é total: nada é montado pela metade.
  const secret = (process.env.LOLA_INTERNAL_SECRET ?? '').trim();
  if (secret.length < INTERNAL_SECRET_MIN_LENGTH) {
    fail(
      `LOLA_INTERNAL_SECRET ausente ou com menos de ${INTERNAL_SECRET_MIN_LENGTH} caracteres`,
      'gere um com `openssl rand -hex 32` e use o mesmo valor no site público',
    );
  }

  const bindHost = (process.env.LOLA_BIND_HOST ?? '').trim() || '127.0.0.1';
  const wildcard = bindHost === '0.0.0.0' || bindHost === '::' || bindHost === '[::]';
  if (wildcard && production && process.env.LOLA_ALLOW_WILDCARD_BIND !== 'true') {
    fail(
      'LOLA_BIND_HOST aponta para endereço coringa em produção',
      'aponte para o IP privado desta máquina (ex.: 10.0.0.5) ou declare '
      + 'LOLA_ALLOW_WILDCARD_BIND=true se o container não publicar a porta',
    );
  }
  if (!wildcard && !isIP(bindHost)) {
    log('warn', 'dados.bind_por_hostname', {
      host: bindHost,
      aviso: 'endereços coringa e hostnames não dizem qual rede é esta',
    });
  }

  const PORT = envInt('PORT', 4100, 1, 65_535);
  configureIpLoggingFromEnv(process.env);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const DATA_DIR = path.resolve(process.env.LOLA_DATA_DIR || path.join(__dirname, '.data'));

  const plane = createLocalDataPlane({
    dataDir: DATA_DIR,
    production,
    reservationTtlMs: envInt('LOLA_RESERVATION_TTL_MS', 1_800_000, 60_000, 7 * 24 * 60 * 60_000),
    encryptionKey: process.env.LOLA_ORDERS_ENCRYPTION_KEY,
    keyFilePath: process.env.LOLA_ORDERS_KEY_FILE,
    // Rastreamento de envio: chave própria; vazia, reutiliza a de pedidos —
    // mesmo fallback do server.ts no modo embutido.
    trackingEncryptionKey: process.env.LOLA_TRACKING_ENCRYPTION_KEY,
    // LGPD, art. 15, II: retenção dos pré-pedidos em dias; 0 desliga por opt-in.
    retentionDays: envInt('LOLA_ORDER_RETENTION_DAYS', 90, 0, 3650),
    // VUL-C: aqui `meta.ip` é SEMPRE o IP da vitrine — este processo não enxerga
    // a cliente final. O teto por origem ficaria valendo por loja, não por
    // cliente, e derrubaria o checkout real. Desligado por padrão; o teto global
    // de pré-reservas simultâneas continua valendo e é o que limita o griefing.
    holdLimits: {
      maxActiveHolds: envInt('LOLA_MAX_ACTIVE_HOLDS', 500, 10, 100_000),
      maxHoldsPerOwner: envInt('LOLA_MAX_HOLDS_PER_ORIGIN', 0, 0, 10_000),
    },
  });

  // Produção não pode anunciar serviço saudável com pedidos ou rastreamento
  // desativados por ausência de chave. Falha na inicialização em vez de aceitar
  // tráfego enquanto operações essenciais respondem 503.
  if (production && (!plane.orders.ready || !plane.tracking.ready)) {
    fail(
      'armazenamento seguro de pedidos/rastreamento indisponível em produção',
      'configure LOLA_ORDERS_ENCRYPTION_KEY (32 bytes em hexadecimal) e, se separado, LOLA_TRACKING_ENCRYPTION_KEY',
    );
  }

  const allowlist = resolveAdminAllowlist(process.env.LOLA_ADMIN_ALLOWED_IPS);
  if (production && allowlist.allowAny) {
    fail(
      'allowlist administrativa não pode aceitar qualquer IP em produção',
      'configure LOLA_ADMIN_ALLOWED_IPS com IPs ou CIDRs privados específicos; o valor any é proibido',
    );
  }

  const app = express();
  app.disable('x-powered-by');
  // Sem `trust proxy`: este processo fica direto na rede privada. Quem estiver
  // atrás de um proxy tem de listar o IP do proxy na allowlist administrativa —
  // aceitar X-Forwarded-For aqui transformaria a origem da allowlist em algo que
  // o chamador escolhe.
  app.use(createSecurityHeadersMiddleware({
    production,
    // HSTS só faz sentido se este origin for servido por TLS. Por padrão o
    // serviço é privado e sem TLS, então fica opt-in.
    enableHsts: process.env.LOLA_HSTS_ENABLED === 'true',
    includeSubDomains: process.env.LOLA_HSTS_INCLUDE_SUBDOMAINS === 'true',
  }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(createRequestLogger());

  // 1. Saúde — sem autenticação, só porque a rota devolve nada além do estado.
  //    Monitor de uptime precisa de um alvo que não exija segredo.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // 2. Canal interno do site público. Vem ANTES de `express.json` porque a
  //    assinatura cobre os bytes crus do corpo, não um objeto re-serializado.
  app.use('/internal', createInternalRouter({
    plane,
    secret,
    skewMs: envInt('LOLA_INTERNAL_SKEW_MS', 30_000, 5_000, 300_000),
    maxNonces: envInt('LOLA_INTERNAL_MAX_NONCES', 200_000, 1_000, 5_000_000),
    perMinute: envInt('LOLA_INTERNAL_PER_MINUTE', 10_000, 60, 1_000_000),
  }));

  // 3. Corpo JSON só para as rotas administrativas.
  app.use(express.json({ limit: '16kb' }));

  // 4. Painel administrativo: chave + allowlist de origem.
  app.use('/api', createAdminRouter({ plane, allowlist }));

  // Diagnóstico de subida: as rotas administrativas respondem 401 uniforme
  // quando não há chave (VUL-11 — certo), mas quem opera precisa saber NA
  // LARGADA que o painel vai recusar tudo, e não descobrir testando.
  const adminKey = (process.env.LOLA_ADMIN_API_KEY ?? '').trim();
  if (adminKey.length < 32) {
    log('warn', 'admin.desativado', {
      motivo: process.env.LOLA_ADMIN_API_KEY?.trim() ? 'LOLA_ADMIN_API_KEY curta' : 'LOLA_ADMIN_API_KEY ausente',
      acao: 'rotas administrativas recusam qualquer chave com resposta 401 uniforme',
    });
  }

  // 5. Fora do que está declarado, não existe nada. Sem HTML, sem listagem.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint de API não encontrado.' });
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'Recurso não encontrado.' });
  });

  // Tratador de erro por último na cadeia: qualquer erro lançado acima —
  // inclusive do body-parser — vira JSON genérico, nunca HTML com stack (VUL-B).
  app.use(createJsonErrorHandler());

  // TLS é obrigatório fora do loopback em produção. A única exceção é uma
  // rede privada isolada declarada por opt-in duplo, IP RFC1918/ULA, HMAC
  // obrigatório e porta não publicada. HMAC não cifra o tráfego: o aviso no log
  // deixa esse risco explícito. Para qualquer rede fora desse limite, configure
  // LOLA_TLS_CERT_FILE e LOLA_TLS_KEY_FILE juntos.
  // A validação TLS é função pura em envConfig.ts; a política de texto puro
  // privado também é testada isoladamente.
  const tls = resolveTlsConfig(process.env);
  if ('error' in tls) throw new Error(tls.error);
  const { enabled: tlsEnabled, certFile: tlsCertFile, keyFile: tlsKeyFile } = tls;

  const loopbackBind = bindHost === '::1' || (isIP(bindHost) === 4 && bindHost.startsWith('127.'));
  const privatePlaintext = !tlsEnabled && allowPrivatePlaintext(bindHost, process.env);
  if (!tlsEnabled && !loopbackBind && !privatePlaintext) {
    if (production) {
      fail(
        'servidor de dados em produção não pode escutar fora do loopback sem TLS ou opt-in privado explícito',
        'configure LOLA_TLS_CERT_FILE e LOLA_TLS_KEY_FILE; a exceção exige LOLA_INTERNAL_PLAINTEXT=true, LOLA_PRIVATE_NETWORK_ISOLATED=true, IP RFC1918/ULA e HMAC obrigatório',
      );
    }
    log('warn', 'dados.sem_tls_em_endereco_publico', {
      bind: bindHost,
      aviso: 'a_chave_administrativa_e_os_dados_dos_clientes_transitam_em_claro',
      acao: 'configure LOLA_TLS_CERT_FILE e LOLA_TLS_KEY_FILE ou restrinja o bind a 127.0.0.1',
    });
  }
  if (privatePlaintext) {
    log('warn', 'dados.texto_puro_rede_privada_optin', {
      bind: bindHost,
      aviso: 'HMAC protege autenticidade_e_integridade_mas_nao_cifra_os_dados',
      acao: 'mantenha a rede Docker internal true e a porta do data-server sem publicação; TLS é preferível',
    });
  }

  const onListening = () => {
    log('info', 'dados.servidor_iniciado', {
      porta: PORT,
      bind: bindHost,
      tls: tlsEnabled ? 'ativo' : 'inativo',
      ambiente: production ? 'production' : 'development',
      canalInterno: 'ativo',
      origemAdministrativa: allowlist.allowAny ? 'qualquer' : 'restrita',
      pedidosCifrados: plane.orders.ready ? 'ativo' : 'desativado',
      dados: DATA_DIR,
    });
  };

  // `app.listen({ cert, key })` NÃO liga TLS: o Express sempre monta um
  // `http.Server`, e `cert`/`key` não são opção de `listen` — seriam ignorados,
  // o tráfego seguiria em claro e o log continuaria dizendo `tls=ativo`. O
  // servidor tem que ser criado à mão para o socket falar TLS de verdade.
  const server = tlsEnabled
    ? createHttpsServer(
      { cert: readFileSync(tlsCertFile), key: readFileSync(tlsKeyFile), minVersion: 'TLSv1.2' },
      app,
    )
    : createHttpServer(app);
  server.listen(PORT, bindHost, onListening);
}

startDataService().catch((error: unknown) => {
  log('error', 'dados.falha_ao_iniciar', {
    motivo: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
