-- Teste de integridade de migração em PostgreSQL REAL no CI.
-- Todos os registros criados aqui são temporários: a transação termina em ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  c_id uuid;
  o_id uuid;
  payment_id uuid;
BEGIN
  IF (SELECT count(*) FROM schema_migrations WHERE version = '0001_core') <> 1 THEN
    RAISE EXCEPTION 'Migração não foi registrada uma única vez';
  END IF;

  INSERT INTO customers(email, password_hash, full_name)
    VALUES ('db-ci@invalid.example', repeat('argon2id-not-an-actual-hash', 3), 'Teste de Integridade')
    RETURNING id INTO c_id;

  INSERT INTO products(id, name, category, price_cents, published)
    VALUES ('schema-ci-item', 'Produto de verificação SQL', 'Acessórios', 9900, true);
  INSERT INTO inventory(product_id, quantity_on_hand, quantity_reserved)
    VALUES ('schema-ci-item', 2, 1);

  INSERT INTO orders(
    order_number, customer_id, payment_method, shipping_method,
    shipping_address, subtotal_cents, total_cents
  ) VALUES (
    'LOLA-20261113-ABCDEF123456', c_id, 'pix', 'sedex',
    '{"city":"Rio de Janeiro","state":"RJ"}'::jsonb, 9900, 9900
  ) RETURNING id INTO o_id;

  INSERT INTO order_items(order_id, product_id, product_name_snapshot, quantity, unit_price_cents, line_total_cents)
    VALUES (o_id, 'schema-ci-item', 'Produto de verificação SQL', 1, 9900, 9900);

  INSERT INTO payments(order_id, external_reference, payment_method, amount_cents)
    VALUES (o_id, 'schema-ci-unique-payment', 'pix', 9900)
    RETURNING id INTO payment_id;

  INSERT INTO payment_webhook_events(provider_event_id, event_type, payload)
    VALUES ('evt-schema-ci-1', 'PAYMENT_RECEIVED', '{"id":"evt-schema-ci-1"}'::jsonb);

  BEGIN
    INSERT INTO payment_webhook_events(provider_event_id, event_type, payload)
      VALUES ('evt-schema-ci-1', 'PAYMENT_RECEIVED', '{}'::jsonb);
    RAISE EXCEPTION 'Webhook duplicado foi aceito';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO payments(order_id, external_reference, payment_method, amount_cents)
      VALUES (o_id, 'schema-ci-unique-payment', 'pix', 9900);
    RAISE EXCEPTION 'Referência financeira duplicada foi aceita';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    UPDATE inventory SET quantity_reserved = 3 WHERE product_id = 'schema-ci-item';
    RAISE EXCEPTION 'Reserva acima do estoque foi aceita';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO orders(order_number, customer_id, payment_method, shipping_method, shipping_address, subtotal_cents, total_cents)
      VALUES ('LOLA-20261113-ABCDEF123457', c_id, 'pix', 'sedex', '{}'::jsonb, 9900, 10000);
    RAISE EXCEPTION 'Total financeiro divergente foi aceito';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  IF (SELECT amount_cents FROM payments WHERE id = payment_id) <> 9900 THEN
    RAISE EXCEPTION 'Pagamento perdeu integridade';
  END IF;
END
$verify$;
ROLLBACK;
