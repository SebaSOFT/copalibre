import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatRequiredSecrets,
  generateRsaKeypair,
  readAsset,
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
    expect(content).toContain('COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.1');
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
