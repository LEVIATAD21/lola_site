import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { InventoryStore } from './src/server/inventory';
import { CATALOG_INFO } from './src/server/catalog';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In-memory stock store initialized from catalog
interface StockItem {
  productId: string;
  total: number;
  reservado: number;
  vendido: number;
  disponivel: number;
}

const INITIAL_STOCK: Record<string, StockItem> = {
  'brinco-1': { productId: 'brinco-1', total: 15, reservado: 2, vendido: 5, disponivel: 8 },
  'brinco-2': { productId: 'brinco-2', total: 10, reservado: 1, vendido: 5, disponivel: 4 },
  'brinco-3': { productId: 'brinco-3', total: 20, reservado: 3, vendido: 5, disponivel: 12 },
  'brinco-4': { productId: 'brinco-4', total: 8, reservado: 2, vendido: 3, disponivel: 3 },
  'brinco-5': { productId: 'brinco-5', total: 14, reservado: 0, vendido: 8, disponivel: 6 },
  'brinco-6': { productId: 'brinco-6', total: 12, reservado: 1, vendido: 2, disponivel: 9 },
  'prod-colar-1': { productId: 'prod-colar-1', total: 18, reservado: 2, vendido: 6, disponivel: 10 },
  'prod-pulseira-1': { productId: 'prod-pulseira-1', total: 15, reservado: 1, vendido: 7, disponivel: 7 },
  'prod-anel-1': { productId: 'prod-anel-1', total: 10, reservado: 2, vendido: 3, disponivel: 5 },
  'prod-conjunto-1': { productId: 'prod-conjunto-1', total: 6, reservado: 1, vendido: 3, disponivel: 2 },
};

// IDs do catálogo sem estoque cadastrado começam indisponíveis.
for (const product of CATALOG_INFO) {
  if (!INITIAL_STOCK[product.id]) {
    INITIAL_STOCK[product.id] = { productId: product.id, total: 0, reservado: 0, vendido: 0, disponivel: 0 };
  }
}

const DATA_DIR = path.resolve(process.env.LOLA_DATA_DIR || path.join(__dirname, '.data'));
const inventory = new InventoryStore(INITIAL_STOCK, path.join(DATA_DIR, 'inventory.json'));

