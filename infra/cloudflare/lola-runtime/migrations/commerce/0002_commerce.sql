-- LOLA / D1 DB: livro comercial, pagamentos e artefatos efêmeros.
-- Aplicar SOMENTE no D1 principal lola_db_2026 após backup e revisão.
-- As tabelas financeiras NÃO são apagadas pelo Cron.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS commerce_orders (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  order_number TEXT NOT NULL UNIQUE CHECK (length(order_number) BETWEEN 8 AND 80),
  -- Referência estável para USERS_DB; não existe FK entre dois bancos D1.
  user_id TEXT NOT NULL CHECK (length(user_id) BETWEEN 16 AND 80),
  status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN (
    'awaiting_payment','payment_processing','paid','fulfillment','shipped',
    'delivered','cancelled','refund_processing','partially_refunded','refunded'
  )),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN (
    'pending','processing','paid','partially_refunded','refunded','cancelled','failed'
  )),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix','credit_card')),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  gift_wrap_cents INTEGER NOT NULL DEFAULT 0 CHECK (gift_wrap_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  retention_review_after TEXT,
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0,1)),
  CHECK (discount_cents <= subtotal_cents),
  CHECK (total_cents = subtotal_cents - discount_cents + shipping_cents + gift_wrap_cents)
);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_user ON commerce_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_status ON commerce_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_order_lines (
  order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  line_index INTEGER NOT NULL CHECK (line_index >= 0),
  product_id TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL CHECK (length(product_name_snapshot) BETWEEN 1 AND 180),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  PRIMARY KEY (order_id,line_index),
  CHECK (line_total_cents = quantity * unit_price_cents)
);

CREATE TABLE IF NOT EXISTS commerce_payments (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'asaas' CHECK (provider = 'asaas'),
  provider_payment_id TEXT UNIQUE,
  external_reference TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL CHECK (method IN ('pix','credit_card')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  status TEXT NOT NULL CHECK (status IN (
    'created','pending','processing','confirmed','received','cancelled',
    'overdue','failed','partially_refunded','refunded'
  )),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  confirmed_at TEXT,
  last_reconciled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_commerce_payment_order ON commerce_payments(order_id);

CREATE TABLE IF NOT EXISTS commerce_payment_webhooks (
  provider_event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'asaas' CHECK (provider = 'asaas'),
  event_type TEXT NOT NULL,
  payment_id TEXT,
  -- Payload financeiro sanitizado: não persistir comprovantes/PII bruto.
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','processed','ignored','retry','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  processed_at TEXT,
  next_attempt_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_commerce_webhook_retry ON commerce_payment_webhooks(status,next_attempt_at)
  WHERE status IN ('received','retry');

CREATE TABLE IF NOT EXISTS commerce_refunds (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  payment_id TEXT NOT NULL REFERENCES commerce_payments(id) ON DELETE RESTRICT,
  approved_by_operator_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 200),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 5 AND 500),
  status TEXT NOT NULL CHECK (status IN ('requested','processing','succeeded','failed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS commerce_financial_audit (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  payment_id TEXT REFERENCES commerce_payments(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 3 AND 120),
  amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents >= 0),
  reference_hash TEXT,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_commerce_financial_audit_order ON commerce_financial_audit(order_id,occurred_at DESC);

-- Esta tabela guarda somente metadados/cache descartáveis e nunca o único
-- comprovante fiscal ou registro da transação. Sem PDF/base64/boleto bruto no D1.
CREATE TABLE IF NOT EXISTS commerce_temporary_artifacts (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  order_id TEXT REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('pix_qr_cache','boleto_preview_cache','temporary_receipt_copy','download_ticket')),
  -- Sem chave de objeto R2 até que exista pipeline de deleção efetiva de bytes.
  cache_digest TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0,1)),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_temp_artifacts_expiry
  ON commerce_temporary_artifacts(expires_at)
  WHERE legal_hold = 0;

-- Uma integração assíncrona materializa o histórico de compras em USERS_DB.
-- Não há transação distribuída entre bancos D1; a sincronização é repetível
-- por aggregate_id/revision, com revisão monotônica e deduplicação.
CREATE TABLE IF NOT EXISTS commerce_outbox (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  aggregate_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  event_type TEXT NOT NULL CHECK (event_type IN ('order_snapshot','order_status_changed')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','done','retry')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  next_attempt_at TEXT,
  done_at TEXT,
  UNIQUE (aggregate_id,revision,event_type)
);
CREATE INDEX IF NOT EXISTS idx_commerce_outbox_pending
  ON commerce_outbox(state,next_attempt_at)
  WHERE state IN ('pending','retry');
