import { formatPreflightReport, runPreflight, type PreflightDependencies } from './preflight.js';

describe('preflight verification suite', () => {
  it('passes when docker daemon, version >= 24, compose v2, and ports are available', async () => {
    const dependencies: PreflightDependencies = {
      checkSocketAccess: async () => true,
      checkPortFree: async () => true,
      runCommand: async (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'version') {
          return { stdout: '27.1.1', stderr: '' };
        }
        if (cmd === 'docker' && args[0] === 'compose') {
          return { stdout: 'v2.29.1', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    };

    const report = await runPreflight(dependencies);
    expect(report.ok).toBe(true);
    expect(report.checks).toHaveLength(5);
    expect(report.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('fails with actionable remediation when docker socket has permission denied', async () => {
    const dependencies: PreflightDependencies = {
      checkSocketAccess: async () => false,
      checkPortFree: async () => true,
      runCommand: async () => ({
        stdout: '',
        stderr: 'permission denied while trying to connect to the Docker daemon socket',
      }),
    };

    const report = await runPreflight(dependencies);
    expect(report.ok).toBe(false);
    const socketCheck = report.checks.find((c) => c.name === 'preflight:docker-socket');
    expect(socketCheck).toBeDefined();
    expect(socketCheck?.status).toBe('fail');
    expect(socketCheck?.remediation).toContain('sudo usermod -aG docker $USER');

    const formatted = formatPreflightReport(report);
    expect(formatted).toContain('-> Remediation: Run "sudo usermod -aG docker $USER');
  });

  it('fails when docker daemon is not running', async () => {
    const dependencies: PreflightDependencies = {
      checkSocketAccess: async () => true,
      checkPortFree: async () => true,
      runCommand: async (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'version') {
          return {
            stdout: '',
            stderr:
              'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
          };
        }
        return { stdout: 'v2.29.1', stderr: '' };
      },
    };

    const report = await runPreflight(dependencies);
    expect(report.ok).toBe(false);
    const daemonCheck = report.checks.find((c) => c.name === 'preflight:docker-daemon');
    expect(daemonCheck?.status).toBe('fail');
    expect(daemonCheck?.remediation).toContain('systemctl start docker');
  });

  it('fails when Docker Engine version is below 24', async () => {
    const dependencies: PreflightDependencies = {
      checkSocketAccess: async () => true,
      checkPortFree: async () => true,
      runCommand: async (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'version') {
          return { stdout: '20.10.21', stderr: '' };
        }
        if (cmd === 'docker' && args[0] === 'compose') {
          return { stdout: 'v2.20.0', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    };

    const report = await runPreflight(dependencies);
    expect(report.ok).toBe(false);
    const versionCheck = report.checks.find((c) => c.name === 'preflight:docker-version');
    expect(versionCheck?.status).toBe('fail');
    expect(versionCheck?.message).toContain('below required 24.0.0');
    expect(versionCheck?.remediation).toContain('Upgrade Docker Engine');
  });

  it('fails when Docker Compose v2 is missing or v1', async () => {
    const dependencies: PreflightDependencies = {
      checkSocketAccess: async () => true,
      checkPortFree: async () => true,
      runCommand: async (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'version') {
          return { stdout: '25.0.0', stderr: '' };
        }
        if (cmd === 'docker' && args[0] === 'compose') {
          return { stdout: '1.29.2', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    };

    const report = await runPreflight(dependencies);
    expect(report.ok).toBe(false);
    const composeCheck = report.checks.find((c) => c.name === 'preflight:docker-compose');
    expect(composeCheck?.status).toBe('fail');
    expect(composeCheck?.remediation).toContain('Install Docker Compose v2 plugin');
  });

  it('fails when a required host port is in use', async () => {
    const dependencies: PreflightDependencies = {
      checkSocketAccess: async () => true,
      checkPortFree: async (port) => port !== 8080,
      runCommand: async (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'version') {
          return { stdout: '26.0.0', stderr: '' };
        }
        if (cmd === 'docker' && args[0] === 'compose') {
          return { stdout: 'v2.25.0', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    };

    const report = await runPreflight(dependencies, { portsToCheck: [8080, 5432] });
    expect(report.ok).toBe(false);
    const portCheck = report.checks.find((c) => c.name === 'preflight:port-8080');
    expect(portCheck?.status).toBe('fail');
    expect(portCheck?.message).toContain('Port 8080 is already in use');

    const pgPortCheck = report.checks.find((c) => c.name === 'preflight:port-5432');
    expect(pgPortCheck?.status).toBe('pass');
  });
});
