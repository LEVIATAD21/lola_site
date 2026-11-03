import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  diretorioTemporario, limparTemporarios, matarTodosOsFilhos, portaLivre,
  subirEntryPoint, type ProcessoFilho,
} from './helpers/servidorFilho';

/**
 * Boot REAL do `server.ts` (a vitrine) como processo filho, sempre em produção.
 *
 * O modo dev NUNCA sobe aqui de propósito: o middleware do Vite escreve o cache
 * em `node_modules/.vite`, que neste worktree é symlink para a cópia do usuário
 * — rodar dev em teste contaminaria o projeto original. Em produção não há
 * Vite, o boot é rápido e nada é escrito fora do diretório temporário.
 *
 * O que só um boot de verdade prova: que `NODE_ENV=production` troca o
 * fallback da SPA pelo `sendFile` do `dist`, que o guard cross-site, o body
 * parser e o tratador de erro JSON estão registrados NA ORDEM certa da cadeia
 * do Express (testes unitários de função não veem a ordem), que o modo dividido
 * realmente não monta o painel administrativo e que um servidor de dados fora
 * do ar vira 503 sem vazar a mensagem crua do Node na resposta.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const distIndex = path.join(raiz, 'dist', 'index.html');
const STUB_SPA = '<!-- lola-boot-test-stub -->';
/**
 * Conteúdo exato que o servidor precisa devolver para a SPA neste boot.
 *
 * O valor sai do `dist/index.html` que existir na hora: se não houver build,
 * o `beforeAll` planta um stub e guarda ele; se houver (alguém rodou
 * `npm run build` antes do teste), o servidor vai servir o arquivo de verdade
 * e o marcador do stub não existe nele. Antes a asserção apontava sempre para o
 * marcador do stub, o que fazia este teste falhar em qualquer árvore já
 * construída — ele só passava limpo.
 */
let SPA_ESPERADA = '';

const MENSAGEM_CATALOGO_INDISPONIVEL =
  'O catálogo está temporariamente indisponível. Recarregue a página em instantes.';
const MENSAGEM_PEDIDOS_INDISPONIVEL =
  'O registro de pré-pedidos está temporariamente indisponível. Tente novamente mais tarde ou fale com o atendimento.';
const MENSAGEM_ADMIN_401 =
  'Chave administrativa inválida ou operação não habilitada neste servidor.';

function getJson(url: string, init?: RequestInit): Promise<{ status: number; corpo: unknown; headers: Headers }> {
  return fetch(url, init).then(async (response) => ({
    status: response.status,
    corpo: await response.json().catch(() => null),
    headers: response.headers,
  }));
}

/** Rascunho válido de base; cada teste sobrescreve só o que testa. */
function corpoRascunho(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    customer: {
      fullName: 'Maria da Silva',
      phone: '11987654321',
      cep: '01310100',
      street: 'Avenida Paulista',
      number: '1000',
      complement: 'Apto 12',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    },
    paymentMethod: 'pix',
    shippingOptionId: 'pac',
    giftWrap: false,
    termsAccepted: true,
    items: [{ productId: 'brinco-1', quantity: 1 }],
    ...overrides,
  };
}

/** Submete um rascunho e devolve status + corpo, sem Origin (como um app nativo). */
function postRascunho(base: string, body: unknown): Promise<{ status: number; corpo: { error?: string } | null }> {
  return fetch(`${base}/api/pedidos/rascunho`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (response) => ({
    status: response.status,
    corpo: await response.json().catch(() => null),
  }));
}

let crieiODist = false;
let crieiODiretorio = false;

beforeAll(() => {
  // A vitrine em produção entrega `dist/index.html` para tudo que não é API.
  // Sem build, um stub basta para provar o caminho real do `sendFile` sem
  // depender do Vite.
  if (!existsSync(distIndex)) {
    const diretorioDist = path.dirname(distIndex);
    crieiODiretorio = !existsSync(diretorioDist);
    mkdirSync(diretorioDist, { recursive: true });
    SPA_ESPERADA = `<!doctype html><html><body>${STUB_SPA}</body></html>\n`;
    writeFileSync(distIndex, SPA_ESPERADA);
    crieiODist = true;
    return;
  }
  // Com build existente o servidor sirve este arquivo — então a referência é ele.
  SPA_ESPERADA = readFileSync(distIndex, 'utf8');
});

afterAll(() => {
  if (!crieiODist) return;
  rmSync(distIndex, { force: true });
  // Sem isto sobrava um `dist/` VAZIO, que um boot de produção leria como
  // diretório estático sem index — e que fazia o teste seguinte enxergar um
  // `dist/` que ele mesmo tinha criado.
  if (crieiODiretorio) rmSync(path.dirname(distIndex), { recursive: true, force: true });
});

