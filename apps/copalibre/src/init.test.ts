import { jest } from '@jest/globals';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverJwksUri,
  externalOidcEnvironment,
  formatRequiredSecrets,
  resolveOidcOptions,
  generateRsaKeypair,
  httpsAnswer,
  httpsQuestion,
  readAsset,
  sessionCookieSecureSetting,
  repairInstallationAssets,
  writeInstallationAssets,
  writeLocalDefaults,
} from './init.js';

describe('copalibre init', () => {
  it('writes complete defaults into a new local file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-init-'));
    const file = join(directory, '.env');

    await writeLocalDefaults(file);

    const content = await readFile(file, 'utf8');
    expect(content).toContain('COPALIBRE_PORT=8080');
    expect(content).toContain('COPALIBRE_APP_URL=http://localhost:8080');
    expect(content).toContain('COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.6');
    expect(content).toContain('COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.6');
    expect(content).toContain('COPALIBRE_BOOTSTRAP_TOKEN=');
  });

  it('lists required secret inputs without assigning values', () => {
    expect(formatRequiredSecrets()).toContain('COPALIBRE_BOOTSTRAP_TOKEN');
    expect(formatRequiredSecrets()).not.toContain('=');
  });

  it('generates a 2048-bit RSA keypair and valid JWKS', () => {
    const { privateKeyPem, jwksJson } = generateRsaKeypair();
    expect(privateKeyPem).toContain('BEGIN PRIVATE KEY');
    const jwks = JSON.parse(jwksJson);
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].kty).toBe('RSA');
    expect(jwks.keys[0].alg).toBe('RS256');
    expect(jwks.keys[0].kid).toBe('copalibre-local-key-1');
  });
});

/** A minimal stand-in for `dist/assets/` — real content doesn't matter, only that a copy happens. */
async function stubAssetsDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-assets-'));
  await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
  await writeFile(join(directory, 'docker-compose.module-dev.yml'), 'services: {}\n');
  await writeFile(join(directory, 'Caddyfile'), ':80 {}\n');
  return directory;
}

