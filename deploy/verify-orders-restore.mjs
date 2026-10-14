#!/usr/bin/env node
// =============================================================================
// verify-orders-restore.mjs — teste de RESTAURAÇÃO do backup de .data/
// =============================================================================
// Por que existe: um backup que ninguém consegue ler NÃO é backup. `openssl
// enc -d` não serve aqui — os pedidos são AES-256-GCM da aplicação, com AAD e
// tag de autenticação; só este código (o mesmo algoritmo de
// `src/server/orders.ts`) confirma que o ciphertext está legível.
//
// Roda com Node puro (>= 18), sem `npm install` e sem `tsx`: o script de
// backup precisa funcionar também numa máquina de backup que não tem o
// repositório instalado.
//
//   node deploy/verify-orders-restore.mjs \
//        --file /var/backups/lola/.../orders.enc.json \
//        [--inventory .../inventory.json] \
//        [--key-file /caminho/para/orders.key]
//
// Sai 0 quando TUDO decifra; 1 quando alguma verificação falha; 2 quando o
// uso está errado. É fail-closed: chave errada, AAD errado ou arquivo
// corrompido derrubam o script com mensagem — nunca "passa direto".
// =============================================================================
import { createDecipheriv } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Mesmo valor de `ORDERS_AAD` em src/server/orders.ts. É constante (não é
// segredo), mas precisa bater byte a byte: se alguém trocar a constante lá e
// não trocar aqui, o teste de restauração FALHA em vez de passar errado —
// o que é exatamente o comportamento desejado (fail-closed).
const ORDERS_AAD = 'lola-orders|orders.enc.json';

const HEX_64 = /^[0-9a-f]{64}$/i;

function erro(mensagem) {
  console.error('[restauração] FALHOU: ' + mensagem);
  process.exit(1);
}

function uso(mensagem) {
  console.error('[restauração] ' + mensagem);
  console.error(
    'Uso: node deploy/verify-orders-restore.mjs --file <orders.enc.json> '
    + '[--inventory <inventory.json>] [--key-file <arquivo>] [--key <hex 64>] '
    + '| --inventory-only --inventory <inventory.json>',
  );
  process.exit(2);
}

/** Lê uma opção da linha de comando (forma `--nome valor`). */
function opcao(nome) {
  const args = process.argv.slice(2);
  const i = args.indexOf(nome);
  if (i === -1) return undefined;
  const valor = args[i + 1];
  if (valor === undefined || valor.startsWith('--')) uso(`${nome} exige um valor.`);
  return valor;
}

/**
 * Resolve a chave nessa ordem — da mais explícita para a mais conveniente:
 *   1. `--key` (desencorajado: aparece no histórico do shell e no `ps`)
 *   2. `--key-file`
 *   3. LOLA_ORDERS_ENCRYPTION_KEY  (produção)
 *   4. LOLA_ORDERS_KEY_FILE        (produção, volume de segredo)
 *   5. `orders.key` ao lado do ciphertext (só desenvolvimento)
 * A 5ª é justamente o caso que o backup em produção NÃO pode ter: se a chave
 * estiver ao lado do ciphertext, uma cópia de `.data/` entrega os dois juntos.
 */
function resolverChave(caminhoPedidos) {
  const direta = opcao('--key');
  if (direta) return { chave: direta.trim(), origem: '--key (aparece no histórico: evite)' };

  const arquivo = opcao('--key-file') || process.env.LOLA_ORDERS_KEY_FILE;
  if (arquivo) {
    const caminho = resolve(arquivo.trim());
    if (!existsSync(caminho)) erro(`arquivo de chave não encontrado: ${caminho}`);
    return { chave: readFileSync(caminho, 'utf8').trim(), origem: `arquivo ${caminho}` };
  }

  const ambiente = (process.env.LOLA_ORDERS_ENCRYPTION_KEY || '').trim();
  if (ambiente) return { chave: ambiente, origem: 'variável LOLA_ORDERS_ENCRYPTION_KEY' };

  const vizinha = join(dirname(resolve(caminhoPedidos)), 'orders.key');
  if (existsSync(vizinha)) {
    return { chave: readFileSync(vizinha, 'utf8').trim(), origem: `${vizinha} (chave ao lado do ciphertext)` };
  }

  erro(
    'nenhuma chave encontrada. Em produção a chave vem de FORA de .data/ '
    + '(LOLA_ORDERS_ENCRYPTION_KEY ou LOLA_ORDERS_KEY_FILE); quem roda o backup '
    + 'precisa tê-la no ambiente. Sem a chave este backup é irrecuperável.',
  );
  return null; // inalcançável — `erro()` já saiu
}

/** Decifra o envelope com AES-256-GCM e devolve o array de pedidos. */
function decifrarPedidos(caminho, chaveHex) {
  if (!existsSync(caminho)) erro(`arquivo de pedidos não encontrado: ${caminho}`);

  let envelope;
  try {
    envelope = JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (e) {
    erro(`orders.enc.json não é um JSON válido: ${e.message}`);
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    erro('orders.enc.json não contém um envelope de objeto.');
  }
  if (envelope.version !== 1 && envelope.version !== 2) {
    erro(`versão desconhecida no envelope: ${String(envelope.version)} (a aplicação lê 1 e 2).`);
  }
  for (const campo of ['iv', 'tag', 'ciphertext']) {
    const valor = envelope[campo];
    if (typeof valor !== 'string' || valor.length === 0 || valor.length % 2 !== 0
        || !/^[0-9a-f]+$/i.test(valor)) {
      erro(`campo "${campo}" do envelope ausente ou inválido (hex par esperado).`);
    }
  }

  const chave = Buffer.from(chaveHex, 'hex');
  let plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', chave, Buffer.from(envelope.iv, 'hex'));
    // v1 foi gravado antes do AAD e continua legível; v2 vincula a cifra ao
    // nome do arquivo (é o que impede trocar o ciphertext por um envelope antigo).
    if (envelope.version === 2) decipher.setAAD(Buffer.from(ORDERS_AAD, 'utf8'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'hex')),
      decipher.final(), // aqui a tag GCM é conferida: falhou = ciphertext ou chave errados
    ]).toString('utf8');
  } catch (e) {
    erro(
      'a tag GCM não confere: a chave está errada OU o arquivo foi alterado. '
      + `Detalhe: ${e.message}`,
    );
  }

  let registros;
  try {
    registros = JSON.parse(plaintext);
  } catch (e) {
    erro(`o texto decifrado não é JSON: ${e.message}`);
  }
  if (!Array.isArray(registros)) erro('o texto decifrado não é uma lista de pedidos.');
  if (registros.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) {
    erro('a lista decifrada contém entrada que não é um objeto de pedido.');
  }
  return registros;
}

