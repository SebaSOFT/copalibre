import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * Black-box probes against a running installation, for the security gate's
 * runtime controls. Never point these at a production installation: they
 * send forged tokens and path-traversal requests.
 *
 *   node scripts/security/runtime-probes.mjs --app-url https://app.test:8443 \
 *     [--http-url http://app.test:8080] [--insecure] [--inspector-host 127.0.0.1] --out <dir>
 *
 * Writes or updates <dir>/runtime-evidence.json with one record per probe and
 * exits 1 if any probe failed. `--insecure` accepts a test certificate
 * authority's certificate; use it only for a disposable deployment.
 */

const ONE_YEAR = 31_536_000;

export function forgedTokens() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = encode({
    sub: '00000000-0000-7000-8000-000000000001',
    scp: 'copalibre.control copalibre.super-admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return {
    'alg none': `${encode({ alg: 'none', typ: 'JWT' })}.${claims}.`,
    'HS256 with a guessed secret': `${encode({ alg: 'HS256', typ: 'JWT' })}.${claims}.${Buffer.from('forged').toString('base64url')}`,
    'RS256 with a made-up signature': `${encode({ alg: 'RS256', typ: 'JWT', kid: 'unknown' })}.${claims}.${'A'.repeat(342)}`,
    'not a JWT': 'clearly-not-a-token',
  };
}

export const EXPOSED_FILE_PATHS = [
  '/.env',
  '/.env.production',
  '/.git/config',
  '/.git/HEAD',
  '/docker-compose.yml',
  '/package.json',
  '/jwt-private.pem',
  '/backup.sql',
  '/dump.sql',
  '/.DS_Store',
  '/server/entry.mjs',
  '/_astro/../../.env',
  '/%2e%2e/%2e%2e/etc/passwd',
  '/..%2f..%2f..%2fetc%2fpasswd',
  '/%252e%252e/%252e%252e/etc/passwd',
  '/api/..%2f.env',
  '/events/..%2f..%2f.env',
];

const PRIVATE_MARKERS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bPOSTGRES_PASSWORD\s*=/,
  /\bCOPALIBRE_BOOTSTRAP_TOKEN\s*=/,
  /^\[core\]/m,
  /^ref: refs\//m,
  /^root:x:0:0:/m,
  /"workspaces"\s*:/,
  /^services:\s*$/m,
];

export const DEBUG_PATHS = [
  '/debug',
  '/__debug',
  '/api/debug',
  '/api/__debug',
  '/graphql',
  '/_inspect',
  '/api/swagger',
  '/api/docs',
];

const HTML_PATHS = ['/', '/control/', '/help/'];
const OTHER_PATHS = ['/api/health', '/api/no-such-route', '/no-such-page'];

function result(id, failures, checked) {
  return failures.length === 0
    ? { id, outcome: 'pass', checked }
    : { id, outcome: `fail: ${failures.join('; ')}`, checked };
}

/**
 * A minimal HTTP client: never follows redirects, can accept a test CA's
 * certificate, and answers with the parts the probes read.
 */
export function createProbeClient({ insecure = false } = {}) {
  return (input, init = {}) =>
    new Promise((resolve, reject) => {
      const url = new URL(String(input));
      const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const req = send(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          // rawPath is sent as written: URL parsing would resolve ../ and %2e%2e.
          path: init.rawPath ?? `${url.pathname}${url.search}`,
          method: init.method ?? 'GET',
          headers: init.headers ?? {},
          ...(url.protocol === 'https:' ? { rejectUnauthorized: !insecure } : {}),
          timeout: 15_000,
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            resolve({
              status: res.statusCode ?? 0,
              headers: {
                get: (name) => {
                  const value = res.headers[name.toLowerCase()];
                  return Array.isArray(value) ? value.join(', ') : (value ?? null);
                },
              },
              text: async () => body,
              arrayBuffer: async () => Buffer.from(body),
            });
          });
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error(`timed out: ${url.pathname}`)));
      req.on('error', reject);
      if (init.body) req.write(init.body);
      req.end();
    });
}