describe('writeInstallationAssets', () => {
  it('writes the compose file, .env, RSA keypair, gateway Caddyfile, and the marker into an empty directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    const result = await writeInstallationAssets(cwd, { assetsDir });

    expect(await readFile(result.composeFile, 'utf8')).toBe('services: {}\n');
    expect(await readFile(result.privateKeyFile, 'utf8')).toContain('BEGIN PRIVATE KEY');
    expect(await readFile(result.jwksFile, 'utf8')).toContain('copalibre-local-key-1');
    expect(await readFile(join(cwd, 'deploy', 'gateway', 'Caddyfile'), 'utf8')).toBe(':80 {}\n');

    const env = await readFile(result.envFile, 'utf8');
    expect(env).not.toContain('COMPOSE_FILE=');
    expect(env).not.toContain('module-dev.yml');
    expect(result.moduleDevFile).toBeUndefined();
    expect(result.marker.mode).toBe('compose');
  });

  it('--module-dev also writes the override file, sets COMPOSE_FILE to both, and creates modules-dev/', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    const result = await writeInstallationAssets(cwd, { assetsDir, moduleDev: true });

    expect(result.moduleDevFile).toBeDefined();
    const env = await readFile(result.envFile, 'utf8');
    expect(env).toContain('COMPOSE_FILE=docker-compose.yml:docker-compose.module-dev.yml\n');
    await expect(readFile(join(cwd, 'modules-dev'), 'utf8')).rejects.toThrow();
  });

  it('refuses when a target already exists, naming exactly which one, and writes nothing else', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();
    await writeFile(join(cwd, '.env'), 'PRE_EXISTING=true\n');

    await expect(writeInstallationAssets(cwd, { assetsDir })).rejects.toThrow(/\.env/);

    // Nothing else was written — the pre-existence check ran before any write.
    await expect(readFile(join(cwd, 'docker-compose.yml'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(cwd, 'jwt-private.pem'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(cwd, 'jwks.json'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(cwd, '.copalibre', 'installation.json'), 'utf8')).rejects.toThrow();
    expect(await readFile(join(cwd, '.env'), 'utf8')).toBe('PRE_EXISTING=true\n');
  });

  it('refuses a second call against the same directory (re-run refusal)', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();
    await writeInstallationAssets(cwd, { assetsDir });

    await expect(writeInstallationAssets(cwd, { assetsDir })).rejects.toThrow();
  });

  it('generates a 32-byte hex GARAGE_RPC_SECRET and interpolates custom domains', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    const result = await writeInstallationAssets(cwd, {
      assetsDir,
      appUrl: 'https://tournaments.example.com',
    });

    const env = await readFile(result.envFile, 'utf8');
    expect(env).toMatch(/GARAGE_RPC_SECRET=[0-9a-f]{64}/);
    expect(env).toContain('COPALIBRE_APP_URL=https://tournaments.example.com');
    expect(env).toContain('COPALIBRE_API_URL=https://tournaments.example.com');
    expect(env).toContain('COPALIBRE_JWT_ISSUER=https://tournaments.example.com');
    expect(env).toContain('COPALIBRE_NATIVE_JWT_ISSUER=https://tournaments.example.com');
    expect(env).toContain('COPALIBRE_MODULE_SOURCE_ALLOWLIST=file:///var/lib/copalibre/modules');
  });

  it('scaffolds local ./modules directory hierarchy and starter disciplines', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    await writeInstallationAssets(cwd, {
      assetsDir,
      starterDisciplines: ['football', 'tennis'],
    });

    const readme = await readFile(join(cwd, 'modules', 'README.md'), 'utf8');
    expect(readme).toContain('/var/lib/copalibre/modules');
    expect(readme).toContain('- football');
    expect(readme).toContain('- tennis');

    const footballManifest = await readFile(
      join(cwd, 'modules', 'disciplines', 'football', 'manifest.json'),
      'utf8',
    );
    expect(JSON.parse(footballManifest).alias).toBe('football');

    const tennisManifest = await readFile(
      join(cwd, 'modules', 'disciplines', 'tennis', 'manifest.json'),
      'utf8',
    );
    expect(JSON.parse(tennisManifest).alias).toBe('tennis');
  });

  it('creates an empty well-known directory, since every file in it is public', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    await writeInstallationAssets(cwd, { assetsDir });

    expect((await stat(join(cwd, 'well-known'))).isDirectory()).toBe(true);
    expect(await readdir(join(cwd, 'well-known'))).toEqual([]);
  });

  it('exports copalibre-nginx.conf when proxy is set to nginx', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    const result = await writeInstallationAssets(cwd, {
      assetsDir,
      proxy: 'nginx',
    });

    expect(result.proxyConfigFile).toBe(join(cwd, 'copalibre-nginx.conf'));
    const nginxConf = await readFile(join(cwd, 'copalibre-nginx.conf'), 'utf8');
    expect(nginxConf).toContain('proxy_buffering off;');
    expect(nginxConf).toContain('proxy_read_timeout 86400s;');
    expect(nginxConf).toContain('proxy_set_header Upgrade $http_upgrade;');
  });

  it('interpolates public appUrl hostname into exported copalibre-nginx.conf', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    const result = await writeInstallationAssets(cwd, {
      assetsDir,
      proxy: 'nginx',
      appUrl: 'https://play.copalibre.app',
    });

    const nginxConf = await readFile(
      result.proxyConfigFile ?? join(cwd, 'copalibre-nginx.conf'),
      'utf8',
    );
    expect(nginxConf).toContain('server_name play.copalibre.app;');
    expect(nginxConf).toContain("proxy_set_header Connection '';");
    expect(nginxConf).toContain('client_max_body_size 100M;');
    expect(nginxConf).toContain('proxy_request_buffering off;');
  });

  it('supports apiUrl override without appUrl and falls back to default Caddyfile when not in assets', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    // Empty directory without Caddyfile
    const emptyAssetsDir = await mkdtemp(join(tmpdir(), 'copalibre-empty-assets-'));
    await writeFile(join(emptyAssetsDir, 'docker-compose.yml'), 'services: {}\n');

    await writeInstallationAssets(cwd, {
      assetsDir: emptyAssetsDir,
      apiUrl: 'https://api.copalibre.local',
    });

    const env = await readFile(join(cwd, '.env'), 'utf8');
    expect(env).toContain('COPALIBRE_API_URL=https://api.copalibre.local');
    const caddy = await readFile(join(cwd, 'deploy', 'gateway', 'Caddyfile'), 'utf8');
    expect(caddy).toContain('reverse_proxy events:3002');
  });

  it.each([
    ['smtp', 'smtp://mail.example.test:587', undefined, 'COPALIBRE_SMTP_URL'],
    ['resend', 're_test_key', undefined, 'COPALIBRE_RESEND_API_KEY'],
    ['brevo', 'brevo_test_key', undefined, 'COPALIBRE_BREVO_API_KEY'],
    ['mailgun', 'mailgun_test_key', 'mg.example.test', 'COPALIBRE_MAILGUN_API_KEY'],
  ] as const)(
    'writes runtime email settings for %s',
    async (provider, credential, domain, credentialKey) => {
      const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
      const assetsDir = await stubAssetsDir();
      const result = await writeInstallationAssets(cwd, {
        assetsDir,
        emailProvider: provider,
        emailFrom: 'tournaments@example.test',
        emailCredential: credential,
        ...(domain ? { emailDomain: domain } : {}),
      });

      const env = await readFile(result.envFile, 'utf8');
      expect(env).toContain(`COPALIBRE_EMAIL_PROVIDER=${provider}`);
      expect(env).toContain('COPALIBRE_EMAIL_FROM=tournaments@example.test');
      expect(env).toContain(`${credentialKey}=${credential}`);
      if (domain) expect(env).toContain(`COPALIBRE_MAILGUN_DOMAIN=${domain}`);
    },
  );
});

