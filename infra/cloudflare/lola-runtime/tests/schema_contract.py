#!/usr/bin/env python3
"""Valida migrations SQLite REALMENTE com duas conexões D1 independentes."""
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parents[1]
users_sql = (root / "migrations/users/0001_users.sql").read_text(encoding="utf-8")
commerce_sql = (root / "migrations/commerce/0002_commerce.sql").read_text(encoding="utf-8")
users = sqlite3.connect(":memory:")
commerce = sqlite3.connect(":memory:")
for db in (users, commerce):
    db.execute("PRAGMA foreign_keys=ON")
for _ in range(2):
    users.executescript(users_sql)
    commerce.executescript(commerce_sql)

user_id = "u-" + "1" * 32
order_id = "o-" + "2" * 32
payment_id = "p-" + "3" * 32
users.execute("INSERT INTO users(id,email,name) VALUES(?,?,?)", (user_id,"customer@example.invalid","Cliente de teste"))
assert users.execute("SELECT phone_verified_at FROM users WHERE id=?", (user_id,)).fetchone()[0] is None
commerce.execute(
    """INSERT INTO commerce_orders(
       id,order_number,user_id,payment_method,subtotal_cents,discount_cents,
       shipping_cents,gift_wrap_cents,total_cents)
       VALUES (?,?,?,?,?,?,?,?,?)""",
    (order_id,"LOLA-SQL-TEST-1",user_id,"pix",19900,1000,1500,0,20400)
)
commerce.execute(
    "INSERT INTO commerce_order_lines(order_id,line_index,product_id,product_name_snapshot,quantity,unit_price_cents,line_total_cents) VALUES(?,?,?,?,?,?,?)",
    (order_id,0,"p-01","Produto verificado",2,9950,19900)
)
commerce.execute(
    "INSERT INTO commerce_payments(id,order_id,external_reference,method,amount_cents,status) VALUES (?,?,?,?,?,?)",
    (payment_id,order_id,"LOLA-SQL-TEST-1","pix",20400,"pending")
)
users.execute(
    """INSERT INTO purchase_summaries(
       order_id,user_id,order_number,purchased_at,subtotal_cents,discount_cents,
       shipping_cents,total_cents,order_status,payment_status,revision)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
    (order_id,user_id,"LOLA-SQL-TEST-1","2026-11-13T12:00:00.000Z",19900,1000,1500,20400,
     "awaiting_payment","pending",1)
)
users.execute(
    "INSERT INTO purchase_lines(order_id,line_index,product_id,purchased_name,quantity,unit_price_cents,total_cents) VALUES (?,?,?,?,?,?,?)",
    (order_id,0,"p-01","Produto verificado",2,9950,19900)
)

def must_reject(db, query, params):
    try:
        db.execute(query, params)
    except sqlite3.IntegrityError:
        return
    raise AssertionError("O banco aceitou alteração inválida: " + query)

must_reject(
    commerce,
    "UPDATE commerce_orders SET total_cents=? WHERE id=?",
    (500,order_id),
)
must_reject(
    commerce,
    "UPDATE commerce_order_lines SET line_total_cents=? WHERE order_id=?",
    (1,order_id),
)
must_reject(
    commerce,
    "INSERT INTO commerce_payments(id,order_id,external_reference,method,amount_cents,status) VALUES(?,?,?,?,?,?)",
    ("p-"+"4"*32,order_id,"LOLA-SQL-TEST-1","pix",20400,"pending"),
)
must_reject(users, "DELETE FROM users WHERE id=?", (user_id,))

commerce.execute(
    """INSERT INTO commerce_temporary_artifacts(
       id,order_id,kind,created_at,expires_at,legal_hold)
       VALUES (?,?,?,?,?,?)""",
    ("a-"+"5"*32,order_id,"pix_qr_cache",
     "2026-10-01T00:00:00.000Z","2026-10-08T00:00:00.000Z",0)
)
commerce.execute(
    """INSERT INTO commerce_temporary_artifacts(
       id,order_id,kind,created_at,expires_at,legal_hold)
       VALUES (?,?,?,?,?,?)""",
    ("a-"+"6"*32,order_id,"temporary_receipt_copy",
     "2026-10-01T00:00:00.000Z","2026-10-08T00:00:00.000Z",1)
)
commerce.execute(
    """DELETE FROM commerce_temporary_artifacts
       WHERE id IN (
         SELECT id FROM commerce_temporary_artifacts
         WHERE expires_at <= ? AND legal_hold=0 ORDER BY expires_at LIMIT 200
       )""",
    ("2026-11-13T12:00:00.000Z",)
)
assert commerce.execute("SELECT count(*) FROM commerce_temporary_artifacts").fetchone()[0] == 1
assert commerce.execute("SELECT count(*) FROM commerce_orders").fetchone()[0] == 1
assert commerce.execute("SELECT count(*) FROM commerce_payments").fetchone()[0] == 1
assert commerce.execute("SELECT count(*) FROM commerce_financial_audit").fetchone()[0] == 0
assert users.execute("SELECT count(*) FROM purchase_summaries").fetchone()[0] == 1
assert users.execute("SELECT count(*) FROM purchase_lines").fetchone()[0] == 1
print("LOLA D1: 2 bancos, migrations idempotentes, retenção e histórico preservados: OK")
