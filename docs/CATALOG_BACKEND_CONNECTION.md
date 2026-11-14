# Public catalog connection

The storefront uses the server-side publicCatalogBridge when no DB binding is configured. It calls only the fixed Cloudflare backend /api/public/catalog, /api/public/estoque/:id and /api/public/imagens/:id routes. These routes expose published, non-archived product display fields and verify publication before reading photo bytes.

Incoming cookies, authorization headers and query strings are not forwarded. Responses use no-store and never relay Set-Cookie. The storefront does not need direct access to the main D1 database containing administrative sessions and financial records. Existing deployments with DB configured retain their original read-only handlers.

Validation: node --test tests/publicCatalogBridge.test.mjs; backend tests/publicCatalogReadOnly.test.mjs checks publication filtering, explicit response fields and private photo exclusion.
