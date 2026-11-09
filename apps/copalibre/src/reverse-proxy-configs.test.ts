import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PROXY_DIR = join(ROOT, '../../../deploy/proxy');

/**
 * `copalibre doctor --check-proxy` verifies live SSE-conformance behavior
 * against a running proxy; it cannot verify a config file an operator hasn't
 * deployed yet. These read the example configs directly so a trusted-proxy
 * allowlist directive regressing out of them — silently trusting every
 * upstream by default — fails here instead of only in production.
 */
describe('reverse-proxy example configs', () => {
  it('Caddyfile documents a trusted-proxy allowlist directive, not a default that trusts every upstream', () => {
    const caddyfile = readFileSync(join(PROXY_DIR, 'Caddyfile'), 'utf8');
    expect(caddyfile).toMatch(/trusted_proxies\s+static/);
  });

  it('nginx.conf documents real-IP directives scoped to a trusted-proxy range', () => {
    const nginxConf = readFileSync(join(PROXY_DIR, 'nginx.conf'), 'utf8');
    expect(nginxConf).toMatch(/set_real_ip_from\s+\S+;/);
    expect(nginxConf).toContain('real_ip_header X-Forwarded-For;');
  });

  it('deploy/templates/nginx/copalibre.conf specifies unbuffered SSE, 86400s timeouts, and WebSocket upgrades', () => {
    const templateDir = join(ROOT, '../../../deploy/templates/nginx');
    const templateConf = readFileSync(join(templateDir, 'copalibre.conf'), 'utf8');

    expect(templateConf).toContain('location /events/ {');
    expect(templateConf).toContain('proxy_buffering off;');
    expect(templateConf).toContain('proxy_cache off;');
    expect(templateConf).toMatch(/add_header\s+X-Accel-Buffering\s+"?no"?\s+always;/);
    expect(templateConf).toContain("proxy_set_header Connection '';");
    expect(templateConf).toContain('proxy_read_timeout 86400s;');
    expect(templateConf).toContain('proxy_send_timeout 86400s;');
    expect(templateConf).toContain('client_max_body_size 100M;');
    expect(templateConf).toContain('proxy_request_buffering off;');
    expect(templateConf).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(templateConf).toMatch(/proxy_set_header\s+Connection\s+\$connection_upgrade;/);
  });

  it('every nginx example keeps font files proxied with the Content-Type the app sends', () => {
    const configs = [
      join(PROXY_DIR, 'nginx.conf'),
      join(ROOT, '../../../deploy/templates/nginx/copalibre.conf'),
    ].map((file) => readFileSync(file, 'utf8'));
    const initSource = readFileSync(join(ROOT, 'init.ts'), 'utf8');

    for (const config of [...configs, initSource]) {
      expect(config).toContain('font/woff2');
      expect(config).not.toMatch(/^\s*location\s+~\*?\s+[^{]*woff/m);
      expect(config).not.toMatch(/^\s*(default_type|types\s*\{|proxy_hide_header\s+Content-Type)/m);
    }
  });

  it('the web role declares font types itself instead of relying on the base image', () => {
    const webCaddyfile = readFileSync(join(ROOT, '../../../deploy/web/Caddyfile'), 'utf8');

    expect(webCaddyfile).toMatch(/@woff2\s*\{\s*path \*\.woff2\s+file\s*\}/);
    expect(webCaddyfile).toContain('header @woff2 Content-Type font/woff2');
    expect(webCaddyfile).toMatch(/@woff\s*\{\s*path \*\.woff\s+file\s*\}/);
    expect(webCaddyfile).toContain('header @woff Content-Type font/woff');
  });
});
