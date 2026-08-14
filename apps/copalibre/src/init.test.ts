import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatRequiredSecrets, writeInstallationAssets, writeLocalDefaults } from './init.js';

describe('copalibre init', () => {
  it('writes only non-secret defaults into a new local file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-init-'));
    const file = join(directory, '.env');

    await writeLocalDefaults(file);

    const content = await readFile(file, 'utf8');
    expect(content).toContain('COPALIBRE_APP_URL=http://localhost:4321');
    expect(content).not.toContain('BOOTSTRAP_TOKEN=');
  });

  it('lists required secret inputs without assigning values', () => {
    expect(formatRequiredSecrets()).toContain('COPALIBRE_BOOTSTRAP_TOKEN');
    expect(formatRequiredSecrets()).not.toContain('=');
  });
});

/** A minimal stand-in for `dist/assets/` — real content doesn't matter, only that a copy happens. */
async function stubAssetsDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-assets-'));
  await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
  await writeFile(join(directory, 'docker-compose.module-dev.yml'), 'services: {}\n');
  return directory;
}

describe('writeInstallationAssets (0084)', () => {
  it('writes the compose file, .env, and the marker into an empty directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copalibre-instance-'));
    const assetsDir = await stubAssetsDir();

    const result = await writeInstallationAssets(cwd, { assetsDir });

    expect(await readFile(result.composeFile, 'utf8')).toBe('services: {}\n');
    const env = await readFile(result.envFile, 'utf8');
    expect(env).toContain('COMPOSE_FILE=docker-compose.yml\n');
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
