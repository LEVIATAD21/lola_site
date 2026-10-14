import {
  createCipheriv, createDecipheriv, createHash, randomBytes,
} from 'node:crypto';
import {
  chmodSync, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { ORDERS_AAD, type StoredOrderDraft } from '../src/server/orders';

/**
 * Rotação da chave AES-256-GCM dos pré-pedidos — `deploy/rotate-orders-key.ts`
 *
 * O problema: os pedidos já gravados em `.data/orders.enc.json` estão cifrados
 * com a chave VELHA. Trocar `LOLA_ORDERS_ENCRYPTION_KEY` por uma chave nova sem
 * fazer nada mais deixa TODOS os pedidos antigos ilegíveis — o servidor sobe, a
 * tag GCM não confere, e o arquivo permanece intacto mas perdido (é por isso
 * que `EncryptedOrderStore` falha fechado, e não sobrescreve).
 *
 * O que este script faz, nesta ordem:
 *
 *   1. decifra o arquivo com a chave VELHA; se não decifrar, ABORTA e não toca
 *      em nada (nunca sobrescreve ciphertext ilegível);
 *   2. regrava os mesmos registros com a chave NOVA num arquivo temporário;
 *   3. reabre o temporário com a chave NOVA e confere que os registros batem;
 *   4. confere que `orders.enc.json` não mudou no meio da execução;
 *   5. só então troca o arquivo original (rename atômico, modo 0600);
 *   6. confere que o arquivo final também decifra.
 *
 * O passo 4 existe porque rodar a rotação com o `data-server` ligado perderia o
 * pedido que chegasse entre a leitura e a troca: o servidor mantém os registros
 * em memória e regrava o arquivo inteiro a cada novo pré-pedido.
 *
 * Uso (NUNCA com chave na linha de comando — ela aparece em `ps` e no
 * histórico; prefira arquivo ou variável de ambiente):
 *
 *   # 1. pare o servidor de dados:   docker compose stop data-server
 *   # 2. backup obrigatório:         ./deploy/backup.sh
 *   # 3. gere a nova chave:           openssl rand -hex 32 > chave-nova.hex
 *   # 4. teste sem gravar:
 *   LOLA_ORDERS_OLD_KEY="$(cat chave-antiga.hex)" \
 *   LOLA_ORDERS_NEW_KEY="$(cat chave-nova.hex)" \
 *     npx tsx deploy/rotate-orders-key.ts --dry-run
 *   # 5. aplicar: mesma linha, sem --dry-run
 *
 * Opções:
 *   --data-dir <dir>    onde está o .data/ (padrão: LOLA_DATA_DIR ou ./.data)
 *   --file <arquivo>    caminho direto do orders.enc.json (substitui --data-dir)
 *   --old-key-file <f>  arquivo com a chave antiga (64 hex)
 *   --new-key-file <f>  arquivo com a chave nova (64 hex)
 *   --old-key <hex>     chave antiga inline (desencorajado)
 *   --new-key <hex>     chave nova inline (desencorajado)
 *   --dry-run           faz todo o trabalho e DESCARTA o resultado: serve para
 *                       provar que a chave antiga decifra, sem gravar nada
 *
 * Variáveis de ambiente aceitas:
 *   LOLA_ORDERS_OLD_KEY             chave antiga (64 hex)
 *   LOLA_ORDERS_NEW_KEY             chave nova (64 hex)
 *   LOLA_ORDERS_ENCRYPTION_KEY      usada como chave ANTIGA se a antiga não
 *                                   for declarada (é a que está em uso hoje)
 *   LOLA_DATA_DIR                   diretório dos dados
 *
 * Fora de produção (sem `LOLA_ORDERS_ENCRYPTION_KEY`), a chave antiga é
 * procurada em `<data-dir>/orders.key` — é exatamente o que o servidor faz.
 */

/** Mesmo formato gravado por `EncryptedOrderStore.persist()`. */
interface Envelope {
  version: 1 | 2;
  iv: string;
  tag: string;
  ciphertext: string;
}

const HEX_64 = /^[0-9a-f]{64}$/i;

/**
 * Sai com código de erro. `process.exit` é `never`, então a assinatura fecha:
 * é o mesmo padrão de `fail()` em `data-server.ts` — depois de uma falha de
 * rotação de chave não existe caminho de continuação.
 */
function falhar(motivo: string, codigo = 1): never {
  console.error('[rotação] FALHOU: ' + motivo);
  process.exit(codigo);
}

function aviso(mensagem: string): void {
  console.warn('[rotação] ' + mensagem);
}

function opcao(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  if (i === -1) return undefined;
  const valor = process.argv[i + 1];
  if (valor === undefined || valor.startsWith('--')) return falhar(`${nome} exige um valor.`);
  return valor;
}

/** Normaliza e valida: 64 hex = 32 bytes. Recusa qualquer coisa parecida. */
function normalizarChave(valor: string | null, rotulo: string): Buffer {
  const limpa = (valor ?? '').trim();
  if (!HEX_64.test(limpa)) {
    return falhar(
      `${rotulo} precisa ter exatamente 64 caracteres hexadecimais (32 bytes). `
      + 'Gere com `openssl rand -hex 32`.',
    );
  }
  return Buffer.from(limpa, 'hex');
}

/** Impressão segura de uma chave: 8 hex de SHA-256, nunca o conteúdo. */
function pegada(chave: Buffer): string {
  return createHash('sha256').update(chave).digest('hex').slice(0, 8);
}

/**
 * Decifra o envelope com a chave informada e devolve os registros.
 * Qualquer falha (chave errada, tag que não confere, JSON quebrado) vira
 * exceção: quem decide o que fazer é o chamador.
 */
function decifrar(envelope: Envelope, chave: Buffer): StoredOrderDraft[] {
  const decipher = createDecipheriv('aes-256-gcm', chave, Buffer.from(envelope.iv, 'hex'));
  // v1 foi gravado antes do AAD e continua legível; v2 vincula a cifra ao nome
  // do arquivo — trocar o ciphertext por um envelope antigo não passa.
  if (envelope.version === 2) decipher.setAAD(Buffer.from(ORDERS_AAD, 'utf8'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  const texto = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'hex')),
    decipher.final(), // a tag GCM é conferida aqui: erro = chave ou arquivo errados
  ]).toString('utf8');
  const bruto: unknown = JSON.parse(texto);
  if (!Array.isArray(bruto)) throw new Error('o texto decifrado não é uma lista de pedidos.');
  if (bruto.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('a lista decifrada contém entrada que não é um objeto de pedido.');
  }
  return bruto as StoredOrderDraft[];
}

