#!/usr/bin/env bash
# =============================================================================
# deploy/drill-restore.sh — drill de recuperação: PROVA que o backup restaura
# =============================================================================
# Existe porque backup que você não restaurou não é backup. O `deploy/backup.sh`
# já testa a restauração do conteúdo candidato antes de gravar; este drill vai
# um passo além e executa o CICLO INTEIRO — gerar, copiar, arquivar, restaurar,
# decifrar, comparar — num diretório temporário, e sai alto se qualquer passo
# não fechar.
#
# O que ele prova, passo a passo:
#
#   1. monta um diretório temporário de dados (NUNCA o .data/ real da loja);
#   2. gera chave + pedidos cifrados com o PRÓPRIO código da aplicação
#      (`createLocalDataPlane` / `EncryptedOrderStore`, AES-256-GCM + AAD,
#      envelope v2) — não uma reimplementação;
#   3. roda `deploy/backup.sh` de verdade sobre esses dados;
#   4. restaura a partir do `.tar.gz` gerado e confere o manifesto SHA-256;
#   5. decifra os pedidos restaurados e compara CAMPO A CAMPO com o original;
#   6. simula PERDA DA CHAVE e exige que a restauração falhe alto (a mesma
#      recuperação, com a chave vinda de fora, precisa passar);
#   7. simula a chave errada (é o que travou o checkout em 13/10/2026) e o
#      ciphertext adulterado, e exige falha alta nos dois;
#   8. limpa tudo — inclusive quando falha no meio.
#
# -----------------------------------------------------------------------------
# USO
# -----------------------------------------------------------------------------
#   ./deploy/drill-restore.sh                 # roda o ciclo inteiro
#   ./deploy/drill-restore.sh --ajuda         # este texto
#
# Requisitos: node (>= 22) no PATH, `tsx` instalado no repositório e utilitários
# padrão (tar, sha256sum). Sai 0 quando TODOS os passos fecham; 1 quando algum
# passo falha; 2 para uso incorreto.
#
# Frequência sugerida: semanal, e sempre antes de uma janela de manutenção.
# Agendável (exemplo, toda segunda às 05:10 — o script precisa continuar DENTRO
# do repositório: ele carrega src/ e deploy/ pela raiz calculada a partir do
# próprio caminho, então não o copie para /usr/local/bin):
#   10 5 * * 1  . /etc/lola/segredos.sh; /opt/lola/deploy/drill-restore.sh >> $HOME/lola-backups/drill.log 2>&1
# O resultado esperado é um "DRILL OK" no log; a ausência dele é o alerta.
#
# Segurança do próprio drill:
#   * os dados gerados são fictícios (nomes e telefones de teste);
#   * tudo vive em `mktemp -d` e sai no EXIT, mesmo com erro;
#   * `$LOLA_DATA_DIR` real da loja só é citado numa guarda que RECUSA usá-lo.
# =============================================================================

set -euo pipefail

# node/npx não estão no PATH padrão nesta máquina.
export PATH="$HOME/.local/bin:$PATH"

# Arquivos do drill são temporários, mas o hábito de não deixar rastro de PII
# em mundo legível vale desde a primeira linha.
umask 077

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_BACKUP="$RAIZ/deploy/backup.sh"
SCRIPT_VERIFICA="$RAIZ/deploy/verify-orders-restore.mjs"
DADOS_REAIS="$RAIZ/.data"

say()  { printf '[drill] %s\n' "$*"; }
ok()   { printf '[drill]   ok: %s\n' "$*"; }
passo(){ printf '\n[drill] ===== %s =====\n' "$*"; }
falhar() { printf '[drill] FALHOU: %s\n' "$*" >&2; exit 1; }

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--ajuda" ]; then
  awk 'NR > 1 && /^set -euo pipefail/{exit} NR > 1{sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"
  exit 0