// Catálogo resumido para contexto do assistente
// Catálogo compartilhado com o frontend; quantidades vêm do InventoryStore.
const STORE_FAQS = `
SOBRE A LOLA AÇO INOX & ACESSÓRIOS:
- Catálogo: use os nomes, descrições, materiais e preços fornecidos pelo catálogo vigente.
- Materiais e cuidados: informe apenas o material declarado para cada produto. Não presuma propriedades antialérgicas, resistência à água ou durabilidade.
- Garantia: prazo e condições precisam ser confirmados pela loja; não prometa cobertura sem uma política oficial.
- Frete e entrega: valor e prazo reais dependem de cotação logística; não prometa frete grátis ou prazo sem confirmação.
- Trocas e devoluções: não prometa condições comerciais não configuradas. Oriente a cliente a confirmar as regras com a loja.
- Pagamentos: este backend ainda não gera cobranças, Pix, boletos ou autorização de cartão.
- Atendimento: não invente números de telefone, perfis sociais ou canais de contato.
`;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  const aiRateBuckets = new Map<string, { count: number; resetAt: number }>();
  app.use((req, res, next) => {
    if (req.method !== 'POST' || req.path !== '/api/ai/consulta') return next();
    const now = Date.now();
    const key = req.socket.remoteAddress || 'unknown';
    const bucket = aiRateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      aiRateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    } else if (bucket.count >= 20) {
      return res.status(429).json({ error: 'Limite temporário de consultas atingido. Tente novamente em um minuto.' });
    } else {
      bucket.count += 1;
    }
    if (aiRateBuckets.size > 1000) {
      for (const [address, item] of aiRateBuckets) {
        if (item.resetAt <= now) aiRateBuckets.delete(address);
      }
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'lola-api', timestamp: new Date().toISOString() });
  });

  // 1. GET /api/estoque/:productId
  app.get('/api/estoque/:productId', (req, res) => {
    const stock = inventory.get(req.params.productId);
    if (!stock) return res.status(404).json({ error: 'Produto não encontrado no catálogo.' });
    return res.json(stock);
  });

  // 2. POST /api/estoque/atualizar (baixa estrita e persistente)
  app.post('/api/estoque/atualizar', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = inventory.deduct(body.productId, body.quantidade);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({
      success: true,
      productId: result.stock.productId,
      novoDisponivel: result.stock.disponivel,
      vendido: result.stock.vendido,
    });
  });

  // 3. GET /api/produtos (busca ou lista por categoria)
  app.get('/api/produtos', (req, res) => {
    const { categoria, query } = req.query;
    let list = CATALOG_INFO.map((item) => ({
      ...item,
      disponivel: inventory.get(item.id)?.disponivel ?? item.disponivel,
    }));

    if (categoria && typeof categoria === 'string') {
      list = list.filter((p) => p.category.toLowerCase() === categoria.toLowerCase());
    }

    if (query && typeof query === 'string') {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.desc.toLowerCase().includes(q)
      );
    }

    res.json(list);
  });

  // 4. GET /api/produto/:productId
  app.get('/api/produto/:productId', (req, res) => {
    const { productId } = req.params;
    const item = CATALOG_INFO.find((p) => p.id === productId);
    if (!item) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    const stock = inventory.get(productId)?.disponivel ?? item.disponivel;
    res.json({ ...item, disponivel: stock });
  });

  // 5. POST /api/ai/consulta (Assistente Virtual Lola)
  app.post('/api/ai/consulta', async (req, res) => {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const pergunta = typeof body.pergunta === 'string' ? body.pergunta.trim() : '';
    const contexto = body.contexto && typeof body.contexto === 'object' ? body.contexto : undefined;

    if (!pergunta) {
      return res.status(400).json({ error: 'Campo "pergunta" é obrigatório.' });
    }
    if (pergunta.length > 1200) {
      return res.status(413).json({ error: 'A pergunta deve ter no máximo 1200 caracteres.' });
    }

    // Prepare real-time inventory snapshot
    const liveCatalog = CATALOG_INFO.map((prod) => ({
      id: prod.id,
      nome: prod.name,
      categoria: prod.category,
      preco: `R$ ${prod.price.toFixed(2).replace('.', ',')}`,
      material: prod.material,
      cor: prod.color,
      estoqueDisponivel: inventory.get(prod.id)?.disponivel ?? prod.disponivel,
      descricao: prod.desc,
    }));

    // Find active product context if supplied
    const activeProduct = contexto?.produtoId
      ? liveCatalog.find((p) => p.id === contexto.produtoId)
      : null;

    const apiKey = process.env.GEMINI_API_KEY;

    try {
      if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
        const ai = new GoogleGenAI({ apiKey });

        const systemInstruction = `
Você é a Assistente Virtual exclusiva da "LOLA Aço Inox & Acessórios", uma marca brasileira de semijoias sofisticadas, elegantes e contemporâneas em aço inoxidável.
Seu tom de voz é amigável, atencioso, acolhedor e consultivo, condizente com a elegância da marca.

REGRAS CRÍTICAS (ANTI-ALUCINAÇÃO):
1. Use SOMENTE as informações do catálogo e políticas fornecidas abaixo.
2. NUNCA invente produtos, coleções, preços, cupons ou estoques que não estejam listados aqui.
3. Se o cliente perguntar por estoque, informe exatamente o valor de "estoqueDisponivel" oficial. Se estiver baixo (<= 3), avise delicadamente que restam poucas unidades.
4. Se o cliente perguntar por algo que não vendemos ou que não está no catálogo, responda com sinceridade e gentileza: "No momento não temos essa peça específica em nosso catálogo, mas recomendo dar uma olhada em..."
5. Não prometa resistência à água, propriedades antialérgicas, garantia ou durabilidade sem confirmação nos dados oficiais específicos do produto.
6. Quando citar produtos específicos do catálogo, mencione o nome exato da peça para que o sistema possa criar links para a cliente.
7. Mantenha as respostas concisas, elegantes (2 a 4 frases por resposta).

${STORE_FAQS}

CATÁLOGO ATUALIZADO EM TEMPO REAL:
${JSON.stringify(liveCatalog, null, 2)}
`;

        const promptText = `
Contexto atual da cliente:
- Produto em visualização: ${activeProduct ? JSON.stringify(activeProduct) : 'Nenhum'}
- Itens na sacola da cliente: ${contexto?.carrinho ? JSON.stringify(contexto.carrinho) : 'Vazia'}

Pergunta da cliente: "${pergunta}"
`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: promptText,
          config: {
            systemInstruction,
            temperature: 0.2, // low temperature to ensure strict adherence to facts
          },
        });

        const replyText = response.text || 'Olá! Posso te ajudar a escolher as melhores peças em aço inox para o seu estilo.';

        // Detect mentioned catalog items for reference links
        const referencias: Array<{ tipo: 'produto' | 'FAQ' | 'politica'; id: string; titulo: string; link: string }> = [];
        liveCatalog.forEach((prod) => {
          if (replyText.toLowerCase().includes(prod.nome.toLowerCase())) {
            referencias.push({
              tipo: 'produto',
              id: prod.id,
              titulo: prod.nome,
              link: `/produto/${prod.id}`,
            });
          }
        });

        if (replyText.toLowerCase().includes('garantia') || replyText.toLowerCase().includes('1 ano')) {
          referencias.push({
            tipo: 'politica',
            id: 'garantia',
            titulo: 'Garantia de 1 Ano Lola',
            link: '#garantia',
          });
        }

        if (replyText.toLowerCase().includes('frete') || replyText.toLowerCase().includes('brasil')) {
          referencias.push({
            tipo: 'politica',
            id: 'frete',
            titulo: 'Frete Grátis acima de R$ 150',
            link: '#frete',
          });
        }

        return res.json({
          resposta: replyText,
          referencias,
        });
      }
    } catch (err) {
      console.error('Error invoking AI model:', err);
    }

    // Graceful intelligent fallback if API key is not configured or fails
    const pLow = pergunta.toLowerCase();
    let fallbackAnswer = '';
    const fallbackRefs: Array<{ tipo: 'produto' | 'FAQ' | 'politica'; id: string; titulo: string; link: string }> = [];

    if (pLow.includes('estoque') || pLow.includes('tem') || pLow.includes('disponivel')) {
      if (activeProduct) {
        fallbackAnswer = `O catálogo registra ${activeProduct.estoqueDisponivel} unidades disponíveis de ${activeProduct.nome}. O prazo de envio ainda precisa ser confirmado no atendimento.`;
        fallbackRefs.push({ tipo: 'produto', id: activeProduct.id, titulo: activeProduct.nome, link: `/produto/${activeProduct.id}` });
      } else {
        const featured = liveCatalog.find((product) => product.id === 'brinco-1');
        const necklace = liveCatalog.find((product) => product.id === 'prod-colar-1');
        fallbackAnswer = `O catálogo registra ${featured?.estoqueDisponivel ?? 0} unidades de ${featured?.nome ?? 'Brinco Argola Lisa'} e ${necklace?.estoqueDisponivel ?? 0} unidades de ${necklace?.nome ?? 'Colar Coração Madreperola'}. O prazo de envio deve ser confirmado no atendimento.`;
        fallbackRefs.push({ tipo: 'produto', id: 'brinco-1', titulo: featured?.nome ?? 'Brinco Argola Lisa', link: '/produto/brinco-1' });
        if (necklace) fallbackRefs.push({ tipo: 'produto', id: necklace.id, titulo: necklace.nome, link: '/produto/' + necklace.id });
      }
    } else if (pLow.includes('escurece') || pLow.includes('molhar') || pLow.includes('alergia') || pLow.includes('banho') || pLow.includes('agua')) {
      fallbackAnswer = 'Para te orientar com segurança, preciso confirmar as características, os cuidados e a garantia desta peça com a loja. Posso informar o material que está declarado no catálogo.';
      fallbackRefs.push({ tipo: 'politica', id: 'garantia', titulo: '1 Ano de Garantia Lola', link: '#garantia' });
    } else if (pLow.includes('frete') || pLow.includes('entrega') || pLow.includes('prazo')) {
      fallbackAnswer = 'O cálculo do frete e o prazo de entrega ainda não estão conectados a uma transportadora nesta versão. Confirme o valor e o prazo no atendimento antes de concluir a compra.';
      fallbackRefs.push({ tipo: 'politica', id: 'frete', titulo: 'Frete para todo o Brasil', link: '#frete' });
    } else if (pLow.includes('recomenda') || pLow.includes('brinco') || pLow.includes('presente') || pLow.includes('dica')) {
      fallbackAnswer = 'Recomendo o clássico Brinco Argola Lisa (R$ 49,90) ou a delicada Argola Torcida (R$ 59,90). São nossas peças mais versáteis e campeãs de elogios!';
      fallbackRefs.push({ tipo: 'produto', id: 'brinco-1', titulo: 'Brinco Argola Lisa', link: '/produto/brinco-1' });
      fallbackRefs.push({ tipo: 'produto', id: 'brinco-3', titulo: 'Brinco Argola Torcida', link: '/produto/brinco-3' });
    } else {
      fallbackAnswer = 'Olá! Sou a assistente virtual da Lola Aço Inox & Acessórios. Posso ajudar com informações do catálogo e orientar você sobre detalhes que precisam ser confirmados com a loja.';
    }

    return res.json({
      resposta: fallbackAnswer,
      referencias: fallbackRefs,
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint de API não encontrado.' });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const candidate = error as { status?: number };
    const status = candidate?.status === 413 ? 413 : candidate?.status === 400 ? 400 : 500;
    if (status === 500) console.error('Erro interno na API.');
    res.status(status).json({
      error: status === 413 ? 'Corpo da requisição muito grande.' :
        status === 400 ? 'JSON inválido na requisição.' : 'Erro interno do servidor.',
    });
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lola Aço Inox server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
