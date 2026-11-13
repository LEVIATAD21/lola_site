// Gera configuração de implantação REAL do serviço cron com dois D1.
// Não inventamos o UUID de USERS_DB. Sem o UUID, NENHUM deploy é liberado.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CORE_ID = '5c523efb-8580-48ae-bdb0-bd4fb2ae7fb5';
const USERS_ID = (process.env.LOLA_USERS_DATABASE_ID || '').trim();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
if (!uuid.test(USERS_ID) || USERS_ID.toLowerCase() === CORE_ID) {
  throw new Error('Defina LOLA_USERS_DATABASE_ID com o UUID REAL do novo banco lola-users-db, diferente do D1 principal.');
}
const config = `name = "lola-maintenance"
main = "src/maintenance.js"
compatibility_date = "2026-11-13"
workers_dev = false

[triggers]
crons = ["0 3 * * *"]

[[d1_databases]]
binding = "DB"
database_name = "lola_db_2026"
database_id = "${CORE_ID}"

[[d1_databases]]
binding = "USERS_DB"
database_name = "lola-users-db"
database_id = "${USERS_ID}"
`;
const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, 'wrangler.toml'), config, { encoding: 'utf8', mode: 0o600 });
console.log('Configuração gerada: lola-maintenance; DB principal + USERS_DB, agendamento diário 03:00 UTC.');
