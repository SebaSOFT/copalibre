import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CLI_EXECUTABLE = resolve(SOURCE_DIRECTORY, '../dist/main.js');

interface ProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(
  command: string,
  arguments_: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ProcessResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, [...arguments_], {
      cwd,
      env: environment,
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

function runCli(
  arguments_: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ProcessResult> {
  return run(process.execPath, [CLI_EXECUTABLE, ...arguments_], cwd, environment);
}

function withRequiredSecrets(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...environment,
    POSTGRES_PASSWORD: 'test_password',
    COPALIBRE_BOOTSTRAP_TOKEN: 'test_bootstrap_token',
    COPALIBRE_JWKS_URI: 'https://auth.example.com/jwks.json',
    COPALIBRE_JWT_ISSUER: 'https://auth.example.com',
    COPALIBRE_JWT_AUDIENCE: 'copalibre',
    COPALIBRE_OIDC_CLIENT_ID: 'test-client',
    COPALIBRE_EMAIL_PROVIDER: 'smtp',
    COPALIBRE_EMAIL_FROM: 'noreply@example.com',
  };
}

async function withInstanceDirectory<T>(runTask: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(resolve(tmpdir(), 'copalibre-smoke-test-'));
  try {
    return await runTask(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('copalibre init smoke & lifecycle (integration)', () => {
  it('passes docker compose config with object-storage profile enabled', async () => {
    await withInstanceDirectory(async (directory) => {
      const initResult = await runCli(['init', '--non-interactive', '--skip-preflight'], directory);
      expect(initResult.code).toBe(0);

      const envContent = await readFile(resolve(directory, '.env'), 'utf8');
      expect(envContent).toMatch(/GARAGE_RPC_SECRET=[0-9a-f]{64}/);

      // Verify that compose config with optional-adapters (object-storage) passes
      const composeResult = await run(
        'docker',
        ['compose', '--profile', 'optional-adapters', 'config'],
        directory,
        withRequiredSecrets(),
      );
      expect(composeResult.code).toBe(0);
      expect(composeResult.stdout).toContain('object-storage');
    });
  });

  it('exercises copalibre init --non-interactive followed by doctor in an isolated directory', async () => {
    await withInstanceDirectory(async (directory) => {
      const initResult = await runCli(
        ['init', '--non-interactive', '--skip-preflight', '--proxy', 'nginx'],
        directory,
      );
      expect(initResult.code).toBe(0);
      expect(initResult.stdout).toContain('docker-compose.yml');
      expect(initResult.stdout).toContain('.env');
      expect(initResult.stdout).toContain('Scaffolded local ./modules directory');
      expect(initResult.stdout).toContain('copalibre-nginx.conf');

      // Run doctor with mock/fake container environment so it evaluates without needing live DB
      const doctorResult = await runCli(['doctor'], directory, {
        ...process.env,
        COPALIBRE_IN_CONTAINER: 'true',
        DATABASE_URL: 'postgres://copalibre:test@localhost:5432/copalibre',
        COPALIBRE_APP_URL: 'http://localhost:8080',
        COPALIBRE_BOOTSTRAP_TOKEN: 'token',
        COPALIBRE_JWKS_URI: 'http://localhost:8080/.well-known/jwks.json',
        COPALIBRE_JWT_ISSUER: 'http://localhost:8080',
        COPALIBRE_JWT_AUDIENCE: 'copalibre',
        COPALIBRE_OIDC_CLIENT_ID: 'client',
        COPALIBRE_EMAIL_PROVIDER: 'smtp',
        COPALIBRE_EMAIL_FROM: 'noreply@copalibre.local',
      });

      // Doctor output should execute checks against the environment
      expect(doctorResult.stdout).toContain('oidc-config');
      expect(doctorResult.stdout).toContain('service-ports');
    });
  });
});
