import { reply } from '../../_shared/publicApi.js';

// Atendimento por regras, 100% local: não consome API paga e não registra
// mensagens de clientes. Nunca responde com preço, prazo ou estoque inventado.
const REFERENCE = Object.freeze([
  { tipo: 'FAQ', id: 'lola-atendimento', titulo: 'Informações da LOLA', link: '/' },
]);
const ANSWERS = Object.freeze([
  {
    pattern: /\b(pix|pagar|pagamento|pagamentos|boleto|cart[aã]o|cartoes|cartões|parcelar|parcelamento)\b/i,
    message: 'A compra e o pagamento dentro deste site ainda estão em preparação. Não envie dados completos de cartão, senhas ou códigos de verificação pelo chat. Consulte os canais oficiais da LOLA para confirmar as formas de pagamento disponíveis.',
  },
  {
    pattern: /\b(rastreio|rastrear|pedido|pedidos|status|comprovante|nota fiscal)\b/i,
    message: 'O acompanhamento de pedidos online ainda não está habilitado nesta vitrine. Se você já comprou com a equipe, solicite a atualização pelo canal de atendimento oficial e informe somente os dados necessários.',
  },
  {
    pattern: /\b(frete|cep|envio|entrega|entregar|correios|prazo|transportadora)\b/i,
    message: 'O valor do frete e o prazo de entrega dependem do endereço e da disponibilidade confirmada. As estimativas exibidas na vitrine não representam cotação definitiva. Consulte o atendimento oficial para confirmação.',
  },
  {
    pattern: /\b(estoque|dispon[ií]vel|disponibilidade|pre[cç]o|quanto custa|valor|brinco|argola|anel|colar|pulseira|conjunto)\b/i,
    message: 'Você pode explorar as peças e acessórios da LOLA na vitrine. Preços e disponibilidade devem ser confirmados pela equipe antes de qualquer pagamento. O site ainda não finaliza pedidos.',
  },
  {
    pattern: /\b(inox|material|alergia|al[eé]rgico|garantia|troca|devolu[cç][aã]o|cuidado)\b/i,
    message: 'A LOLA trabalha com acessórios e peças anunciadas como aço inox. Composição específica, orientações de cuidados, política de trocas e garantia devem ser confirmadas nos canais oficiais da loja. Não posso assegurar que uma peça seja hipoalergênica.',
  },
]);

function answer(question) {
  const normalized = question.trim().normalize('NFKC').slice(0, 400);
  for (const entry of ANSWERS) {
    if (entry.pattern.test(normalized)) {
      return { resposta: entry.message, referencias: REFERENCE };
    }
  }
  return {
    resposta: 'Posso orientar sobre acessórios, estoque, frete, cuidados e pagamentos da LOLA. Nesta etapa, a loja funciona como vitrine e não confirma compras automaticamente. Para detalhes específicos, procure os canais oficiais de atendimento.',
    referencias: REFERENCE,
  };
}

async function limitedText(request, maximum = 4096) {
  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader && Number(lengthHeader) > maximum) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximum) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  return body;
}

export async function onRequest(context) {
  if (context.request?.method !== 'POST') {
    return reply({ error: 'Método não permitido.' }, 405, { Allow: 'POST' });
  }
  const type = context.request.headers.get('content-type') ?? '';
  if (!/^application\/json(?:;|$)/i.test(type)) {
    return reply({ error: 'Envie JSON válido.' }, 415);
  }
  try {
    const body = await limitedText(context.request);
    if (body === null) return reply({ error: 'Mensagem muito grande.' }, 413);
    const input = JSON.parse(body);
    if (!input || Array.isArray(input) || typeof input !== 'object' ||
        typeof input.pergunta !== 'string' ||
        input.pergunta.trim().length < 1 || input.pergunta.length > 400) {
      return reply({ error: 'Pergunta inválida.' }, 400);
    }
    return reply(answer(input.pergunta));
  } catch {
    return reply({ error: 'Não foi possível interpretar a solicitação.' }, 400);
  }
}