fi
[ $# -eq 0 ] || { echo "uso: $0 (sem argumentos; --ajuda para o texto)" >&2; exit 2; }

# -----------------------------------------------------------------------------
# Passo 1 — diretório temporário de dados e checagem das ferramentas
# -----------------------------------------------------------------------------
passo "passo 1/8 — diretório temporário de dados"

for ferramenta in node tar sha256sum cmp grep; do
  command -v "$ferramenta" >/dev/null 2>&1 \
    || falhar "ferramenta obrigatória ausente no PATH: $ferramenta"
done
[ -f "$SCRIPT_BACKUP" ]   || falhar "script de backup não encontrado: $SCRIPT_BACKUP"
[ -f "$SCRIPT_VERIFICA" ] || falhar "script de verificação não encontrado: $SCRIPT_VERIFICA"

if [ -x "$RAIZ/node_modules/.bin/tsx" ]; then
  TSX="$RAIZ/node_modules/.bin/tsx"
elif command -v tsx >/dev/null 2>&1; then
  TSX="$(command -v tsx)"
else
  falhar "tsx não encontrado. Rode 'npm install' em $RAIZ antes do drill (node_modules/.bin/tsx)."
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/lola-drill.XXXXXX")"

# Limpeza — roda em QUALQUER saída (sucesso, falha com set -e, Ctrl-C) e
# preserva o código de saída original.
ao_sair() {
  status=$?
  set +e
  if [ "$status" -eq 0 ]; then
    printf '\n[drill] limpeza: removendo %s\n' "$TMP"
  else
    printf '\n[drill] limpeza: removendo %s após falha (exit %s)\n' "$TMP" "$status" >&2
  fi
  rm -rf -- "$TMP"
  exit "$status"
}
trap ao_sair EXIT

# Guarda contra o único erro que não dá para desfazer: o drill nunca opera
# sobre o .data/ real da loja. Recusa qualquer caminho dentro dele.
garantir_fora_dos_dados_reais() {
  case "$1" in
    "$DADOS_REAIS"|"$DADOS_REAIS"/*)
      falhar "recusado: $1 está dentro de $DADOS_REAIS (dado real da loja). O drill só usa temporários." ;;
  esac
}
garantir_fora_dos_dados_reais "$TMP"

DIR_DADOS="$TMP/dados"
DIR_REF="$TMP/referencia"
DIR_BACKUP="$TMP/backups"
DIR_REST="$TMP/restaurado"
mkdir -p "$DIR_DADOS" "$DIR_REF" "$DIR_BACKUP" "$DIR_REST"
garantir_fora_dos_dados_reais "$DIR_DADOS"

say "repositório: $RAIZ"
say "temporário:  $TMP"
say "dado real:   $DADOS_REAIS (intocável — o drill não escreve aqui)"
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  say "atenção: node $(node -v) — a aplicação exige >= 22 (package.json engines)."
  say "         O drill segue rodando, mas não é o mesmo runtime de produção."
fi
ok "ferramentas presentes (node $(node -v)) e tsx resolvido"

# -----------------------------------------------------------------------------
# Passo 2 — chave + pedidos cifrados com o mesmo algoritmo da aplicação
# -----------------------------------------------------------------------------
passo "passo 2/8 — gerar par chave/pedidos com o código da aplicação"

# O auxiliar abaixo roda com tsx e IMPORTA os módulos reais da loja: ele não
# reimplementa cifra nenhuma. Fica no temporário de propósito — o drill não
# acrescenta arquivo ao repositório.
AJUDA="$TMP/drill-ajuda.mts"
cat > "$AJUDA" <<'DRILL_AJUDA'
// Auxiliar do deploy/drill-restore.sh. Importa os módulos REAIS da aplicação:
// o drill só prova alguma coisa se gerar e ler os pedidos com o mesmo código
// que a loja usa.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [comando, raizBruta, dirA, dirB] = process.argv.slice(2);
const raiz = resolve(raizBruta ?? '');

function falhar(mensagem: string): never {
  console.error('[drill] FALHOU: ' + mensagem);
  process.exit(1);
}

async function carregar(relativo: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(join(raiz, relativo)).href) as Promise<Record<string, unknown>>;
}

/** Rótulo de tipo para a comparação campo a campo. */
function tipo(valor: unknown): string {
  if (valor === null) return 'nulo';
  if (Array.isArray(valor)) return 'lista';
  return typeof valor;
}

let valoresConferidos = 0;

/** Comparação recursiva: anota o CAMINHO exato de cada valor divergente. */
function conferir(caminho: string, esperado: unknown, obtido: unknown, problemas: string[]): void {
  if (problemas.length >= 20) return;
  valoresConferidos += 1;
  const t1 = tipo(esperado);
  const t2 = tipo(obtido);
  if (t1 !== t2) {
    problemas.push(`${caminho}: esperado ${t1}, obtido ${t2}`);
    return;
  }
  if (t1 === 'lista') {
    const a = esperado as unknown[];
    const b = obtido as unknown[];
    if (a.length !== b.length) {
      problemas.push(`${caminho}: lista com ${a.length} itens, restaurado tem ${b.length}`);
      return;
    }
    a.forEach((item, i) => conferir(`${caminho}[${i}]`, item, b[i], problemas));
    return;
  }
  if (t1 === 'object') {
    const a = esperado as Record<string, unknown>;
    const b = obtido as Record<string, unknown>;
    const chaves = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const chave of chaves) {
      if (!Object.hasOwn(a, chave)) { problemas.push(`${caminho}.${chave}: ausente no original, presente no restaurado`); continue; }
      if (!Object.hasOwn(b, chave)) { problemas.push(`${caminho}.${chave}: presente no original, ausente no restaurado`); continue; }
      conferir(`${caminho}.${chave}`, a[chave], b[chave], problemas);
    }
    return;
  }
  if (esperado !== obtido) {
    problemas.push(`${caminho}: esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`);
  }
}

interface Plano {
  createDraft(corpo: unknown, meta: { ip: string }): Promise<{ status: number; body: Record<string, unknown> }>;
  orders: { listRecent(limite?: number): unknown[]; ready: boolean; unavailableReason: string | null };
}

// Pedidos fictícios de teste: passam pela validação real do servidor
// (buildOrderDraft), com preços vindos do catálogo, nunca do corpo.
const PEDIDOS_DE_TESTE = [
  {
    customer: {
      fullName: 'Marina Albuquerque Souza', phone: '21 98765-4321',
      cep: '20040-020', street: 'Rua dos Conde de Rio Bueno', number: '115',
      complement: 'apartamento 902', neighborhood: 'Centro', city: 'Rio de Janeiro', state: 'RJ',
    },
    items: [{ productId: 'brinco-1', quantity: 2 }],
    paymentMethod: 'pix', shippingOptionId: 'sedex', giftWrap: true, termsAccepted: true,
  },
  {
    customer: {
      fullName: 'Joana Ferreira Lima', phone: '(11) 99876-1020',
      cep: '01310-100', street: 'Avenida Paulista', number: '1000', complement: '',
      neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP',
    },
    items: [{ productId: 'prod-colar-1', quantity: 1 }, { productId: 'prod-anel-1', quantity: 1 }],
    paymentMethod: 'boleto', shippingOptionId: 'pac', giftWrap: false, termsAccepted: true,
  },
  {
    customer: {
      fullName: 'Rafael Nogueira Pinto', phone: '51 99123-4477',
      cep: '90010-150', street: 'Rua dos Andradas', number: '77', complement: 'loja 4',
      neighborhood: 'Centro Histórico', city: 'Porto Alegre', state: 'RS',
    },
    items: [{ productId: 'prod-pulseira-1', quantity: 3 }],
    paymentMethod: 'pix', shippingOptionId: 'transportadora', giftWrap: false, termsAccepted: true,
    couponCode: 'LOLA10',
  },
];

async function gerar(): Promise<void> {
  if (!dirA || !dirB) falhar('uso: gerar <raiz> <dir-dados> <dir-referencia>');
  const mod = await carregar('src/server/dataPlane.ts');
  const criarPlano = mod.createLocalDataPlane as (opcoes: unknown) => Plano;
  if (typeof criarPlano !== 'function') falhar('createLocalDataPlane não encontrado em src/server/dataPlane.ts');

  const dirDados = resolve(dirA);
  mkdirSync(dirDados, { recursive: true, mode: 0o700 });
  // Modo desenvolvimento (production: false): a chave nasce AO LADO do
  // ciphertext, em orders.key — é o modo que o backup de .data/ conhece.
  const plano = criarPlano({
    dataDir: dirDados, production: false, reservationTtlMs: 900_000, retentionDays: 90,
  });

  for (const corpo of PEDIDOS_DE_TESTE) {
    const resposta = await plano.createDraft(corpo, { ip: '203.0.113.42' });
    if (resposta.status !== 201) {
      falhar(`o plano de dados recusou o pedido de teste (${resposta.status}): ${JSON.stringify(resposta.body)}`);
    }
  }

  const pedidos = plano.orders.listRecent(100);
  if (pedidos.length !== PEDIDOS_DE_TESTE.length) {
    falhar(`esperava ${PEDIDOS_DE_TESTE.length} pedidos gravados, o armazenamento tem ${pedidos.length}.`);
  }

  const dirRef = resolve(dirB);
  mkdirSync(dirRef, { recursive: true, mode: 0o700 });
  writeFileSync(join(dirRef, 'pedidos.json'), JSON.stringify(pedidos, null, 2) + '\n', { mode: 0o600 });
  cpSync(join(dirDados, 'inventory.json'), join(dirRef, 'inventory.json'));

  console.log(`[drill] ${pedidos.length} pré-pedido(s) gravados pelo próprio plano de dados (AES-256-GCM + AAD, envelope v2).`);
}

async function conferirRestaurado(): Promise<void> {
  if (!dirA || !dirB) falhar('uso: conferir <raiz> <dir-restaurado> <arquivo-referencia>');
  const mod = await carregar('src/server/orders.ts');
  const Store = mod.EncryptedOrderStore as new (dir: string) => {
    ready: boolean; unavailableReason: string | null; listRecent(limite?: number): unknown[];
  };
  if (typeof Store !== 'function') falhar('EncryptedOrderStore não encontrado em src/server/orders.ts');

  const dirRestaurado = resolve(dirA);
  const referencia = JSON.parse(readFileSync(resolve(dirB), 'utf8')) as Array<{ orderNumber: string }>;
  const store = new Store(dirRestaurado);
  if (!store.ready) {
    falhar(`o servidor não abriu o arquivo restaurado: ${store.unavailableReason ?? 'motivo não informado'}`);
  }

  const restaurados = store.listRecent(100) as Array<Record<string, unknown> & { orderNumber: string }>;
  const problemas: string[] = [];
  if (restaurados.length !== referencia.length) {
    problemas.push(`quantidade de pedidos: esperado ${referencia.length}, restaurado ${restaurados.length}`);
  }

  const porNumero = new Map(restaurados.map((registro) => [registro.orderNumber, registro]));
  for (const esperado of referencia) {
    const obtido = porNumero.get(esperado.orderNumber);
    if (!obtido) {
      problemas.push(`pedido ${esperado.orderNumber} ausente no arquivo restaurado`);
      continue;
    }
    porNumero.delete(esperado.orderNumber);
    conferir(`pedido[${esperado.orderNumber}]`, esperado, obtido, problemas);
  }
  for (const sobra of porNumero.keys()) {
    problemas.push(`pedido ${sobra} existe no restaurado mas não na referência`);
  }

  if (problemas.length > 0) {
    for (const problema of problemas) console.error('[drill]   - ' + problema);
    falhar(`${problemas.length} divergência(s) entre o original e o restaurado.`);
  }
  console.log(`[drill] ${referencia.length} pedido(s) conferidos campo a campo (${valoresConferidos} valores comparados).`);
}

if (comando === 'gerar') {
  await gerar();
} else if (comando === 'conferir') {
  await conferirRestaurado();
} else {
  falhar(`comando desconhecido: ${comando ?? '(vazio)'}`);
}
DRILL_AJUDA

if ! "$TSX" "$AJUDA" gerar "$RAIZ" "$DIR_DADOS" "$DIR_REF"; then
  falhar "não consegui gerar os dados de teste com o código da aplicação."
fi

[ -f "$DIR_DADOS/orders.enc.json" ] || falhar "orders.enc.json não foi criado em $DIR_DADOS."
[ -f "$DIR_DADOS/orders.key" ]      || falhar "orders.key não foi criado em $DIR_DADOS."
[ -f "$DIR_DADOS/inventory.json" ]  || falhar "inventory.json não foi criado em $DIR_DADOS."
[ -f "$DIR_REF/pedidos.json" ]      || falhar "a referência em claro não foi gravada em $DIR_REF."
ok "chave, ciphertext e estoque prontos em temporário"
say "aviso: em desenvolvimento a chave fica AO LADO do ciphertext; em produção"
say "       ela vem de fora de .data/ (ver docs/DR.md) — o passo 6 simula isso."

# -----------------------------------------------------------------------------
# Passo 3 — backup de verdade, com o script de produção
# -----------------------------------------------------------------------------
passo "passo 3/8 — executar deploy/backup.sh"

if ! LOLA_DATA_DIR="$DIR_DADOS" LOLA_BACKUP_DEST="$DIR_BACKUP" LOLA_BACKUP_KEEP=5 \
    bash "$SCRIPT_BACKUP"; then
  falhar "deploy/backup.sh saiu com erro sobre dados válidos."
fi

ARTEFATO="$( { ls -1t "$DIR_BACKUP"/lola-*.tar.gz 2>/dev/null || true; } | head -n 1 )"
[ -n "$ARTEFATO" ] || falhar "o backup não deixou nenhum .tar.gz em $DIR_BACKUP."
[ -f "$ARTEFATO" ] || falhar "artefato inexistente: $ARTEFATO"
ok "artefato: $(basename "$ARTEFATO") ($(stat -c %s "$ARTEFATO") bytes)"

# -----------------------------------------------------------------------------
# Passo 4 — restaurar a partir do artefato e conferir integridade
# -----------------------------------------------------------------------------
passo "passo 4/8 — restaurar a partir do artefato"

if ! tar -xzf "$ARTEFATO" -C "$DIR_REST"; then
  falhar "o .tar.gz não pôde ser extraído — backup ilegível."
fi
[ -f "$DIR_REST/dados/orders.enc.json" ] || falhar "restauração não devolveu orders.enc.json."
[ -f "$DIR_REST/dados/inventory.json" ]  || falhar "restauração não devolveu inventory.json."
[ -f "$DIR_REST/MANIFEST.txt" ]          || falhar "restauração não devolveu MANIFEST.txt."

if ! grep -E '^[0-9a-f]{64}  ' "$DIR_REST/MANIFEST.txt" > "$TMP/manifesto.sha256"; then
  falhar "MANIFEST.txt sem sombras SHA-256 — backup gerado fora do formato esperado."
fi
if ! ( cd "$DIR_REST" && sha256sum -c "$TMP/manifesto.sha256" ); then
  falhar "as sombras SHA-256 dos arquivos restaurados não conferem com o manifesto."
fi
ok "manifesto SHA-256 confere para todos os arquivos"

if ! cmp -s "$DIR_REF/inventory.json" "$DIR_REST/dados/inventory.json"; then
  falhar "inventory.json restaurado difere do original (byte a byte)."
fi
ok "inventory.json idêntico ao original"

# -----------------------------------------------------------------------------
# Passo 5 — decifrar e comparar campo a campo
# -----------------------------------------------------------------------------
passo "passo 5/8 — decifrar e conferir campo a campo"

# Sem LOLA_ORDERS_* no ambiente de propósito: a chave vem do arquivo restaurado
# (modo desenvolvimento), que é exatamente o que quem restaura um .data/ tem.
if ! env -u LOLA_ORDERS_ENCRYPTION_KEY -u LOLA_ORDERS_KEY_FILE \
    node "$SCRIPT_VERIFICA" --file "$DIR_REST/dados/orders.enc.json" \
    --inventory "$DIR_REST/dados/inventory.json"; then
  falhar "verify-orders-restore.mjs recusou o conteúdo restaurado."
fi

if ! "$TSX" "$AJUDA" conferir "$RAIZ" "$DIR_REST/dados" "$DIR_REF/pedidos.json"; then
  falhar "a comparação campo a campo encontrou divergência."
fi
ok "pedidos restaurados == pedidos gerados, campo a campo"

# -----------------------------------------------------------------------------
# Passo 6 — perda da chave: a restauração TEM que falhar alto
# -----------------------------------------------------------------------------
passo "passo 6/8 — simular perda da chave"

# Cópia como a de produção: o backup de .data/ não leva a chave AES, então a
# cópia sem a chave é o cenário normal de quem restaura sem cofre de segredos.
DIR_SEM_CHAVE="$TMP/restaurado-sem-chave"
mkdir -p "$DIR_SEM_CHAVE"
cp -a "$DIR_REST/dados" "$DIR_SEM_CHAVE/dados"
rm -f "$DIR_SEM_CHAVE/dados/orders.key"

SAIDA="$TMP/saida-sem-chave.txt"
RC=0
env -u LOLA_ORDERS_ENCRYPTION_KEY -u LOLA_ORDERS_KEY_FILE \
  node "$SCRIPT_VERIFICA" --file "$DIR_SEM_CHAVE/dados/orders.enc.json" \
  --inventory "$DIR_SEM_CHAVE/dados/inventory.json" >"$SAIDA" 2>&1 || RC=$?
if [ "$RC" -eq 0 ]; then
  cat "$SAIDA" >&2
  falhar "a restauração SEM chave passou. Backup sem chave devolveria lixo em silêncio."
fi
ok "sem chave recusado (exit $RC): $(tail -n 1 "$SAIDA")"

# A mesma cópia, com a chave vinda de FORA (é como tem que ser em produção):
# cofre de segredos no ambiente do processo, nunca dentro do backup.
COFRE="$TMP/cofre"
mkdir -p "$COFRE"
cp "$DIR_DADOS/orders.key" "$COFRE/chave-orders.key"
chmod 600 "$COFRE/chave-orders.key"

SAIDA="$TMP/saida-chave-de-fora.txt"
RC=0
env -u LOLA_ORDERS_ENCRYPTION_KEY LOLA_ORDERS_KEY_FILE="$COFRE/chave-orders.key" \
  node "$SCRIPT_VERIFICA" --file "$DIR_SEM_CHAVE/dados/orders.enc.json" \
  --inventory "$DIR_SEM_CHAVE/dados/inventory.json" >"$SAIDA" 2>&1 || RC=$?
if [ "$RC" -ne 0 ]; then
  cat "$SAIDA" >&2
  falhar "a restauração com a chave vinda de fora do backup FALHOU (exit $RC)."
fi
ok "com a chave do cofre, o mesmo backup restaura: $(tail -n 1 "$SAIDA")"

# -----------------------------------------------------------------------------
# Passo 7 — chave que não casa e ciphertext adulterado: falha alta nos dois
# -----------------------------------------------------------------------------
passo "passo 7/8 — chave errada e ciphertext corrompido"

# É o caso de 13/10/2026: orders.key não batia com orders.enc.json e o
# checkout travou. O par ilegível está preservado em
# ~/backups/lola-pedidos-ilegiveis-20261013-203712/ (ver docs/DR.md).
CHAVE_ERRADA="$COFRE/chave-errada.key"
node -e 'require("node:fs").writeFileSync(process.argv[1], require("node:crypto").randomBytes(32).toString("hex"), { mode: 0o600 })' "$CHAVE_ERRADA"

SAIDA="$TMP/saida-chave-errada.txt"
RC=0
env -u LOLA_ORDERS_ENCRYPTION_KEY LOLA_ORDERS_KEY_FILE="$CHAVE_ERRADA" \
  node "$SCRIPT_VERIFICA" --file "$DIR_REST/dados/orders.enc.json" \
  --inventory "$DIR_REST/dados/inventory.json" >"$SAIDA" 2>&1 || RC=$?
if [ "$RC" -eq 0 ]; then
  cat "$SAIDA" >&2
  falhar "a chave errada passou. O par que não casa seria aceito — era exatamente o bug."
fi
ok "chave que não casa recusada (exit $RC): $(tail -n 1 "$SAIDA")"

DIR_TAMPER="$TMP/restaurado-tamper"
mkdir -p "$DIR_TAMPER"
cp -a "$DIR_REST/dados" "$DIR_TAMPER/dados"
node -e '
  const fs = require("node:fs");
  const arquivo = process.argv[1];
  const envelope = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  const bytes = Buffer.from(envelope.ciphertext, "hex");
  bytes[Math.floor(bytes.length / 2)] ^= 0x01; // um bit invertido no meio da cifra
  envelope.ciphertext = bytes.toString("hex");
  fs.writeFileSync(arquivo, JSON.stringify(envelope) + "\n", { mode: 0o600 });
' "$DIR_TAMPER/dados/orders.enc.json"

SAIDA="$TMP/saida-tamper.txt"
RC=0
env -u LOLA_ORDERS_ENCRYPTION_KEY -u LOLA_ORDERS_KEY_FILE \
  node "$SCRIPT_VERIFICA" --file "$DIR_TAMPER/dados/orders.enc.json" \
  --inventory "$DIR_TAMPER/dados/inventory.json" >"$SAIDA" 2>&1 || RC=$?
if [ "$RC" -eq 0 ]; then
  cat "$SAIDA" >&2
  falhar "ciphertext adulterado passou na verificação — a tag GCM não está sendo conferida."
fi
ok "ciphertext adulterado recusado (exit $RC): $(tail -n 1 "$SAIDA")"

# -----------------------------------------------------------------------------
# Passo 8 — resultado (a limpeza roda no EXIT, com sucesso ou com falha)
# -----------------------------------------------------------------------------
passo "passo 8/8 — resultado"
say "8/8 passos fecharam: backup GERADO, RESTAURADO e LIDO, e as três"
say "modalidades de falha (sem chave, chave errada, cifra adulterada) recusadas."
say "DADO REAL: $DADOS_REAIS não foi lido nem escrito."
printf '\n[drill] DRILL OK — o backup desta loja restaura.\n'
printf '[drill] Backup que você não restaurou não é backup.\n'
exit 0