/** Conferência de estrutura do estoque — mesma regra de `InventoryStore`. */
function verificarEstoque(caminho) {
  if (!existsSync(caminho)) erro(`arquivo de estoque não encontrado: ${caminho}`);
  let bruto;
  try {
    bruto = JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (e) {
    erro(`inventory.json não é um JSON válido: ${e.message}`);
  }
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    erro('inventory.json não é um objeto de produtos.');
  }
  const entradas = Object.entries(bruto);
  for (const [id, item] of entradas) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      erro(`produto ${id}: entrada inválida.`);
    }
    for (const campo of ['total', 'reservado', 'vendido', 'disponivel']) {
      const v = item[campo];
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
        erro(`produto ${id}: campo ${campo} inválido.`);
      }
    }
    if (item.total !== item.reservado + item.vendido + item.disponivel) {
      erro(`produto ${id}: total !== reservado + vendido + disponivel (arquivo incoerente).`);
    }
  }
  return entradas.length;
}

// -----------------------------------------------------------------------------
// Modo "só estoque": usado quando o `.data/` ainda não tem nenhum pré-pedido
// gravado (orders.enc.json ainda não existe). O teste de decifração só faz
// sentido quando há ciphertext para decifrar.
const SO_ESTOQUE = process.argv.includes('--inventory-only');

if (SO_ESTOQUE) {
  const arquivoEstoqueSo = opcao('--inventory');
  if (!arquivoEstoqueSo) uso('--inventory-only exige --inventory <inventory.json>.');
  const n = verificarEstoque(resolve(arquivoEstoqueSo));
  console.log(`[restauração] OK: inventory.json válido, ${n} produto(s).`);
  process.exit(0);
}

const arquivoPedidos = opcao('--file') || opcao('--arquivo');
if (!arquivoPedidos) uso('falta --file apontando para o orders.enc.json do backup.');

const { chave, origem } = resolverChave(arquivoPedidos);
if (!HEX_64.test(chave)) {
  erro(
    'a chave precisa ter exatamente 64 caracteres hexadecimais (32 bytes). '
    + `Veio de: ${origem}`,
  );
}

const pedidos = decifrarPedidos(resolve(arquivoPedidos), chave);
console.log(`[restauração] OK: ${pedidos.length} pré-pedido(s) decifrado(s). (chave via ${origem})`);

const arquivoEstoque = opcao('--inventory');
if (arquivoEstoque) {
  const produtos = verificarEstoque(resolve(arquivoEstoque));
  console.log(`[restauração] OK: inventory.json válido, ${produtos} produto(s).`);
}

console.log('[restauração] Backup restaurável. Nenhum dado foi gravado por este script.');
process.exit(0);