/** Lê e valida o envelope. Lança exceção — nunca encerra o processo por aqui,
 *  porque quem chama precisa de chance de limpar o arquivo temporário. */
function lerEnvelope(caminho: string): Envelope {
  if (!existsSync(caminho)) throw new Error(`arquivo não encontrado: ${caminho}`);
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (error) {
    throw new Error(`não consegui ler ${caminho} como JSON: ${(error as Error).message}`);
  }
  const envelope = bruto as Partial<Envelope> | null;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error(`${caminho} não contém um envelope de objeto.`);
  }
  if (envelope.version !== 1 && envelope.version !== 2) {
    throw new Error(`versão desconhecida no envelope: ${String(envelope.version)} (a aplicação lê 1 e 2).`);
  }
  for (const campo of ['iv', 'tag', 'ciphertext'] as const) {
    const valor = envelope[campo];
    if (typeof valor !== 'string' || valor.length === 0 || valor.length % 2 !== 0
        || !/^[0-9a-f]+$/i.test(valor)) {
      throw new Error(`campo "${campo}" do envelope ausente ou inválido.`);
    }
  }
  return envelope as Envelope;
}

/** Re-cifra os registros com a chave nova, no mesmo formato da aplicação. */
function cifrar(registros: StoredOrderDraft[], chave: Buffer): Envelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chave, iv);
  cipher.setAAD(Buffer.from(ORDERS_AAD, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(registros), 'utf8')),
    cipher.final(),
  ]);
  return {
    version: 2, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
}

