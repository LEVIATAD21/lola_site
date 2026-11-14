# Public catalog connection

When DB is absent, publicCatalogBridge calls fixed backend read-only /api/public routes for catalog, stock and published photos. Incoming cookies, authorization headers and query strings are never forwarded. No Set-Cookie is relayed. Responses use no-store. Public pages need no direct access to the main database containing administrative sessions and financial records.

Workers fetch options omit the browser-only credentials field, which is unsupported by the deployed runtime. Only explicitly constructed Accept headers are sent.

Validation: npx vitest run tests/publicCatalogBridge.test.mjs; backend node --test tests/publicCatalogReadOnly.test.mjs. Tests cover published filters, explicit fields, private photo exclusion and credential isolation.