describe('server.ts — modo embutido em produção (boot real)', () => {
  let servidor: ProcessoFilho;
  let base: string;
  let chaveAdmin: string;

  beforeAll(async () => {
    chaveAdmin = 'k'.repeat(64);
    const porta = await portaLivre();
    base = `http://127.0.0.1:${porta}`;
    servidor = subirEntryPoint('server.ts', {
      NODE_ENV: 'production',
      PORT: String(porta),
      LOLA_DATA_DIR: diretorioTemporario('lola-vitrine-'),
      LOLA_ORDERS_ENCRYPTION_KEY: 'a1'.repeat(32),
      LOLA_EMBEDDED_ADMIN: 'true',
      LOLA_ADMIN_API_KEY: chaveAdmin,
    });
    await servidor.esperar(/servidor\.iniciado/);
  }, 60_000);

  afterAll(() => {
    matarTodosOsFilhos();
    limparTemporarios();
  });

  it('sobe em produção, loga servidor.iniciado com a porta pedida e o plano de dados local', () => {
    const log = servidor.saida();
    expect(log).toContain('servidor.iniciado');
    expect(log).toMatch(new RegExp(`porta=${base.split(':').pop()}`));
    expect(log).toContain('ambiente=production');
    expect(log).toContain('estatico=sim');
    expect(log).toContain('planoDeDados=local');
  });

  it('responde /api/health com os cabeçalhos de segurança e HSTS ligados em produção', async () => {
    const resposta = await fetch(`${base}/api/health`);
    const corpo = (await resposta.json()) as { status: string; service: string };

    expect(resposta.status).toBe(200);
    expect(corpo.status).toBe('ok');
    expect(corpo.service).toBe('lola-api');
    expect(resposta.headers.get('x-content-type-options')).toBe('nosniff');
    expect(resposta.headers.get('x-frame-options')).toBe('DENY');
    expect(resposta.headers.get('content-security-policy')).toBeTruthy();
    expect(resposta.headers.get('strict-transport-security')).toBeTruthy();
  });

  it('expõe apenas disponibilidade booleana, nunca a quantidade exata de estoque', async () => {
    const resposta = await getJson(`${base}/api/estoque/brinco-1`);
    const corpo = resposta.corpo as Record<string, unknown>;

    expect(resposta.status).toBe(200);
    expect(corpo).toEqual({ productId: 'brinco-1', disponivel: true });
    expect(typeof corpo.disponivel).toBe('boolean');
    expect(corpo).not.toHaveProperty('total');
    expect(corpo).not.toHaveProperty('reservado');
    expect(corpo).not.toHaveProperty('vendido');
  });

  it('não expõe saldo exato nas rotas públicas de listagem e detalhe', async () => {
    const listagem = await getJson(`${base}/api/produtos`);
    const produtos = listagem.corpo as Array<Record<string, unknown>>;
    const brincoNaLista = produtos.find((item) => item.id === 'brinco-1');

    expect(listagem.status).toBe(200);
    expect(brincoNaLista?.disponivel).toBe(true);
    expect(typeof brincoNaLista?.disponivel).toBe('boolean');

    const detalhe = await getJson(`${base}/api/produto/brinco-1`);
    const produto = detalhe.corpo as Record<string, unknown>;
    expect(detalhe.status).toBe(200);
    expect(produto.disponivel).toBe(true);
    expect(typeof produto.disponivel).toBe('boolean');
  });

  it('assistente informa disponibilidade sem revelar contagem interna de estoque', async () => {
    const resposta = await getJson(`${base}/api/ai/consulta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pergunta: 'Tem estoque?', contexto: { produtoId: 'brinco-1' } }),
    });
    const corpo = resposta.corpo as { resposta?: string };

    expect(resposta.status).toBe(200);
    expect(corpo.resposta).toContain('disponível');
    expect(corpo.resposta).not.toMatch(/\b\d+\s+unidades?\b/i);
  });

  // VUL-B / bloco 9: JSON malformado passa pelo `express.json` ANTES das rotas;
  // o buraco era o `finalhandler` devolver HTML com a stack. O boot prova que o
  // tratador JSON está registrado depois do body parser e do static.
  it('devolve 400 application/json sem stack para JSON malformado no corpo', async () => {
    const resposta = await fetch(`${base}/api/pedidos/rascunho`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"cliente": ',
    });
    const texto = await resposta.text();

    expect(resposta.status).toBe(400);
    expect(resposta.headers.get('content-type')).toContain('application/json');
    expect(texto).toContain('JSON inválido na requisição.');
    expect(texto).not.toMatch(/at \w+ |\.ts:\d+|stack/i);
  });

  it('devolve 413 com mensagem própria quando o corpo passa de 16 kB', async () => {
    const resposta = await fetch(`${base}/api/pedidos/rascunho`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preenchimento: 'x'.repeat(20_000) }),
    });
    const corpo = (await resposta.json()) as { error?: string };

    expect(resposta.status).toBe(413);
    expect(corpo.error).toBe('Corpo da requisição muito grande.');
  });

  // Bloco 7: a guarda de origem precisa estar registrada no caminho /api do
  // servidor real, não só na função — um refactor que movede a linha para
  // depois do limitOrderDraft deixaria um site malicioso consumir a cota da
  // vítima antes do 403.
  it('recusa escrita cross-site com 403 antes de alcançar as rotas', async () => {
    const resposta = await fetch(`${base}/api/pedidos/rascunho`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://loja-maliciosa.example',
      },
      body: JSON.stringify(corpoRascunho()),
    });
    const corpo = (await resposta.json()) as { error?: string };

    expect(resposta.status).toBe(403);
    expect(corpo.error).toBe('Origem não autorizada.');
  });

  // Blocos 8 e 10: requisição sem Origin (mesmo navegador em aba privada manda
  // Origin em POST, mas cliente nativa e webhook não) passa pela guarda, e o
  // preço enviado pela cliente é ignorado — o subtotal sai do catálogo do
  // servidor (brinco-1 = R$ 49,90), não do corpo.
  it('aceita requisição sem Origin e ignora o preço de produto enviado pela cliente', async () => {
    const resposta = await postRascunho(base, corpoRascunho({
      items: [{ productId: 'brinco-1', quantity: 1, unitPriceCents: 1, price: 0.01 }],
    }));
    const corpo = resposta.corpo as { success?: boolean; order?: { subtotal?: number } };

    expect(resposta.status).toBe(201);
    expect(corpo.success).toBe(true);
    expect(corpo.order?.subtotal).toBe(49.9);
  });

  // Bloco 4: o servidor valida o CEP de novo; a cliente mandar CEP quebrado não
  // pode virar pedido registrado.
  it('valida o CEP no servidor e devolve 400 com a mensagem própria', async () => {
    const customer = corpoRascunho().customer as Record<string, unknown>;
    const resposta = await postRascunho(base, corpoRascunho({
      customer: { ...customer, cep: '00000-000' },
    }));

    expect(resposta.status).toBe(400);
    expect(resposta.corpo?.error).toBe('Informe um CEP brasileiro válido com 8 dígitos.');
  });

  // Bloco 5: cupom promocional com regra de mínimo — a regra mora no servidor,
  // junto do subtotal real.
  it('recusa cupom promocional abaixo do mínimo com a mensagem própria', async () => {
    const resposta = await postRascunho(base, corpoRascunho({ couponCode: 'BEMVINDA' }));

    expect(resposta.status).toBe(400);
    expect(resposta.corpo?.error).toBe('Este cupom vale a partir de R$ 150,00 em produtos.');
  });

  // Bloco 6: cupom que não existe no catálogo de cupons.
  it('recusa cupom inexistente com a mensagem própria', async () => {
    const resposta = await postRascunho(base, corpoRascunho({ couponCode: 'GRATIS100' }));

    expect(resposta.status).toBe(400);
    expect(resposta.corpo?.error).toBe('O cupom informado não é válido.');
  });

  // Blocos 11 e 12: sem chave e com chave errada a resposta é idêntica — não
  // existe oráculo para adivinhar se a chave existe.
  it('responde 401 idêntico para requisição administrativa sem chave e com chave errada', async () => {
    const semChave = await getJson(`${base}/api/admin/pre-pedidos`);
    const chaveErrada = await getJson(`${base}/api/admin/pre-pedidos`, {
      headers: { 'x-admin-key': 'z'.repeat(64) },
    });

    expect(semChave.status).toBe(401);
    expect(chaveErrada.status).toBe(401);
    expect((semChave.corpo as { error?: string }).error).toBe(MENSAGEM_ADMIN_401);
    expect((chaveErrada.corpo as { error?: string }).error).toBe(MENSAGEM_ADMIN_401);
  });

  it('monta o painel administrativo em produção e aceita a chave certa', async () => {
    const resposta = await getJson(`${base}/api/admin/pre-pedidos`, {
      headers: { 'x-admin-key': chaveAdmin },
    });

    expect(resposta.status).toBe(200);
    expect(Array.isArray((resposta.corpo as { orders?: unknown[] }).orders)).toBe(true);
  });

  // Blocos 2 e 3: tentativas de leitura direta de código e segredo caem na SPA
  // como qualquer outra página — em produção isso é o `sendFile` do index, e
  // não o middleware do Vite nem um 403 que confirme que o arquivo existe.
  it('entrega a SPA para /.env, /server.ts, /data-server.ts e /.data/orders.key', async () => {
    for (const caminho of ['/.env', '/server.ts', '/data-server.ts', '/.data/orders.key']) {
      const resposta = await fetch(`${base}${caminho}`);
      const html = await resposta.text();

      expect(resposta.status, caminho).toBe(200);
      expect(resposta.headers.get('content-type'), caminho).toContain('text/html');
      expect(html.trim(), caminho).toBe(SPA_ESPERADA.trim());
    }
  });

  it('responde 404 JSON para rota de API e canal interno inexistentes', async () => {
    const api = await getJson(`${base}/api/rota-que-nao-existe`);
    const interno = await getJson(`${base}/internal/qualquer-coisa`);

    expect(api.status).toBe(404);
    expect((api.corpo as { error?: string }).error).toBe('Endpoint de API não encontrado.');
    expect(interno.status).toBe(404);
    expect((interno.corpo as { error?: string }).error).toBe('Endpoint de API não encontrado.');
  });
});

describe('server.ts — modo dividido com o servidor de dados fora do ar (boot real)', () => {
  let servidor: ProcessoFilho;
  let base: string;
  let portaMorta: number;

  beforeAll(async () => {
    portaMorta = await portaLivre();
    const porta = await portaLivre();
    base = `http://127.0.0.1:${porta}`;
    // O painel é declarado explicitamente mesmo assim: o ponto do modo dividido
    // é que a vitrine NÃO o monta, por mais que quem opera peça.
    servidor = subirEntryPoint('server.ts', {
      NODE_ENV: 'production',
      PORT: String(porta),
      LOLA_DATA_SERVICE_URL: `http://127.0.0.1:${portaMorta}`,
      LOLA_INTERNAL_PLAINTEXT: 'true',
      LOLA_EMBEDDED_ADMIN: 'true',
      LOLA_ADMIN_API_KEY: 'k'.repeat(64),
    });
    await servidor.esperar(/servidor\.iniciado/);
  }, 60_000);

  afterAll(() => {
    matarTodosOsFilhos();
    limparTemporarios();
  });

  it('configura o plano de dados remoto e não instancia o plano local', () => {
    const log = servidor.saida();
    expect(log).toContain('plano.remoto_configurado');
    expect(log).not.toContain('plano.local_configurado');
    expect(log).toContain('planoDeDados=remoto');
  });

  it('devolve 503 com a mensagem do catálogo quando o servidor de dados não responde', async () => {
    const estoque = await getJson(`${base}/api/estoque/brinco-1`);
    const produtos = await getJson(`${base}/api/produtos`);

    expect(estoque.status).toBe(503);
    expect((estoque.corpo as { error?: string }).error).toBe(MENSAGEM_CATALOGO_INDISPONIVEL);
    expect(produtos.status).toBe(503);
    expect((produtos.corpo as { error?: string }).error).toBe(MENSAGEM_CATALOGO_INDISPONIVEL);
  });

  // A mensagem crua do Node (ECONNREFUSED, AggregateError, endereço interno)
  // revela topologia interna para qualquer visitante; a resposta pública é a
  // mesma de uma manutenção programada.
  it('devolve 503 no pré-pedido sem vazar o erro de conexão interno', async () => {
    const resposta = await postRascunho(base, corpoRascunho());
    const texto = JSON.stringify(resposta.corpo);

    expect(resposta.status).toBe(503);
    expect(resposta.corpo?.error).toBe(MENSAGEM_PEDIDOS_INDISPONIVEL);
    expect(texto).not.toMatch(/ECONNREFUSED|fetch failed|AggregateError|127\.0\.0\.1|::1|porta/i);
  });

  it('mantém o painel administrativo fora da vitrine mesmo com LOLA_EMBEDDED_ADMIN=true e a chave certa', async () => {
    const resposta = await getJson(`${base}/api/admin/pre-pedidos`, {
      headers: { 'x-admin-key': 'k'.repeat(64) },
    });

    expect(resposta.status).toBe(404);
    expect((resposta.corpo as { error?: string }).error).toBe('Endpoint de API não encontrado.');
  });
});