describe('repairInstallationAssets', () => {
  it('backs up .env and Compose, preserves custom values and Compose bytes, and reports missing service snippets', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-repair-'));
    const assetsDir = await stubAssetsDir();
    const originalCompose =
      '# operator-managed compose\nservices:\n  legacy:\n    image: example.test/legacy\n';
    const originalEnv =
      'POSTGRES_PASSWORD=custom-password\nCOPALIBRE_EMAIL_FROM=owner@example.test\n';
    await writeFile(join(cwd, 'docker-compose.yml'), originalCompose);
    await writeFile(join(cwd, '.env'), originalEnv);
    await writeFile(join(cwd, 'jwt-private.pem'), generateRsaKeypair().privateKeyPem);

    const result = await repairInstallationAssets(cwd, { assetsDir });

    expect(result.backups).toHaveLength(2);
    expect(result.backups.every((backup) => /\.backup\.\d{4}-/.test(backup))).toBe(true);
    const envBackup = result.backups.find((backup) => backup.includes('.env.backup.'));
    expect(envBackup).toBeDefined();
    if (!envBackup) throw new Error('Expected .env backup to be created');
    expect(await readFile(envBackup, 'utf8')).toContain('custom-password');
    expect(await readFile(join(cwd, '.env'), 'utf8')).toContain(originalEnv);
    expect(await readFile(join(cwd, '.env'), 'utf8')).toContain('COPALIBRE_API_PORT=3001');
    expect(await readFile(join(cwd, 'docker-compose.yml'), 'utf8')).toBe(originalCompose);
    expect(result.preservedCompose).toBe(true);
    expect(result.missingServices).toEqual([]);
    expect(await readFile(join(cwd, 'jwks.json'), 'utf8')).toContain('copalibre-local-key-1');
    await expect(readFile(join(cwd, 'modules', 'README.md'), 'utf8')).resolves.toContain(
      'Directory Layout',
    );
  });

  it('creates a missing well-known directory and keeps published files in an existing one', async () => {
    const assetsDir = await stubAssetsDir();
    const freshCwd = await mkdtemp(join(tmpdir(), 'copalibre-repair-'));
    await writeFile(join(freshCwd, 'jwt-private.pem'), generateRsaKeypair().privateKeyPem);

    const fresh = await repairInstallationAssets(freshCwd, { assetsDir });

    expect(fresh.createdAssets).toContain(join(freshCwd, 'well-known'));
    expect(await readdir(join(freshCwd, 'well-known'))).toEqual([]);

    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-repair-'));
    await writeFile(join(cwd, 'jwt-private.pem'), generateRsaKeypair().privateKeyPem);
    await mkdir(join(cwd, 'well-known'));
    const securityTxt =
      'Contact: mailto:security@example.test\nExpires: 2027-11-08T00:00:00.000Z\n';
    await writeFile(join(cwd, 'well-known', 'security.txt'), securityTxt);

    const repaired = await repairInstallationAssets(cwd, { assetsDir });

    expect(repaired.createdAssets).not.toContain(join(cwd, 'well-known'));
    expect(await readFile(join(cwd, 'well-known', 'security.txt'), 'utf8')).toBe(securityTxt);
  });

  it('returns paste-ready snippets for services missing from the existing Compose file', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-repair-'));
    const assetsDir = await mkdtemp(join(tmpdir(), 'copalibre-assets-'));
    await writeFile(
      join(assetsDir, 'docker-compose.yml'),
      'services:\n  api:\n    image: copalibre/api\n  worker:\n    image: copalibre/worker\n  optional-cache:\n    image: redis\n    profiles: [optional-adapters]\n',
    );
    await writeFile(join(assetsDir, 'Caddyfile'), ':80 {}\n');
    await writeFile(join(cwd, 'docker-compose.yml'), 'services:\n  api:\n    image: custom/api\n');

    const result = await repairInstallationAssets(cwd, { assetsDir });

    expect(result.missingServices).toEqual(['worker']);
    expect(result.serviceSnippets[0]).toContain(
      'services:\n  worker:\n    image: copalibre/worker',
    );
    expect(await readFile(join(cwd, 'docker-compose.yml'), 'utf8')).toBe(
      'services:\n  api:\n    image: custom/api\n',
    );
  });

  it('preserves a JWKS without its matching private key and stops before reconciling .env', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-repair-'));
    const assetsDir = await stubAssetsDir();
    const jwksJson = generateRsaKeypair().jwksJson;
    await writeFile(join(cwd, 'docker-compose.yml'), 'services: {}\n');
    await writeFile(join(cwd, '.env'), 'CUSTOM_VALUE=preserve\n');
    await writeFile(join(cwd, 'jwks.json'), jwksJson);

    await expect(repairInstallationAssets(cwd, { assetsDir })).rejects.toThrow(
      /incomplete signing keypair/,
    );

    expect(await readFile(join(cwd, 'jwks.json'), 'utf8')).toBe(jwksJson);
    expect(await readFile(join(cwd, '.env'), 'utf8')).toBe('CUSTOM_VALUE=preserve\n');
  });
});