export async function probeHttpsEdge(client, { appUrl, httpUrl }) {
  const failures = [];
  const secure = await client(new URL('/', appUrl));
  const hsts = secure.headers.get('strict-transport-security') ?? '';
  const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
  if (maxAge < ONE_YEAR) failures.push(`HSTS max-age ${maxAge || 'absent'} on ${appUrl}`);
  if (httpUrl) {
    const plain = await client(new URL('/control/', httpUrl));
    const location = plain.headers.get('location') ?? '';
    if (![301, 302, 307, 308].includes(plain.status) || !location.startsWith('https://')) {
      failures.push(`plain HTTP answered ${plain.status} without a redirect to HTTPS`);
    }
  } else {
    failures.push('no --http-url, so the HTTP to HTTPS redirect was not checked');
  }
  return result('https-edge-runtime', failures, { appUrl, httpUrl: httpUrl ?? null });
}

/**
 * A browser enforces every policy a page carries: the header and a `<meta>`
 * policy together. The header may allow inline script only when the page's
 * own meta policy then limits it to hashed scripts.
 */
export function effectiveScriptPolicyProblems(headerPolicy, html) {
  const problems = [];
  const scriptSrc = (policy) => /(?:^|;)\s*script-src ([^;]*)/.exec(policy)?.[1] ?? '';
  const header = scriptSrc(headerPolicy);
  if (/'unsafe-eval'/.test(header)) problems.push("the header allows 'unsafe-eval'");
  if (/'unsafe-inline'/.test(header)) {
    const metas = [
      ...html.matchAll(
        /<meta[^>]+http-equiv=["']content-security-policy["'][^>]*content=(?:"([^"]*)"|'([^']*)')/gi,
      ),
    ].map((match) => match[1] ?? match[2] ?? '');
    const limiting = metas.some((policy) => {
      const meta = scriptSrc(policy);
      return /'sha(256|384|512)-/.test(meta) && !/'unsafe-inline'/.test(meta);
    });
    if (!limiting) problems.push('inline script is allowed and no meta policy limits it to hashes');
  }
  return problems;
}

export async function probeSecurityHeaders(client, { appUrl }) {
  const failures = [];
  for (const path of [...HTML_PATHS, ...OTHER_PATHS]) {
    const response = await client(new URL(path, appUrl));
    const headers = response.headers;
    const type = headers.get('content-type') ?? '';
    if ((headers.get('x-content-type-options') ?? '').toLowerCase() !== 'nosniff') {
      failures.push(`${path}: no X-Content-Type-Options: nosniff`);
    }
    if (!headers.get('referrer-policy')) failures.push(`${path}: no Referrer-Policy`);
    const csp = headers.get('content-security-policy') ?? '';
    const framing = headers.get('x-frame-options') || /frame-ancestors/.test(csp);
    if (!framing) failures.push(`${path}: no framing policy`);
    if (type.includes('text/html') && !csp)
      failures.push(`${path}: HTML without Content-Security-Policy`);
    if (HTML_PATHS.includes(path)) {
      const body = await response.text();
      for (const problem of effectiveScriptPolicyProblems(csp, body))
        failures.push(`${path}: ${problem}`);
      continue;
    }
    await response.arrayBuffer();
  }
  return result('security-headers-runtime', failures, { paths: [...HTML_PATHS, ...OTHER_PATHS] });
}

export async function probeExposedFiles(client, { appUrl }) {
  const failures = [];
  for (const path of EXPOSED_FILE_PATHS) {
    const response = await client(appUrl, { rawPath: path });
    const body = await response.text();
    if (response.status === 200 && PRIVATE_MARKERS.some((marker) => marker.test(body))) {
      failures.push(`${path} returned private content`);
    }
  }
  for (const path of ['/_astro/', '/client/']) {
    const response = await client(new URL(path, appUrl));
    const body = await response.text();
    if (response.status === 200 && /Index of|<title>Directory/i.test(body)) {
      failures.push(`${path} lists a directory`);
    }
  }
  return result('exposed-files-runtime', failures, { paths: EXPOSED_FILE_PATHS });
}

function inspectorReachable(host, port = 9229, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (reachable) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

export async function probeProductionDebug(client, { appUrl, inspectorHost }) {
  const failures = [];
  for (const path of DEBUG_PATHS) {
    const response = await client(new URL(path, appUrl));
    const body = await response.text();
    if (response.status === 200 && !/<html/i.test(body)) failures.push(`${path} answered 200`);
  }
  const missing = await client(new URL('/api/no-such-route', appUrl));
  const body = await missing.text();
  if (/\bat [\w$.<>]+ \(|node_modules|\.ts:\d+|"stack"/.test(body)) {
    failures.push('an error response carries a stack trace');
  }
  for (const path of ['/', '/api/health']) {
    const response = await client(new URL(path, appUrl));
    if (response.headers.get('x-powered-by')) failures.push(`${path} sends X-Powered-By`);
    await response.arrayBuffer();
  }
  if (inspectorHost && (await inspectorReachable(inspectorHost))) {
    failures.push(`the Node inspector port answers on ${inspectorHost}:9229`);
  }
  return result('production-debug-runtime', failures, {
    paths: DEBUG_PATHS,
    inspectorHost: inspectorHost ?? null,
  });
}

export async function probeAuthentication(client, { appUrl, secure = true }) {
  const failures = [];
  const targets = ['/api/auth/session', '/api/admin/modules'].map((path) => new URL(path, appUrl));
  const cookieName = secure ? '__Host-copalibre_session' : 'copalibre_session';
  for (const target of targets) {
    for (const [name, token] of Object.entries(forgedTokens())) {
      const bearer = await client(target, { headers: { authorization: `Bearer ${token}` } });
      if (bearer.status !== 401)
        failures.push(`${target.pathname} Bearer ${name} answered ${bearer.status}`);
      await bearer.arrayBuffer();
      const cookie = await client(target, { headers: { cookie: `${cookieName}=${token}` } });
      if (cookie.status !== 401) {
        failures.push(`${target.pathname} session cookie ${name} answered ${cookie.status}`);
      }
      await cookie.arrayBuffer();
    }
  }
  const queryToken = await client(
    new URL(`/api/auth/session?access_token=${forgedTokens()['alg none']}`, appUrl),
  );
  if (queryToken.status !== 401)
    failures.push(`a token in the query string answered ${queryToken.status}`);
  await queryToken.arrayBuffer();
  const login = await client(new URL('/api/auth/login', appUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@example.invalid', password: 'wrong-password' }),
  });
  if (login.status !== 401 && login.status !== 429)
    failures.push(`a wrong sign-in answered ${login.status}`);
  if (login.headers.get('set-cookie')) failures.push('a wrong sign-in set a cookie');
  await login.arrayBuffer();
  return result('authentication-runtime', failures, {
    targets: targets.map((target) => target.pathname),
    forgedTokens: Object.keys(forgedTokens()),
  });
}

function parseArgs(argv) {
  const args = { insecure: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--insecure') {
      args.insecure = true;
      continue;
    }
    const value = argv[index + 1];
    index += 1;
    if (flag === '--app-url') args.appUrl = value;
    else if (flag === '--http-url') args.httpUrl = value;
    else if (flag === '--inspector-host') args.inspectorHost = value;
    else if (flag === '--out') args.out = value;
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!args.appUrl || !args.out) throw new Error('--app-url and --out are required');
  return args;
}

export async function runProbes(options) {
  const client = createProbeClient({ insecure: options.insecure });
  const secure = new URL(options.appUrl).protocol === 'https:';
  const records = [];
  for (const probe of [
    probeHttpsEdge,
    probeSecurityHeaders,
    probeExposedFiles,
    probeProductionDebug,
    probeAuthentication,
  ]) {
    try {
      records.push(await probe(client, { ...options, secure }));
    } catch (error) {
      records.push({
        id: probe.name,
        outcome: `fail: could not run (${error instanceof Error ? error.message : String(error)})`,
      });
    }
  }
  return records;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const records = await runProbes(args);
  mkdirSync(args.out, { recursive: true });
  const file = join(args.out, 'runtime-evidence.json');
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const ids = new Set(records.map((record) => record.id));
  writeFileSync(
    file,
    `${JSON.stringify([...existing.filter((record) => !ids.has(record.id)), ...records], null, 2)}\n`,
  );
  for (const record of records)
    process.stdout.write(
      `${record.outcome === 'pass' ? 'pass' : 'FAIL'} ${record.id}${record.outcome === 'pass' ? '' : `: ${record.outcome}`}\n`,
    );
  process.exit(records.every((record) => record.outcome === 'pass') ? 0 : 1);
}
