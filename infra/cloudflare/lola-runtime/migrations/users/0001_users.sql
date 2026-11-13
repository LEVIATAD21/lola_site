-- LOLA / D1 USERS_DB: contas e histórico espelhado de compras.
-- Use SOMENTE no banco lola-users-db (não no banco de catálogo).
-- SQLite com foreign_keys habilitadas; nenhum CPF, RG ou foto de documento.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(email) BETWEEN 5 AND 254),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  phone_e164 TEXT UNIQUE CHECK (phone_e164 IS NULL OR phone_e164 GLOB '+[0-9]*'),
  email_verified_at TEXT,
  phone_verified_at TEXT,
  disabled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS user_passwords (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Apenas hashes PHC Argon2id (nunca plaintext/password reversível).
  password_hash TEXT NOT NULL CHECK (password_hash LIKE '$argon2id$%' AND length(password_hash) BETWEEN 80 AND 512),
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS verification_challenges (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  digest_hex TEXT NOT NULL CHECK (length(digest_hex) = 64),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_verification_expiry ON verification_challenges(expires_at)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_verification_user ON verification_challenges(user_id, purpose);

CREATE TABLE IF NOT EXISTS phone_verification_attempts (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL CHECK (phone_e164 GLOB '+[0-9]*'),
  provider TEXT NOT NULL CHECK (provider IN ('twilio-verify','firebase-auth')),
  state TEXT NOT NULL CHECK (state IN ('pending','approved','expired','failed')),
  provider_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_phone_attempts_expires ON phone_verification_attempts(expires_at);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash_hex TEXT NOT NULL UNIQUE CHECK (length(token_hash_hex) = 64),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_buckets (
  bucket_key_hash TEXT NOT NULL CHECK (length(bucket_key_hash) = 64),
  scope TEXT NOT NULL CHECK (scope IN ('login','email-send','verify-email','phone-send','phone-check','password-reset')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  reset_at TEXT NOT NULL,
  PRIMARY KEY(bucket_key_hash, scope)
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_expiry ON auth_rate_buckets(reset_at);

-- Projeção somente leitura para Minha Conta: o valor autoritativo vive
-- no banco principal. Reconciliação por outbox; D1 distintos não têm
-- transação/FK cruzada. Campos de endereço/PII não são duplicados aqui.
CREATE TABLE IF NOT EXISTS purchase_summaries (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL UNIQUE,
  purchased_at TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
  shipping_cents INTEGER NOT NULL CHECK (shipping_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  order_status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (subtotal_cents >= discount_cents)
);
CREATE INDEX IF NOT EXISTS idx_purchase_user ON purchase_summaries(user_id, purchased_at DESC);

CREATE TABLE IF NOT EXISTS purchase_lines (
  order_id TEXT NOT NULL REFERENCES purchase_summaries(order_id) ON DELETE CASCADE,
  line_index INTEGER NOT NULL CHECK (line_index >= 0),
  product_id TEXT,
  purchased_name TEXT NOT NULL CHECK (length(purchased_name) BETWEEN 1 AND 180),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  PRIMARY KEY(order_id, line_index),
  CHECK (total_cents = quantity * unit_price_cents)
);

-- Metadados de consentimento: não coletar marketing por padrão.
CREATE TABLE IF NOT EXISTS privacy_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('terms_accepted','privacy_notice_acknowledged','marketing_opt_in','marketing_opt_out','erasure_requested','erasure_completed')),
  policy_version TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