describe('readAsset SEA-vs-relative-path resolution', () => {
  it('reads the SEA-embedded asset when isSea() is true, ignoring assetsDir entirely', async () => {
    const content = await readAsset('docker-compose.yml', '/does/not/exist', {
      isSea: () => true,
      getAsset: (key) => `fake content for ${key}`,
    });

    expect(content).toBe('fake content for docker-compose.yml');
  });

  it('reads the file off disk when isSea() is false', async () => {
    const assetsDir = await stubAssetsDir();

    const content = await readAsset('docker-compose.yml', assetsDir, { isSea: () => false });

    expect(content).toBe('services: {}\n');
  });
});

describe('external OIDC in copalibre init', () => {
  const oidc = {
    issuer: 'https://id.example/realms/copa',
    clientId: 'copalibre',
    jwksUri: 'https://id.example/realms/copa/protocol/openid-connect/certs',
  };

  it('writes the provider and its origin for the Content Security Policy', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    await writeInstallationAssets(cwd, { assetsDir, appUrl: 'https://play.example', oidc });

    const env = await readFile(join(cwd, '.env'), 'utf8');
    expect(env).toContain('COPALIBRE_JWT_ISSUER=https://id.example/realms/copa');
    expect(env).toContain(`COPALIBRE_JWKS_URI=${oidc.jwksUri}`);
    expect(env).toContain('COPALIBRE_OIDC_CLIENT_ID=copalibre');
    expect(env).toContain('COPALIBRE_CSP_IDENTITY_ORIGIN=https://id.example\n');
    expect(env).toContain('COPALIBRE_NATIVE_JWT_ISSUER=https://play.example');
  });

  it('leaves the policy origin empty for the built-in provider', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    await writeInstallationAssets(cwd, { assetsDir, appUrl: 'https://play.example' });

    expect(await readFile(join(cwd, '.env'), 'utf8')).toContain('COPALIBRE_CSP_IDENTITY_ORIGIN=\n');
  });

  it('adds no policy origin for an issuer on the application origin', () => {
    expect(
      externalOidcEnvironment(
        { ...oidc, issuer: 'https://play.example/oidc' },
        'https://play.example/',
      ).COPALIBRE_CSP_IDENTITY_ORIGIN,
    ).toBe('');
  });

  it('validates the flags', () => {
    expect(resolveOidcOptions(undefined, undefined, undefined)).toBeUndefined();
    expect(() => resolveOidcOptions(undefined, 'copalibre', undefined)).toThrow(
      'require --oidc-issuer',
    );
    expect(() => resolveOidcOptions('id.example', 'copalibre', oidc.jwksUri)).toThrow(
      '--oidc-issuer must be an http(s) URL',
    );
    expect(() => resolveOidcOptions(oidc.issuer, undefined, oidc.jwksUri)).toThrow(
      '--oidc-client-id is required',
    );
    expect(() => resolveOidcOptions(oidc.issuer, 'copalibre', undefined)).toThrow(
      '--oidc-jwks-uri is required',
    );
    expect(resolveOidcOptions(` ${oidc.issuer} `, 'copalibre', oidc.jwksUri)).toEqual(oidc);
  });

  it('reads the key set from the discovery document, and gives up quietly', async () => {
    const fetchDocument = jest.fn(async () => Response.json({ jwks_uri: oidc.jwksUri }));
    await expect(
      discoverJwksUri(`${oidc.issuer}/`, fetchDocument as unknown as typeof fetch),
    ).resolves.toBe(oidc.jwksUri);
    expect(fetchDocument).toHaveBeenCalledWith(
      `${oidc.issuer}/.well-known/openid-configuration`,
      expect.anything(),
    );

    const unreachable = jest.fn(async () => {
      throw new Error('offline');
    });
    await expect(
      discoverJwksUri(oidc.issuer, unreachable as unknown as typeof fetch),
    ).resolves.toBeUndefined();
  });
});

