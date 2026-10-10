import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { InventoryStore } from './src/server/inventory';

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

const DATA_DIR = path.resolve(process.env.LOLA_DATA_DIR || path.join(__dirname, '.data'));
const inventory = new InventoryStore(INITIAL_STOCK, path.join(DATA_DIR, 'inventory.json'));

// Catálogo resumido para contexto do assistente
const CATALOG_INFO = [
  { id: 'brinco-1', name: 'Brinco Argola Lisa', category: 'Brincos', price: 49.9, material: 'Aço inoxidável 316L', color: 'Dourado', disponivel: 8, badge: 'Mais vendido', desc: 'Argola clássica lisa com fecho click seguro e banho dourado de alta durabilidade.' },
  { id: 'brinco-2', name: 'Brinco Coração Pequeno', category: 'Brincos', price: 39.9, material: 'Aço cirúrgico', color: 'Dourado', disponivel: 4, badge: 'Lançamento', desc: 'Brinco ponto fixo em formato de coração minimalista e delicado.' },
  { id: 'brinco-3', name: 'Brinco Argola Torcida', category: 'Brincos', price: 59.9, material: 'Aço inoxidável 316L', color: 'Dourado', disponivel: 12, badge: 'Novo', desc: 'Design torcido sofisticado com brilho radiante em relevo.' },
  { id: 'brinco-4', name: 'Brinco Ear Cuff Zircônia', category: 'Brincos', price: 54.9, material: 'Aço inoxidável com zircônias', color: 'Dourado', disponivel: 3, badge: 'Mais vendido', desc: 'Ear cuff moderno cravejado com micro zircônias de brilho cristalino.' },
  { id: 'brinco-5', name: 'Brinco Gota Minimalista', category: 'Brincos', price: 44.9, material: 'Aço inoxidável 316L', color: 'Dourado', disponivel: 6, badge: 'Novo', desc: 'Silhueta orgânica de gota polida com acabamento espelhado leve e confortável.' },
  { id: 'brinco-6', name: 'Brinco Pérola Clássico', category: 'Brincos', price: 49.9, material: 'Aço inoxidável e pérola shell', color: 'Dourado', disponivel: 9, desc: 'Pérola selecionada de alto brilho com pino antialérgico em aço dourado.' },
  { id: 'prod-colar-1', name: 'Colar Coração Madreperola', category: 'Colares', price: 59.9, material: 'Aço inoxidável 316L e madreperola', color: 'Dourado', disponivel: 10, badge: 'Destaque', desc: 'Corrente veneziana fina com pingente de coração com madrepérola natural.' },
  { id: 'prod-pulseira-1', name: 'Pulseira Corrente Elos', category: 'Pulseiras', price: 54.9, material: 'Aço inoxidável 316L', color: 'Dourado', disponivel: 7, badge: 'Destaque', desc: 'Elos clássicos polidos com extensor ajustável para pulsos de 16 a 20 cm.' },
  { id: 'prod-anel-1', name: 'Anel Duplo Torcido', category: 'Anéis', price: 39.9, material: 'Aço inoxidável 316L', color: 'Dourado', disponivel: 5, badge: 'Destaque', desc: 'Design aberto regulável com visual de dois aros sobrepostos.' },
  { id: 'prod-conjunto-1', name: 'Conjunto Aurora Dourado', category: 'Conjuntos', price: 89.9, material: 'Aço inoxidável 316L', color: 'Dourado', disponivel: 2, badge: 'Especial', desc: 'Kit coordenado com brinco de argola torcida e colar elos delicado.' },
];

const STORE_FAQS = `
SOBRE A LOLA AÇO INOX & ACESSÓRIOS:
- Especialidade: Semijoias e acessórios em aço inoxidável 316L e aço cirúrgico.
- Propriedades do Aço Inox: Hipoalergênico (não causa alergia), à prova d'água (pode tomar banho, ir à praia ou piscina), não escurece, não enferruja e não perde o brilho.
- Garantia: 1 ano de garantia contra defeitos de fabricação e desbotamento do acabamento em todas as peças.
- Frete: Enviamos para todo o Brasil via Correios (PAC e Sedex) e transportadoras parceiras. Frete grátis em compras acima de R$ 150,00.
- Trocas e Devoluções: Prazo de 7 dias após o recebimento para troca ou devolução sem custo adicional.
- Pagamento: Cartão de crédito em até 12x (em até 3x sem juros), Pix com confirmação imediata e Boleto bancário.
- Atendimento via WhatsApp: Suporte humanizado e compras pelo WhatsApp oficial (11) 99999-9999.
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
    const { pergunta, contexto } = req.body;

    if (!pergunta || typeof pergunta !== 'string') {
      return res.status(400).json({ error: 'Campo "pergunta" é obrigatório.' });
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
5. Se o cliente perguntar se a peça escurece ou se pode molhar: explique que o aço inoxidável 316L da Lola é à prova d'água, hipoalergênico e mantém o brilho dourado, com 1 ano de garantia.
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
        fallbackAnswer = `Temos sim! O ${activeProduct.nome} possui atualmente ${activeProduct.estoqueDisponivel} unidades disponíveis em nosso estoque com envio imediato.`;
        fallbackRefs.push({ tipo: 'produto', id: activeProduct.id, titulo: activeProduct.nome, link: `/produto/${activeProduct.id}` });
      } else {
        fallbackAnswer = `Nossas peças mais procuradas, como o Brinco Argola Lisa (${liveCatalog[0].estoqueDisponivel} un.) e o Colar Coração (${liveCatalog[6].estoqueDisponivel} un.), estão com estoque pronto para envio!`;
        fallbackRefs.push({ tipo: 'produto', id: 'brinco-1', titulo: 'Brinco Argola Lisa', link: '/produto/brinco-1' });
      }
    } else if (pLow.includes('escurece') || pLow.includes('molhar') || pLow.includes('alergia') || pLow.includes('banho') || pLow.includes('agua')) {
      fallbackAnswer = 'As semijoias da Lola são produzidas em aço inoxidável 316L legítimo: são hipoalergênicas, 100% resistentes à água (pode molhar, tomar banho e ir ao mar) e não escurecem, acompanhadas de 1 ano de garantia.';
      fallbackRefs.push({ tipo: 'politica', id: 'garantia', titulo: '1 Ano de Garantia Lola', link: '#garantia' });
    } else if (pLow.includes('frete') || pLow.includes('entrega') || pLow.includes('prazo')) {
      fallbackAnswer = 'Enviamos para todo o Brasil com rastreamento seguro. Em compras acima de R$ 150,00 o frete é totalmente gratuito para você!';
      fallbackRefs.push({ tipo: 'politica', id: 'frete', titulo: 'Frete para todo o Brasil', link: '#frete' });
    } else if (pLow.includes('recomenda') || pLow.includes('brinco') || pLow.includes('presente') || pLow.includes('dica')) {
      fallbackAnswer = 'Recomendo o clássico Brinco Argola Lisa (R$ 49,90) ou a delicada Argola Torcida (R$ 59,90). São nossas peças mais versáteis e campeãs de elogios!';
      fallbackRefs.push({ tipo: 'produto', id: 'brinco-1', titulo: 'Brinco Argola Lisa', link: '/produto/brinco-1' });
      fallbackRefs.push({ tipo: 'produto', id: 'brinco-3', titulo: 'Brinco Argola Torcida', link: '/produto/brinco-3' });
    } else {
      fallbackAnswer = 'Olá! Sou a assistente da Lola Aço Inox. Nossas peças são hipoalergênicas, à prova d’água e com garantia de 1 ano. Em que posso te ajudar hoje?';
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
