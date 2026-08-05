import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
      expect(result.stderr).toBe('');
    } finally {
      await rm(dataDirectory, { force: true, recursive: true });
    }
  });
});

function runDoctorProcess(dataDirectory: string): Promise<{
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
