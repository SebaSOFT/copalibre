import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import {
  createProbeClient,
  probeAuthentication,
  probeDatabasePrivileges,
  probeExposedFiles,
  probeHttpsEdge,
  probeProductionDebug,
  probeSecurityHeaders,
} from './runtime-probes.mjs';

/**
 * Two stand-in installations on loopback: one that behaves, one that makes
 * every mistake the probes look for. Each probe must pass the first and fail
 * the second, so a probe that cannot fail is caught here.
 */

const HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'strict-transport-security': 'max-age=31536000',
};

function good(req, res) {
  const path = req.url ?? '/';
  if (
    path.startsWith('/api/auth/session') ||
    path.startsWith('/api/admin') ||
    path === '/api/auth/login'
  ) {
    res.writeHead(401, { ...HEADERS, 'content-type': 'application/json' });
    return res.end('{"statusCode":401,"errorCode":"auth-unauthorized"}');
  }
  if (['/', '/control/', '/help/'].includes(path)) {
    res.writeHead(200, {
      ...HEADERS,
      'content-type': 'text/html',
      'content-security-policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'self'",
    });
    return res.end(
      `<html><head><meta http-equiv="content-security-policy" content="script-src 'self' 'sha256-AAAA'"></head>ok</html>`,
    );
  }
  if (path === '/api/health') {
    res.writeHead(200, { ...HEADERS, 'content-type': 'application/json' });
    return res.end('{"status":"ok"}');
  }
  res.writeHead(404, { ...HEADERS, 'content-type': 'application/json' });
  return res.end('{"statusCode":404}');
}

function bad(req, res) {
  const path = req.url ?? '/';
  if (path.startsWith('/api/auth/session') || path.startsWith('/api/admin')) {
    res.writeHead(200, { 'content-type': 'application/json', 'x-powered-by': 'Express' });
    return res.end('[]');
  }
  if (path === '/api/auth/login') {
    res.writeHead(200, { 'set-cookie': 'copalibre_session=x' });
    return res.end('{}');
  }
  if (path === '/.env' || path.includes('%2e%2e')) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('POSTGRES_PASSWORD=leaked\n');
  }
  if (path === '/debug') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"heap":1}');
  }
  if (path === '/api/no-such-route') {
    res.writeHead(500, { 'content-type': 'application/json' });
    return res.end('{"stack":"Error\\n    at handler (/app/src/x.ts:10:3)"}');
  }
  res.writeHead(200, { 'content-type': 'text/html', 'x-powered-by': 'Express' });
  return res.end('<html>no headers</html>');
}

const servers = {};
before(async () => {
  for (const [name, handler] of Object.entries({ good, bad })) {
    const server = createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers[name] = { server, url: `http://127.0.0.1:${server.address().port}` };
  }
});
after(() => {
  for (const { server } of Object.values(servers)) server.close();
});

const client = createProbeClient();

for (const [name, probe, extra] of [
  ['security headers', probeSecurityHeaders, {}],
  ['exposed files', probeExposedFiles, {}],
  ['production debug', probeProductionDebug, {}],
  ['authentication', probeAuthentication, { secure: false }],
]) {
  test(`${name}: passes a sound installation and fails a careless one`, async () => {
    const sound = await probe(client, { appUrl: servers.good.url, ...extra });
    assert.equal(sound.outcome, 'pass', sound.outcome);
    const careless = await probe(client, { appUrl: servers.bad.url, ...extra });
    assert.match(careless.outcome, /^fail: /);
  });
}

test('the HTTPS edge probe needs HSTS and a redirect from plain HTTP', async () => {
  const noRedirect = await probeHttpsEdge(client, {
    appUrl: servers.good.url,
    httpUrl: servers.good.url,
  });
  assert.match(noRedirect.outcome, /without a redirect to HTTPS/);
  const noHsts = await probeHttpsEdge(client, { appUrl: servers.bad.url });
  assert.match(noHsts.outcome, /HSTS max-age absent/);
  assert.match(noHsts.outcome, /not checked/);
});

test('traversal probes reach the server unnormalized', async () => {
  const careless = await probeExposedFiles(client, { appUrl: servers.bad.url });
  assert.match(careless.outcome, /%2e%2e/);
});

test('inline script in the header policy needs a hashing meta policy on the page', async () => {
  const { effectiveScriptPolicyProblems } = await import('./runtime-probes.mjs');
  const header = "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'";
  const hashed = `<meta http-equiv="content-security-policy" content="script-src 'self' 'sha256-abc'">`;
  assert.deepEqual(effectiveScriptPolicyProblems(header, hashed), []);
  assert.equal(effectiveScriptPolicyProblems(header, '<html></html>').length, 1);
  assert.equal(
    effectiveScriptPolicyProblems(
      header,
      `<meta http-equiv="content-security-policy" content="script-src 'unsafe-inline' 'sha256-abc'">`,
    ).length,
    1,
  );
  assert.deepEqual(effectiveScriptPolicyProblems("script-src 'self' 'unsafe-eval'", hashed), [
    "the header allows 'unsafe-eval'",
  ]);
});

test('database privileges: passes only on a passing runtime-privileges line from doctor', async () => {
  const doctorPrinting = (output) => () => output;
  const sound = await probeDatabasePrivileges(client, {
    doctorCommand: 'doctor',
    runCommand: doctorPrinting(
      'FAIL jwks-content: unreachable\nPASS database:runtime-privileges: DATABASE_URL connects with row access only\n',
    ),
  });
  assert.equal(sound.outcome, 'pass', sound.outcome);

  const superuser = await probeDatabasePrivileges(client, {
    doctorCommand: 'doctor',
    runCommand: doctorPrinting(
      'FAIL database:runtime-privileges: DATABASE_URL has more privileges than the runtime needs: role "copalibre" is a superuser\n',
    ),
  });
  assert.match(superuser.outcome, /^fail: FAIL database:runtime-privileges: .*superuser/);

  const skipped = await probeDatabasePrivileges(client, {
    doctorCommand: 'doctor',
    runCommand: doctorPrinting(
      'SKIP database:runtime-privileges: DATABASE_URL is not configured\n',
    ),
  });
  assert.match(skipped.outcome, /^fail: /);

  const silent = await probeDatabasePrivileges(client, {
    doctorCommand: 'doctor',
    runCommand: doctorPrinting('PASS postgresql: PostgreSQL accepts a query\n'),
  });
  assert.match(silent.outcome, /^fail: doctor printed no database:runtime-privileges line/);

  const unconfigured = await probeDatabasePrivileges(client, {});
  assert.match(unconfigured.outcome, /^fail: no --doctor-command/);
});