describe('session cookie setting in copalibre init', () => {
  it('asks about HTTPS with the URL scheme as the default answer', () => {
    expect(httpsQuestion('https://play.example')).toContain('[Y/n]');
    expect(httpsQuestion('http://192.168.1.10')).toContain('[y/N]');
    expect(httpsAnswer('', 'https://play.example')).toBe(true);
    expect(httpsAnswer('', 'http://192.168.1.10')).toBe(false);
    expect(httpsAnswer('yes', 'http://192.168.1.10')).toBe(true);
    expect(httpsAnswer(' N ', 'https://play.example')).toBe(false);
  });

  it('derives the value from the URL when HTTPS is not stated', () => {
    expect(sessionCookieSecureSetting('https://play.example')).toBe('true');
    expect(sessionCookieSecureSetting('http://localhost:8080')).toBe('true');
    expect(sessionCookieSecureSetting('http://192.168.1.10')).toBe('false');
    expect(sessionCookieSecureSetting()).toBe('true');
  });

  it('follows an explicit answer, and refuses "no HTTPS" for an https URL', () => {
    expect(sessionCookieSecureSetting('http://play.example', true)).toBe('true');
    expect(sessionCookieSecureSetting('http://192.168.1.10', false)).toBe('false');
    // localhost is a secure context whatever the answer.
    expect(sessionCookieSecureSetting('http://localhost:8080', false)).toBe('true');
    expect(() => sessionCookieSecureSetting('https://play.example', false)).toThrow(
      '--no-https contradicts',
    );
  });

  it.each([
    [{ appUrl: 'https://play.example' }, 'true'],
    [{ appUrl: 'http://192.168.1.10' }, 'false'],
    [{ appUrl: 'http://192.168.1.10', https: true }, 'true'],
    [{}, 'true'],
  ])('writes COPALIBRE_SESSION_COOKIE_SECURE for %o', async (options, expected) => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    const result = await writeInstallationAssets(cwd, { assetsDir, ...options });

    expect(result.sessionCookieSecure).toBe(expected);
    const env = await readFile(join(cwd, '.env'), 'utf8');
    expect(env).toContain(`COPALIBRE_SESSION_COOKIE_SECURE=${expected}\n`);
    expect(env.match(/COPALIBRE_SESSION_COOKIE_SECURE=/g)).toHaveLength(1);
  });

  it('writes nothing when the HTTPS answer contradicts the URL', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    await expect(
      writeInstallationAssets(cwd, { assetsDir, appUrl: 'https://play.example', https: false }),
    ).rejects.toThrow('--no-https contradicts');
    expect(await readdir(cwd)).toEqual([]);
  });
});
