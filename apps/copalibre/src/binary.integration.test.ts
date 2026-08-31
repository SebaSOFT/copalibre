import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InstallationMarker } from './installation-marker.js';

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CLI_EXECUTABLE = resolve(SOURCE_DIRECTORY, '../dist/main.js');
const BINARY_EXECUTABLE = resolve(
  SOURCE_DIRECTORY,
  '../dist/binaries',
  `copalibre-${hostBinaryTarget()}${process.platform === 'win32' ? '.exe' : ''}`,
);

interface ProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(
  command: string,
  arguments_: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
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

function runNode(
  arguments_: readonly string[],
  cwd: string,
  environment = process.env,
): Promise<ProcessResult> {
  return run(process.execPath, [CLI_EXECUTABLE, ...arguments_], cwd, environment);
}

function runBinary(
  arguments_: readonly string[],
  cwd: string,
  environment = process.env,
): Promise<ProcessResult> {
  return run(BINARY_EXECUTABLE, arguments_, cwd, environment);
}

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(resolve(tmpdir(), 'copalibre-binary-parity-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function hostBinaryTarget(): string {
  const platforms: Partial<Record<NodeJS.Platform, string>> = {
    darwin: 'macos',
    linux: 'linux',
    win32: 'windows',
  };
  const architectures: Partial<Record<NodeJS.Architecture, string>> = {
    arm64: 'arm64',
    x64: 'x86_64',
  };
  const platform = platforms[process.platform];
  const arch = architectures[process.arch];
  return `${platform}-${arch}`;
}

/** Env `doctor --in-container`'s "missing configuration" report needs to be deterministic. */
const CLEARED_DOCTOR_ENVIRONMENT: NodeJS.ProcessEnv = {
  ...process.env,
  COPALIBRE_IN_CONTAINER: 'true',
  DATABASE_URL: '',
  COPALIBRE_APP_URL: '',
  COPALIBRE_BOOTSTRAP_TOKEN: '',
  COPALIBRE_JWKS_URI: '',
  COPALIBRE_JWT_ISSUER: '',
  COPALIBRE_JWT_AUDIENCE: '',
  COPALIBRE_EMAIL_PROVIDER: '',
  COPALIBRE_EMAIL_FROM: '',
  COPALIBRE_SMTP_URL: '',
};

/**
 * The packaged single-executable binary (`build-binary.mjs`) must produce
 * output identical to `node dist/main.js` — the whole point of packaging is
 * a drop-in replacement, not a second, subtly different CLI. Skipped
 * (rather than failing) when no binary has been built for this host's own
 * platform, since building one is a separate, explicit step
 * (`yarn workspace @copalibre/copalibre run bundle && ... run build:binary
 * --target <host>`) that a plain `yarn test:integration` doesn't take —
 * `copalibre-cli-build-check.yml`'s own CI step builds one first specifically
 * so this suite actually runs there.
 */
const describeIfBuilt = existsSync(BINARY_EXECUTABLE) ? describe : describe.skip;

describeIfBuilt('packaged binary parity with node dist/main.js (integration)', () => {
  it('--version prints the same output', async () => {
    const node = await withTemporaryDirectory((directory) => runNode(['--version'], directory));
    const binary = await withTemporaryDirectory((directory) => runBinary(['--version'], directory));

    expect(binary.code).toBe(node.code);
    expect(binary.stdout).toBe(node.stdout);
    expect(binary.stderr).toBe(node.stderr);
  });

  it('--help prints the same output', async () => {
    const node = await withTemporaryDirectory((directory) => runNode(['--help'], directory));
    const binary = await withTemporaryDirectory((directory) => runBinary(['--help'], directory));

    expect(binary.code).toBe(node.code);
    expect(binary.stdout).toBe(node.stdout);
    expect(binary.stderr).toBe(node.stderr);
  });

  it('init writes the same compose file and .env, and a structurally equivalent marker', async () => {
    await withTemporaryDirectory(async (nodeDirectory) => {
      await withTemporaryDirectory(async (binaryDirectory) => {
        const node = await runNode(['init'], nodeDirectory);
        const binary = await runBinary(['init'], binaryDirectory);
        expect(binary.code).toBe(node.code);
        expect(binary.code).toBe(0);

        const nodeCompose = await readFile(join(nodeDirectory, 'docker-compose.yml'), 'utf8');
        const binaryCompose = await readFile(join(binaryDirectory, 'docker-compose.yml'), 'utf8');
        expect(binaryCompose).toBe(nodeCompose);

        const nodeEnv = await readFile(join(nodeDirectory, '.env'), 'utf8');
        const binaryEnv = await readFile(join(binaryDirectory, '.env'), 'utf8');
        expect(binaryEnv).toBe(nodeEnv);

        const nodeMarker = JSON.parse(
          await readFile(join(nodeDirectory, '.copalibre', 'installation.json'), 'utf8'),
        ) as InstallationMarker;
        const binaryMarker = JSON.parse(
          await readFile(join(binaryDirectory, '.copalibre', 'installation.json'), 'utf8'),
        ) as InstallationMarker;
        // installId/createdAt are per-run and expected to differ — everything else must not.
        expect(binaryMarker.version).toBe(nodeMarker.version);
        expect(binaryMarker.mode).toBe(nodeMarker.mode);
      });
    });
  });

  it('doctor reports the same missing-configuration failures', async () => {
    const node = await withTemporaryDirectory((directory) =>
      runNode(['doctor'], directory, CLEARED_DOCTOR_ENVIRONMENT),
    );
    const binary = await withTemporaryDirectory((directory) =>
      runBinary(['doctor'], directory, CLEARED_DOCTOR_ENVIRONMENT),
    );

    expect(binary.code).toBe(node.code);
    expect(binary.stdout).toBe(node.stdout);
    expect(binary.stderr).toBe(node.stderr);
  });
});
