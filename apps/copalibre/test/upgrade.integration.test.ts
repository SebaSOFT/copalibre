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

async function withInstanceDirectory<T>(runTask: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(resolve(tmpdir(), 'copalibre-upgrade-test-'));
  try {
    return await runTask(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('copalibre upgrade (integration)', () => {
  it('executes copalibre upgrade --check non-destructively against an initialized installation', async () => {
    await withInstanceDirectory(async (directory) => {
      const initResult = await runCli(['init', '--non-interactive', '--skip-preflight'], directory);
      expect(initResult.code).toBe(0);

      const checkResult = await runCli(['upgrade', '--check'], directory);
      expect(checkResult.code).toBe(0);
      expect(checkResult.stdout).toContain('Current CopaLibre version:');
      expect(checkResult.stdout).toContain('Target / Latest available version:');
    });
  });

  it('reconciles compose, .env, and installation marker to target version', async () => {
    await withInstanceDirectory(async (directory) => {
      const initResult = await runCli(['init', '--non-interactive', '--skip-preflight'], directory);
      expect(initResult.code).toBe(0);

      const upgradeResult = await runCli(
        ['upgrade', '--target-version', '1.3.0', '--skip-services', '--skip-self-update', '--yes'],
        directory,
      );
      expect(upgradeResult.code).toBe(0);
      expect(upgradeResult.stdout).toContain('Reconciled configuration files for CopaLibre v1.3.0');
      expect(upgradeResult.stdout).toContain('CopaLibre upgrade to v1.3.0 completed successfully');

      const updatedEnv = await readFile(resolve(directory, '.env'), 'utf8');
      expect(updatedEnv).toContain('COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.3.0');
      expect(updatedEnv).toContain('COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.3.0');

      const updatedCompose = await readFile(resolve(directory, 'docker-compose.yml'), 'utf8');
      expect(updatedCompose).toContain('${COPALIBRE_IMAGE:-');

      const updatedMarker = JSON.parse(
        await readFile(resolve(directory, '.copalibre', 'installation.json'), 'utf8'),
      );
      expect(updatedMarker.version).toBe('1.3.0');
    });
  });

  it('runs copalibre upgrade --self cleanly in source checkout mode', async () => {
    await withInstanceDirectory(async (directory) => {
      const result = await runCli(['upgrade', '--self'], directory);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('CLI self-update: running from source checkout');
    });
  });
});
