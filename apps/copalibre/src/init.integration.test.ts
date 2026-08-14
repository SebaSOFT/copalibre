import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

function runCli(arguments_: readonly string[], cwd: string): Promise<ProcessResult> {
  return run(process.execPath, [CLI_EXECUTABLE, ...arguments_], cwd, process.env);
}

/**
 * `init` deliberately never writes these (they're secrets — task 2.3/8.1
 * tell the operator to add them by hand), so a bare `docker compose config`
 * right after `init` correctly fails on the compose file's own `${VAR:?...}`
 * required-interpolation guards. Fake values, supplied as environment
 * overrides here, stand in for "the operator filled in REQUIRED_SECRETS."
 */
function withFakeSecrets(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...environment,
    POSTGRES_PASSWORD: 'fake',
    COPALIBRE_BOOTSTRAP_TOKEN: 'fake',
    COPALIBRE_JWKS_URI: 'https://example.invalid/jwks',
    COPALIBRE_JWT_ISSUER: 'https://example.invalid',
    COPALIBRE_JWT_AUDIENCE: 'copalibre',
    COPALIBRE_OIDC_CLIENT_ID: 'fake',
    COPALIBRE_EMAIL_PROVIDER: 'smtp',
    COPALIBRE_EMAIL_FROM: 'noreply@example.invalid',
  };
}

async function withInstanceDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(resolve(tmpdir(), 'copalibre-instance-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * Task 6.1/6.2: a real `copalibre init` writes a real installation, and a
 * real `docker compose ... config` (no daemon action — Compose's own
 * client-side YAML merge/interpolation, the same "no-deploy validation"
 * style `helm lint --strict` already gives the Helm chart) confirms the
 * written file is actually well-formed and merges the way `init` promised.
 */
describe('copalibre init (integration)', () => {
  it('writes a compose file that docker compose config accepts as valid', async () => {
    await withInstanceDirectory(async (directory) => {
      const initResult = await runCli(['init'], directory);
      expect(initResult.code).toBe(0);

      const configResult = await run('docker', ['compose', 'config'], directory, withFakeSecrets());
      expect(configResult.code).toBe(0);
      expect(configResult.stderr).toBe('');
    });
  });

  it('--module-dev merges the mount and allowlist env var onto api/worker', async () => {
    await withInstanceDirectory(async (directory) => {
      const initResult = await runCli(['init', '--module-dev'], directory);
      expect(initResult.code).toBe(0);

      // `.env`'s own COMPOSE_FILE drives this (3.1.1's correction) — no `-f`
      // flags passed here, matching how cli-runner.ts itself invokes Compose.
      const configResult = await run('docker', ['compose', 'config'], directory, withFakeSecrets());
      expect(configResult.code).toBe(0);

      // Exactly twice each — once per merged service (api, worker) — proves
      // the override landed on both rather than replacing the base file.
      const allowlistOccurrences = configResult.stdout.match(
        /COPALIBRE_MODULE_SOURCE_ALLOWLIST: file:\/\/\/var\/lib\/copalibre\/modules-dev/g,
      );
      expect(allowlistOccurrences).toHaveLength(2);
      const mountOccurrences = configResult.stdout.match(
        /target: \/var\/lib\/copalibre\/modules-dev/g,
      );
      expect(mountOccurrences).toHaveLength(2);
    });
  });

  /**
   * Task 6.3: `migrate`/`upgrade-check` refuse end-to-end against a real,
   * fabricated version mismatch — not the unit-level `assertVersionCompatible`
   * call already covered in `installation-marker.test.ts`/`cli-runner.test.ts`,
   * but the actual spawned CLI reading its own marker file off disk.
   */
  it('migrate refuses end-to-end on a real version-mismatched marker', async () => {
    await withInstanceDirectory(async (directory) => {
      const initResult = await runCli(['init'], directory);
      expect(initResult.code).toBe(0);
      await writeFile(
        resolve(directory, '.copalibre', 'installation.json'),
        JSON.stringify({
          version: '0.0.1-fabricated-mismatch',
          installId: '01890000-0000-7000-8000-000000000001',
          mode: 'compose',
          createdAt: new Date().toISOString(),
        }),
      );

      const result = await runCli(['migrate'], directory);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('0.0.1-fabricated-mismatch');
    });
  });

  it('upgrade-check refuses end-to-end on a real version-mismatched marker', async () => {
    await withInstanceDirectory(async (directory) => {
      const initResult = await runCli(['init'], directory);
      expect(initResult.code).toBe(0);
      await writeFile(
        resolve(directory, '.copalibre', 'installation.json'),
        JSON.stringify({
          version: '0.0.1-fabricated-mismatch',
          installId: '01890000-0000-7000-8000-000000000001',
          mode: 'compose',
          createdAt: new Date().toISOString(),
        }),
      );

      const result = await runCli(['upgrade-check', '--target-version', '2.0.0'], directory);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('0.0.1-fabricated-mismatch');
    });
  });
});
