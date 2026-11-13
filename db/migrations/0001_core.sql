-- LOLA: fundação transacional para uma única loja.
-- PostgreSQL >= 16. Execute com psql -X -v ON_ERROR_STOP=1 -1 -f ...
-- Dados de pagamento reais NÃO podem ser habilitados antes de conectar o Data Server
-- a estas tabelas, homologar webhook/checkout e validar backup + restore.
-- Evite alterações destrutivas nesta migração depois de aplicada.
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (length(email) BETWEEN 5 AND 320),
  password_hash text NOT NULL CHECK (length(password_hash) BETWEEN 30 AND 512),
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 3 AND 120),
  phone text CHECK (phone IS NULL OR phone ~ '^[0-9]{10,11}$'),
  email_verified_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_email_lower ON customers (lower(email));

CREATE TABLE IF NOT EXISTS customer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at)
);
CREATE INDEX IF NOT EXISTS ix_customer_sessions_validity ON customer_sessions(customer_id, expires_at);

CREATE TABLE IF NOT EXISTS customer_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS admin_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL CHECK (length(username) BETWEEN 3 AND 80),
  password_hash text NOT NULL CHECK (length(password_hash) BETWEEN 30 AND 512),
  mfa_secret_encrypted bytea,
  mfa_enabled_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mfa_enabled_at IS NULL OR mfa_secret_encrypted IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_username_lower ON admin_operators(lower(username));

CREATE TABLE IF NOT EXISTS admin_operator_roles (
  operator_id uuid NOT NULL REFERENCES admin_operators(id) ON DELETE CASCADE,
  role_name text NOT NULL CHECK (role_name IN ('owner', 'manager', 'support')),
  PRIMARY KEY (operator_id, role_name)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES admin_operators(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  csrf_hash bytea NOT NULL CHECK (octet_length(csrf_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (absolute_expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS ix_admin_sessions_expiry ON admin_sessions(operator_id, absolute_expires_at);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 180),
  category text NOT NULL CHECK (length(category) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '',
  price_cents bigint NOT NULL CHECK (price_cents >= 0),
  material text,
  color text,
  image_object_key text,
  published boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_products_published ON products(category, name) WHERE published = true AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS inventory (
  product_id text PRIMARY KEY REFERENCES products(id) ON DELETE RESTRICT,
  quantity_on_hand integer NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved integer NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity_reserved <= quantity_on_hand)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  delta integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('restock', 'sale', 'return', 'correction', 'reservation', 'release')),
  reference_id text,
  actor_operator_id uuid REFERENCES admin_operators(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_inventory_movements_product ON inventory_movements(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE CHECK (order_number ~ '^LOLA-[0-9]{8}-[A-F0-9]{12}$'),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment', 'payment_processing', 'paid', 'fulfillment', 'shipped', 'delivered', 'cancelled', 'refund_processing', 'partially_refunded', 'refunded')),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'processing', 'paid', 'partially_refunded', 'refunded', 'cancelled', 'failed')),
  payment_method text NOT NULL CHECK (payment_method IN ('pix', 'credit_card')),
  shipping_method text NOT NULL CHECK (length(shipping_method) BETWEEN 1 AND 80),
  shipping_address jsonb NOT NULL CHECK (jsonb_typeof(shipping_address) = 'object'),
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents bigint NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  shipping_cents bigint NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  gift_wrap_cents bigint NOT NULL DEFAULT 0 CHECK (gift_wrap_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CHECK (discount_cents <= subtotal_cents),
  CHECK (total_cents = subtotal_cents - discount_cents + shipping_cents + gift_wrap_cents)
);
CREATE INDEX IF NOT EXISTS ix_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents bigint NOT NULL CHECK (line_total_cents >= 0),
  CHECK (line_total_cents = quantity::bigint * unit_price_cents)
);
CREATE INDEX IF NOT EXISTS ix_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'committed', 'released', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, product_id)
);
CREATE INDEX IF NOT EXISTS ix_reservations_expiry ON inventory_reservations(expires_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'asaas' CHECK (provider = 'asaas'),
  provider_payment_id text,
  external_reference text NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('pix', 'credit_card')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency char(3) NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'pending', 'processing', 'confirmed', 'received', 'overdue', 'cancelled', 'failed', 'partially_refunded', 'refunded')),
  expires_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_id
  ON payments(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_payment_reference
  ON payments(order_id, provider, external_reference);
CREATE INDEX IF NOT EXISTS ix_payments_pending ON payments(status, created_at) WHERE status IN ('created', 'pending', 'processing');

CREATE TABLE IF NOT EXISTS payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('create', 'verify', 'cancel', 'reconcile')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 200),
  result text NOT NULL DEFAULT 'pending'
    CHECK (result IN ('pending', 'succeeded', 'failed', 'unknown')),
  provider_request_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(payment_id, action, idempotency_key)
);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL DEFAULT 'asaas' CHECK (provider = 'asaas'),
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'processed', 'ignored', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  next_attempt_at timestamptz,
  last_error_code text,
  UNIQUE(provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS ix_webhook_work_queue ON payment_webhook_events(status, next_attempt_at, received_at)
  WHERE status IN ('queued', 'failed');

CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  requested_by_operator_id uuid NOT NULL REFERENCES admin_operators(id) ON DELETE RESTRICT,
  approved_by_operator_id uuid REFERENCES admin_operators(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 200),
  provider_refund_id text,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 1000),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'processing', 'succeeded', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_provider_id
  ON refunds(provider_refund_id) WHERE provider_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_refunds_payment ON refunds(payment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operator_id uuid REFERENCES admin_operators(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (length(action) BETWEEN 3 AND 120),
  target_type text NOT NULL CHECK (length(target_type) BETWEEN 2 AND 100),
  target_id text,
  request_id text,
  event_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_admin_audit_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_admin_audit_target ON admin_audit_log(target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tracking_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tracking_tokens_order ON tracking_tokens(order_id);

CREATE TABLE IF NOT EXISTS outbox_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic text NOT NULL CHECK (length(topic) BETWEEN 3 AND 150),
  dedupe_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'published', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_outbox_queue ON outbox_events(status, available_at)
  WHERE status IN ('queued', 'failed');

INSERT INTO schema_migrations(version) VALUES ('0001_core')
ON CONFLICT(version) DO NOTHING;
COMMIT;