/** Decifra; se não decifrar, aborta com a mensagem do contexto. */
function decifrarOuAbortar(caminho: string, chave: Buffer, contexto: string): StoredOrderDraft[] {
  try {
    return decifrar(lerEnvelope(caminho), chave);
  } catch (error) {
    return falhar(`${contexto}\n         Detalhe: ${(error as Error).message}`);
  }
}

/**
 * Onde procurar a chave que CIFROU o arquivo hoje, da mais explícita para a
 * mais conveniente. `null` quando não há nenhuma — aí a rotação nem começa.
 * A ordem importa: `LOLA_ORDERS_ENCRYPTION_KEY` é a chave que o servidor usa
 * AGORA, por isso é a candidata natural a "antiga".
 */
function resolverChaveAntiga(dataDir: string): string | null {
  const arquivo = opcao('--old-key-file');
  if (arquivo) {
    if (!existsSync(arquivo)) return falhar(`arquivo da chave antiga não encontrado: ${arquivo}`);
    return readFileSync(arquivo, 'utf8');
  }
  const inline = opcao('--old-key');
  if (inline) return inline;
  const explicita = (process.env.LOLA_ORDERS_OLD_KEY || '').trim();
  if (explicita) return explicita;
  const emUso = (process.env.LOLA_ORDERS_ENCRYPTION_KEY || '').trim();
  if (emUso) return emUso;
  const vizinha = join(dataDir, 'orders.key');
  if (existsSync(vizinha)) return readFileSync(vizinha, 'utf8');
  return null;
}

/** A chave que passará a valer. Sem ela, não há rotação — só desconfiança. */
function resolverChaveNova(): string | null {
  const arquivo = opcao('--new-key-file');
  if (arquivo) {
    if (!existsSync(arquivo)) return falhar(`arquivo da chave nova não encontrado: ${arquivo}`);
    return readFileSync(arquivo, 'utf8');
  }
  const inline = opcao('--new-key');
  if (inline) return inline;
  return (process.env.LOLA_ORDERS_NEW_KEY || '').trim() || null;
}

// -----------------------------------------------------------------------------
// 1. Arquivo e chaves
// -----------------------------------------------------------------------------
const opcaoDataDir = opcao('--data-dir');
const opcaoArquivo = opcao('--file');
const dataDir = resolve(
  opcaoDataDir
  || (process.env.LOLA_DATA_DIR || '').trim()
  || '.data',
);
const arquivo = opcaoArquivo ? resolve(opcaoArquivo) : join(dataDir, 'orders.enc.json');
const seco = process.argv.includes('--dry-run');

const chaveAntiga = normalizarChave(resolverChaveAntiga(dataDir), 'chave antiga');
const chaveNova = normalizarChave(resolverChaveNova(), 'chave nova');

if (chaveAntiga.equals(chaveNova)) {
  falhar('a chave nova é idêntica à antiga — isto não é uma rotação.');
}

console.log(
  `[rotação] arquivo: ${arquivo}\n`
  + `[rotação] chave antiga: ${pegada(chaveAntiga)} | chave nova: ${pegada(chaveNova)} `
  + '(8 primeiros hex do SHA-256 de cada uma: dá para conferir qual é, sem imprimir o segredo.)',
);
if (seco) {
  aviso('DRY-RUN: nada será gravado no final, mas todo o trabalho roda — inclusive a prova de que a chave antiga decifra.');
}

if (!existsSync(arquivo)) {
  aviso(`não existe ${arquivo}: nada a rotacionar. Saindo com sucesso.`);
  process.exit(0);
}

