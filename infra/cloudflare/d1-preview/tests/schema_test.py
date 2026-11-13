#!/usr/bin/env python3
"""Executes the exact D1 SQLite migration in a real SQLite engine, with no cloud access."""
import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "0001_catalog.sql"
connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys = ON")
connection.executescript(MIGRATION.read_text(encoding="utf-8"))

# Reapplying DDL must not cause an error.
connection.executescript(MIGRATION.read_text(encoding="utf-8"))
connection.execute(
    "INSERT INTO products (id, name, category, price_cents, published) VALUES (?,?,?,?,?)",
    ("item-verified", "Peça verificada", "Acessórios", 14900, 1),
)
connection.execute(
    "INSERT INTO inventory (product_id, quantity_on_hand, quantity_reserved) VALUES (?,?,?)",
    ("item-verified", 2, 1),
)

row = connection.execute(
    """SELECT p.price_cents, (i.quantity_on_hand - i.quantity_reserved)
       FROM products p JOIN inventory i ON p.id = i.product_id
       WHERE p.published = 1 AND p.archived_at IS NULL""",
).fetchone()
assert row == (14900, 1), row

def expect_constraint(statement: str, params: tuple) -> None:
    try:
        connection.execute(statement, params)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Expected integrity constraint to reject: " + statement)

expect_constraint("UPDATE inventory SET quantity_reserved = ? WHERE product_id = ?", (3, "item-verified"))
expect_constraint("UPDATE products SET price_cents = ? WHERE id = ?", (-1, "item-verified"))
connection.execute(
    "INSERT INTO products (id, name, category, price_cents, published) VALUES (?,?,?,?,?)",
    ("unpublished", "Não publicado", "Acessórios", 100, 0),
)
published_count = connection.execute(
    "SELECT count(*) FROM products WHERE published = 1 AND archived_at IS NULL"
).fetchone()[0]
assert published_count == 1, published_count

print("D1 migration syntax, repeatability, public filter and stock invariants: OK")
