import type { ErrorRequestHandler } from 'express';
import { log, loggableIp, safePath } from './logger';

/**
 * Tratador de erro no FIM da cadeia dos dois entrypoints (VUL-B).
 *
 * Antes, um erro lançado por qualquer middleware — body-parser, estático,
 * middlewares do Vite — escapava para o `finalhandler` do Express, que em
 * não-produção devolve **HTML com a stack trace completa**: arquivo, linha e
 * trecho de código na resposta. Aqui o contrato é fixo:
 *
 *  - a resposta é SEMPRE `application/json` com uma mensagem genérica;
 *  - `413` (corpo acima do limite) e `400` (JSON malformado) mantêm o status;
 *  - qualquer outro erro vira `500` genérico; o motivo real só vai para o log
 *    do operador (VUL-08) — a resposta nunca revela caminho, função ou
 *    mensagem de erro interno.
 *
 * A função é exportada para o teste exercitar o tratador de verdade, não uma
 * cópia. O que NÃO se testa aqui: a posição dele na cadeia (registrado por
 * último em `server.ts` e `data-server.ts`).
 */
export function createJsonErrorHandler(): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const candidate = error as { status?: number };
    const status = candidate?.status === 413 ? 413 : candidate?.status === 400 ? 400 : 500;
    if (status === 500) {
      log('error', 'http.erro_nao_tratado', {
        ip: loggableIp(req.ip), method: req.method, path: safePath(req),
        motivo: error instanceof Error ? error.message : String(error),
      });
    }
    res.status(status).json({
      error: status === 413 ? 'Corpo da requisição muito grande.' :
        status === 400 ? 'JSON inválido na requisição.' : 'Erro interno do servidor.',
    });
  };
}
