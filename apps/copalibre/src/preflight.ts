import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import semver from 'semver';

const execFileAsync = promisify(execFile);

export type PreflightStatus = 'pass' | 'fail' | 'warn';

export interface PreflightCheck {
  readonly name: string;
  readonly status: PreflightStatus;
  readonly message: string;
  readonly remediation?: string;
}

export interface PreflightReport {
  readonly checks: readonly PreflightCheck[];
  readonly ok: boolean;
}

export interface PreflightDependencies {
  readonly runCommand?: (
    command: string,
    args: readonly string[],
  ) => Promise<{ stdout: string; stderr: string }>;
  readonly checkPortFree?: (port: number) => Promise<boolean>;
  readonly checkSocketAccess?: (path: string) => Promise<boolean>;
  readonly socketPath?: string;
}

export interface PreflightOptions {
  readonly portsToCheck?: readonly number[];
  readonly skipPorts?: boolean;
}

export const DEFAULT_PREFLIGHT_PORTS = [8080, 5432] as const;
export const DEFAULT_DOCKER_SOCKET = '/var/run/docker.sock';

export async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

export async function isSocketAccessible(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runSystemCommand(
  command: string,
  args: readonly string[],
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(command, [...args], { timeout: 10_000 });
    return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const stdout = err.stdout?.trim() ?? '';
    const stderr = err.stderr?.trim() ?? err.message ?? String(error);
    return { stdout, stderr };
  }
}

/**
 * Preflight verification suite checking host prerequisites before installation or startup.
 */
export async function runPreflight(
  dependencies: PreflightDependencies = {},
  options: PreflightOptions = {},
): Promise<PreflightReport> {
  const runner = dependencies.runCommand ?? runSystemCommand;
  const socketCheck = dependencies.checkSocketAccess ?? isSocketAccessible;
  const portCheck = dependencies.checkPortFree ?? isPortFree;
  const socketPath = dependencies.socketPath ?? DEFAULT_DOCKER_SOCKET;

  const checks: PreflightCheck[] = [];

  // 1. Docker daemon connectivity & socket access check
  const socketAccessible = await socketCheck(socketPath);
  const dockerInfo = await runner('docker', ['version', '--format', '{{.Server.Version}}']);

  const permissionErrorRegex =
    /permission denied|dial unix.*docker\.sock.*connect: permission denied/i;
  const isPermissionDenied =
    !socketAccessible ||
    permissionErrorRegex.test(dockerInfo.stderr) ||
    permissionErrorRegex.test(dockerInfo.stdout);

  if (isPermissionDenied) {
    checks.push({
      name: 'preflight:docker-socket',
      status: 'fail',
      message: `Cannot access Docker socket at ${socketPath} (permission denied)`,
      remediation:
        'Run "sudo usermod -aG docker $USER && newgrp docker" to grant docker group permissions.',
    });
  } else if (
    !dockerInfo.stdout ||
    dockerInfo.stderr.includes('Cannot connect to the Docker daemon')
  ) {
    checks.push({
      name: 'preflight:docker-daemon',
      status: 'fail',
      message: `Cannot connect to Docker daemon: ${dockerInfo.stderr || 'daemon not reachable'}`,
      remediation:
        'Ensure the Docker daemon is running (e.g. "sudo systemctl start docker" or start Docker Desktop).',
    });
  } else {
    checks.push({
      name: 'preflight:docker-daemon',
      status: 'pass',
      message: 'Docker daemon is reachable and responding',
    });

    // 2. Docker version check (>= 24.0.0)
    const rawVersion = dockerInfo.stdout.trim().replace(/^v/, '');
    const cleanVersion = semver.coerce(rawVersion);
    if (!cleanVersion || semver.lt(cleanVersion, '24.0.0')) {
      checks.push({
        name: 'preflight:docker-version',
        status: 'fail',
        message: `Docker Engine version ${rawVersion} is below required 24.0.0`,
        remediation: 'Upgrade Docker Engine to version 24.0.0 or higher.',
      });
    } else {
      checks.push({
        name: 'preflight:docker-version',
        status: 'pass',
        message: `Docker Engine version is ${rawVersion} (>= 24.0.0)`,
      });
    }
  }

  // 3. Docker Compose v2 check
  const composeVersion = await runner('docker', ['compose', 'version', '--short']);
  const cleanCompose = semver.coerce(composeVersion.stdout.trim().replace(/^v/, ''));
  if (!cleanCompose || semver.lt(cleanCompose, '2.0.0')) {
    checks.push({
      name: 'preflight:docker-compose',
      status: 'fail',
      message: `Docker Compose v2 not found or unsupported (${composeVersion.stdout || composeVersion.stderr || 'missing'})`,
      remediation: 'Install Docker Compose v2 plugin ("docker compose").',
    });
  } else {
    checks.push({
      name: 'preflight:docker-compose',
      status: 'pass',
      message: `Docker Compose v2 is available (${composeVersion.stdout.trim()})`,
    });
  }

  // 4. Host port availability checks
  if (!options.skipPorts) {
    const ports = options.portsToCheck ?? DEFAULT_PREFLIGHT_PORTS;
    for (const port of ports) {
      const free = await portCheck(port);
      if (!free) {
        checks.push({
          name: `preflight:port-${port}`,
          status: 'fail',
          message: `Port ${port} is already in use by another process on this host`,
          remediation: `Stop the conflicting service or configure a different port for CopaLibre (e.g. COPALIBRE_PORT).`,
        });
      } else {
        checks.push({
          name: `preflight:port-${port}`,
          status: 'pass',
          message: `Port ${port} is available`,
        });
      }
    }
  }

  return {
    checks,
    ok: checks.every((c) => c.status !== 'fail'),
  };
}

export function formatPreflightReport(report: PreflightReport): string {
  const lines: string[] = [];
  for (const check of report.checks) {
    const label = check.status.toUpperCase().padEnd(4, ' ');
    lines.push(`[${label}] ${check.name}: ${check.message}`);
    if (check.remediation && check.status === 'fail') {
      lines.push(`       -> Remediation: ${check.remediation}`);
    }
  }
  return lines.join('\n');
}
