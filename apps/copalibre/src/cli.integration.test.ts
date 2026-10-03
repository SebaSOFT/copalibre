import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCopalibreVersion } from './banner.js';

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CLI_EXECUTABLE = resolve(SOURCE_DIRECTORY, '../dist/main.js');

interface ProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ProcessResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [CLI_EXECUTABLE, ...arguments_], {
      cwd: process.cwd(),
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

describe('CLI subprocess execution (integration)', () => {
  it('renders top-level --help with aligned command columns', async () => {
    const result = await runCli(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage: copalibre <command> [options]');
    expect(result.stdout).toMatch(/statistics-rebuild\s{3,}\S/);
    expect(result.stdout).toMatch(/upgrade-check\s{3,}\S/);
  });

  it('prints bare semver on stdout when piped, and logo on stderr for --version', async () => {
    const result = await runCli(['--version']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(readCopalibreVersion());
    expect(result.stderr).toContain('CopaLibre v' + readCopalibreVersion());
  });

  it('omits ANSI escape sequences when NO_COLOR is set', async () => {
    const result = await runCli(['--version'], { ...process.env, NO_COLOR: '1' });
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('\x1b[36m');
    expect(result.stdout.trim()).toBe(readCopalibreVersion());
  });
});