// -----------------------------------------------------------------------------
// 2. Prova de que a chave antiga decifra — NUNCA sobrescrever sem isso
// -----------------------------------------------------------------------------
const registros = decifrarOuAbortar(
  arquivo,
  chaveAntiga,
  'a chave antiga NÃO decifra o arquivo. NADA foi alterado.',
);
console.log(`[rotação] OK: ${registros.length} pré-pedido(s) decifrado(s) com a chave antiga.`);

const estatisticaAntes = statSync(arquivo);

// -----------------------------------------------------------------------------
// 3. Reescreve com a chave nova num temporário e COMPROVA que ele lê
// -----------------------------------------------------------------------------
const temporario = `${arquivo}.${process.pid}.tmp`;

try {
  writeFileSync(temporario, JSON.stringify(cifrar(registros, chaveNova)) + '\n', { mode: 0o600 });
  chmodSync(temporario, 0o600);

  const relidos = decifrar(lerEnvelope(temporario), chaveNova);
  if (relidos.length !== registros.length) {
    throw new Error(`a reescrita tem ${relidos.length} registros e a original tinha ${registros.length}.`);
  }
  // Igualdade profunda: se a reescrita não reproduzir exatamente o conteúdo
  // original, ela não pode substituir o arquivo real.
  if (JSON.stringify(relidos) !== JSON.stringify(registros)) {
    throw new Error('o conteúdo reescrito difere do original.');
  }
} catch (error) {
  if (existsSync(temporario)) unlinkSync(temporario);
  falhar(
    'a reescrita com a chave nova não passou na prova de leitura. O arquivo '
    + `original está intacto. Detalhe: ${(error as Error).message}`,
  );
}

// -----------------------------------------------------------------------------
// 4. O arquivo não pode ter mudado durante a rotação (servidor rodando?)
// -----------------------------------------------------------------------------
const estatisticaDepois = statSync(arquivo);
if (estatisticaAntes.mtimeMs !== estatisticaDepois.mtimeMs
    || estatisticaAntes.size !== estatisticaDepois.size) {
  unlinkSync(temporario);
  falhar(
    `${arquivo} mudou durante a rotação: o servidor de dados está rodando e `
    + 'gravou um pedido no meio. Pare o serviço (docker compose stop data-server) '
    + 'e rode de novo. O arquivo original não foi alterado.',
  );
}

if (seco) {
  unlinkSync(temporario);
  console.log(
    `[rotação] DRY-RUN concluído: ${registros.length} pedido(s) seriam reescritos. `
    + 'Nada foi gravado. Para aplicar, rode de novo sem --dry-run.',
  );
  process.exit(0);
}

// -----------------------------------------------------------------------------
// 5. Troca atômica + conferência do arquivo que ficou
// -----------------------------------------------------------------------------
renameSync(temporario, arquivo);

decifrarOuAbortar(
  arquivo,
  chaveNova,
  'o arquivo FINAL não decifra com a chave nova (não deveria acontecer: o '
  + 'temporário foi provado antes da troca). Restaure o backup de .data/ e '
  + 'volte a chave antiga no ambiente.',
);

console.log(
  `[rotação] OK: ${registros.length} pré-pedido(s) reescrito(s) com a chave nova.\n`
  + '[rotação] Próximos passos:\n'
  + '  1. Atualize LOLA_ORDERS_ENCRYPTION_KEY (ou o LOLA_ORDERS_KEY_FILE) no ambiente do\n'
  + '     servidor de dados e reinicie o serviço.\n'
  + '  2. Confira no log que o servidor subiu com "pedidosCifrados=ativo".\n'
  + '  3. Mantenha a chave ANTIGA guardada no cofre enquanto houver backup antigo:\n'
  + '     sem ela, os backups anteriores a esta rotação ficam ilegíveis.\n'
  + '  4. Gere e guarde também um backup novo (./deploy/backup.sh) já com a chave nova.',
);
process.exit(0);
