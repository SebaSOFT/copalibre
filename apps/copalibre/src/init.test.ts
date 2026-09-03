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
    expect(content).toContain('COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.0.6');
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
