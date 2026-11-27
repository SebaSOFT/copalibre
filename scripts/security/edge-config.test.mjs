import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('every site of the edge Caddyfile sends HSTS', () => {
  const caddyfile = read('deploy/proxy/Caddyfile');
  assert.match(caddyfile, /\(hsts\)\s*\{\s*header Strict-Transport-Security "max-age=\d{8,}"/);
  const sites = [...caddyfile.matchAll(/^\{\$COPALIBRE_[A-Z_]+_HOST\} \{\n([\s\S]*?)^\}/gm)];
  assert.equal(sites.length, 3);
  for (const [, body] of sites) assert.match(body, /^\s*import hsts$/m);
});

test('every nginx edge server shows where HSTS goes once TLS is on', () => {
  for (const path of ['deploy/proxy/nginx.conf', 'deploy/templates/nginx/copalibre.conf']) {
    const config = read(path);
    const servers = config.match(/^\s*server_name /gm) ?? [];
    const hsts =
      config.match(/add_header Strict-Transport-Security "max-age=\d{8,}" always;/g) ?? [];
    assert.ok(servers.length > 0, path);
    assert.equal(hsts.length, servers.length, path);
  }
});
