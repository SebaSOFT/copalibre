import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBanner } from './banner.js';

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CLI_EXECUTABLE = resolve(SOURCE_DIRECTORY, '../dist/main.js');
const REPOSITORY_ROOT = resolve(SOURCE_DIRECTORY, '../../..');

describe('copalibre doctor command (integration)', () => {
  it('reports missing configuration and exits non-zero without starting a role', async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), 'copalibre-doctor-'));
    try {
      const result = await runDoctorProcess(dataDirectory);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('FAIL secret:DATABASE_URL: DATABASE_URL is required');
      expect(result.stdout).toContain(
        'FAIL secret:COPALIBRE_BOOTSTRAP_TOKEN: COPALIBRE_BOOTSTRAP_TOKEN is required',
      );
      expect(result.stdout).toContain('FAIL oidc-config:');
      // Only the startup banner (0042) — no stray diagnostic noise beyond it.
      expect(result.stderr).toBe(renderBanner());
    } finally {
      await rm(dataDirectory, { force: true, recursive: true });
    }
  });

  /**
   * The object-storage round-trip check (0041 task 6.4) — against real
   * infrastructure both times: real MinIO with wrong credentials for the S3
   * profile, a real read-only directory for the filesystem profile. Neither
   * scenario is reachable through `objectStorageConfigFromEnv`'s unit tests
   * (it never fails to resolve a config), so this is the only place either
   * failure mode is actually exercised.
   */
  it('fails the object-storage check clearly against a misconfigured S3 bucket/credential', async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), 'copalibre-doctor-'));
    try {
      const result = await runDoctorProcess(dataDirectory, {
        COPALIBRE_OBJECT_STORAGE_URL: 'http://localhost:9000',
        COPALIBRE_OBJECT_STORAGE_ACCESS_KEY: 'wrong-access-key',
        COPALIBRE_OBJECT_STORAGE_SECRET_KEY: 'wrong-secret-key',
        COPALIBRE_OBJECT_STORAGE_BUCKET: 'copalibre-dev',
      });

      expect(result.stdout).toContain('FAIL object-storage: Object storage round-trip failed:');
    } finally {
      await rm(dataDirectory, { force: true, recursive: true });
    }
  });

  it('fails the object-storage check clearly against a read-only filesystem path', async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), 'copalibre-doctor-'));
    await chmod(dataDirectory, 0o444);
    try {
      const result = await runDoctorProcess(dataDirectory);
      expect(result.stdout).toContain('FAIL object-storage: Object storage round-trip failed:');
    } finally {
      await chmod(dataDirectory, 0o755);
      await rm(dataDirectory, { force: true, recursive: true });
    }
  });
});

function runDoctorProcess(
  dataDirectory: string,
  extraEnvironment: NodeJS.ProcessEnv = {},
): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [CLI_EXECUTABLE, 'doctor'], {
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        COPALIBRE_IN_CONTAINER: 'true',
        COPALIBRE_DATA_DIR: dataDirectory,
        DATABASE_URL: '',
        COPALIBRE_APP_URL: '',
        COPALIBRE_BOOTSTRAP_TOKEN: '',
        COPALIBRE_JWKS_URI: '',
        COPALIBRE_JWT_ISSUER: '',
        COPALIBRE_JWT_AUDIENCE: '',
        COPALIBRE_EMAIL_PROVIDER: '',
        COPALIBRE_EMAIL_FROM: '',
        COPALIBRE_SMTP_URL: '',
        ...extraEnvironment,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code) => resolveResult({ code, stdout, stderr }));
  });
}
