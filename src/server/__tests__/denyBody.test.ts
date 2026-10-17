import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { diretorioTemporario, limparTemporarios, portaLivre } from './helpers/servidorFilho';

/**
 * RT-D-04: o 403 do deny de `server.fs` vinha com o caminho ABSOLUTO do
 * arquivo negado no corpo (ex.: `/home/<usuario>/lola_site/docs/...`); quem
 * pedia um arquivo negado descobria usuário e árvore de diretórios da máquina.
 * O plugin `lola-403-sem-caminho-absoluto` (vite.config.ts) limpa o corpo sem
 * tocar no status.
 *
 * Aqui o dev server sobe de VERDADE, com a config do repositório, e a prova é
 * ponta a ponta: 403 negado sem nenhum caminho absoluto e 200 do site intacto.
 */
const raizDoRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('corpo do 403 do deny de fs (RT-D-04)', () => {
  let servidor: ViteDevServer;
  let base = '';
  let raiz = '';

  beforeAll(async () => {
    const porta = await portaLivre();
    servidor = await createServer({
      configFile: path.join(raizDoRepo, 'vite.config.ts'),
      server: { port: porta },
      logLevel: 'error',
    });
    await servidor.listen();
    // Porta efetiva do servidor: com a corrida mínima do `portaLivre` já
    // contemplada, o Vite pode ter escolhido a porta seguinte.
    const endereco = servidor.httpServer?.address() as AddressInfo;
    base = `http://127.0.0.1:${endereco.port}`;
    raiz = servidor.config.root;
  }, 30_000);

  afterAll(async () => {
    await servidor?.close();
    limparTemporarios();
  }, 30_000);

  // (a) Caminho negado pela DEV_DENY: negação preservada, corpo genérico.
  it('nega README.md e server.ts com 403 sem o caminho absoluto da raiz', async () => {
    for (const caminho of ['/README.md', '/server.ts']) {
      const resposta = await fetch(`${base}${caminho}`);
      const corpo = await resposta.text();
      expect(resposta.status, `status de ${caminho}`).toBe(403);
      expect(corpo, `corpo de ${caminho}`).not.toContain(raiz);
      expect(corpo, `corpo de ${caminho}`).toContain('403 Restricted');
    }
  });

  // O antigo template listava a raiz E os diretórios permitidos; e uma
  // requisição /@fs/ para arquivo fora do projeto citava um caminho que nem
  // começa pela raiz. O corpo genérico cobre os dois casos.
  it('nega /@fs/ com 403 sem o caminho do arquivo pedido', async () => {
    const dir = diretorioTemporario('lola-deny-403-');
    const alvo = path.join(dir, 'alvo.txt');
    writeFileSync(alvo, 'conteudo protegido\n');

    const resposta = await fetch(`${base}/@fs${alvo}`);
    const corpo = await resposta.text();
    expect(resposta.status).toBe(403);
    expect(corpo).not.toContain(alvo);
    expect(corpo).not.toContain(dir);
    expect(corpo).toContain('403 Restricted');
  });

  // (b) Caminho normal: a limpeza não pode mexer em nada fora do 403.
  // O módulo é um `.ts` folha (sem dependência de npm): prova que a
  // transformação de módulos continua respondendo 200 sem arrastar a
  // otimização de dependências — que deixaria o teste lento e dependente do
  // cache compartilhado com o dev server do dono.
  it('mantém intactos os 200 do site e dos módulos', async () => {
    const html = await fetch(`${base}/index.html`);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain('<div id="root"></div>');

    const modulo = await fetch(`${base}/src/utils/cartStorage.ts`);
    expect(modulo.status).toBe(200);
    expect(modulo.headers.get('content-type')).toContain('javascript');
    expect(await modulo.text()).toContain('MAX_STORED_CART_ITEMS');
  });
});
