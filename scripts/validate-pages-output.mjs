#!/usr/bin/env node
// Verify that the output uploaded to Cloudflare Pages contains only public assets.
// This is a release gate, not a replacement for inspecting the final deployed URL.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
if (existsSync(path.join(root, 'images'))) {
  throw new Error('[public-build] legacy mock images must never be uploaded');
}

function fail(message) { throw new Error('[public-build] ' + message); }
for (const file of ['index.html', '_headers', 'robots.txt', 'privacidade/index.html', 'cookies/index.html']) {
  if (!existsSync(path.join(root, file))) fail('missing ' + file);
}
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const headers = readFileSync(path.join(root, '_headers'), 'utf8');
assert.match(html, /id=["']root["']/);
assert.match(html, /<script[^>]+src=["']\/assets\//);
assert.match(headers, /Content-Security-Policy: default-src 'self';/);
assert.match(headers, /script-src 'self';/);
assert.match(headers, /frame-ancestors 'none';/);
assert.doesNotMatch(headers, /Access-Control-Allow-Origin:\s*\*/);

const forbiddenPaths = [
  /(^|\/)(?:\.env(?:\..*)?|\.git|\.github|docs|deploy|src|tests|node_modules)(?:\/|$)/i,
  /(^|\/)(?:server|data-server|Dockerfile|docker-compose|package(?:-lock)?\.json|\.npmrc|README\.md)(?:$|\.)/i,
  /\.(?:map|pem|key|p12|pfx|crt|sqlite|db|ts|tsx)$/i,
];
const secretMarkers = /LOLA_ADMIN_API_KEY|LOLA_ADMIN_SESSION_SECRET|LOLA_INTERNAL_SECRET|LOLA_ORDERS_KEY|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i;
const demoMarkers = /Brinco Argola Lisa|Brinco Coração Pequeno|EARRINGS_CATALOG|FEATURED_PRODUCTS/i;

let files = 0;
let js = 0;
function inspect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).split(path.sep).join('/');
    if (forbiddenPaths.some((rule) => rule.test(relative))) fail('private path in dist: ' + relative);
    if (entry.isDirectory()) { inspect(full); continue; }
    if (!entry.isFile()) fail('unexpected entry: ' + relative);
    files++;
    if (relative.endsWith('.js')) js++;
    if (/\.(?:js|css|html|json|txt)$/.test(relative) || relative === '_headers') {
      const value = readFileSync(full, 'utf8');
      if (secretMarkers.test(value)) fail('private marker in output: ' + relative);
      if (demoMarkers.test(value)) fail('demonstration products or profiles in output: ' + relative);
    }
  }
}
inspect(root);
assert.ok(js >= 1, 'bundled JavaScript missing');
console.log('[public-build] verified ' + files + ' public files; JS assets=' + js);
