import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../cli.js';
import { writeInstallationMarker } from '../installation-marker.js';
import type { ProcessOutput, ProcessRunner } from '../process-runner.js';
import { parseComposePs } from './status-command.js';

async function withDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-status-test-'));
  process.chdir(directory);
  try {
    return await run(directory);
  } finally {
    process.chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  }
}

function composeOutput(state = 'running', health = 'healthy'): ProcessOutput {
  return {
    code: 0,
    stderr: '',
    stdout: JSON.stringify({
      Name: 'copalibre-gateway-1',
      Service: 'gateway',
      State: state,
      Health: health,
      Publishers: [{ PublishedPort: 9090, TargetPort: 80, Protocol: 'tcp' }],
    }),
  };
}

describe('parseComposePs', () => {
  it('parses Compose JSON arrays and newline-delimited objects', () => {
    const service = { Service: 'api', State: 'running' };
    expect(parseComposePs(JSON.stringify([service]))).toEqual([service]);
    expect(
      parseComposePs(`${JSON.stringify(service)}\n${JSON.stringify({ Service: 'web' })}`),
    ).toEqual([service, { Service: 'web' }]);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseComposePs('{broken')).toThrow();
  });
});

describe('copalibre status', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports Compose services, custom ingress ports, and gateway health as JSON', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
      await writeFile(join(directory, '.env'), 'COPALIBRE_PORT=9090\n');
      const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () => composeOutput());
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
      try {
        await expect(runCli(['status', '--json'], {}, { run, capture })).resolves.toBe(0);
        expect(capture).toHaveBeenCalledWith('docker', ['compose', 'ps', '--format', 'json'], {
          COPALIBRE_PORT: '9090',
        });
        expect(globalThis.fetch).toHaveBeenCalledWith(
          'http://127.0.0.1:9090/api/health',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        const document = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
        expect(document).toMatchObject({
          mode: 'compose',
          ingressPorts: ['9090'],
          gateway: { url: 'http://127.0.0.1:9090', ok: true },
          healthy: true,
        });
      } finally {
        output.mockRestore();
        stderr.mockRestore();
      }
    });
  });

  it('checks the development API health endpoint on its published port', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.dev.yml'), 'services: {}\n');
      const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () => ({
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          Name: 'copalibre-dev-api-1',
          Service: 'api',
          State: 'running',
          Publishers: [{ PublishedPort: 3001, TargetPort: 3001, Protocol: 'tcp' }],
        }),
      }));
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
      try {
        await expect(runCli(['status', '--dev', '--json'], {}, { run, capture })).resolves.toBe(0);
        expect(capture).toHaveBeenCalledWith(
          'docker',
          [
            'compose',
            '-f',
            'docker-compose.dev.yml',
            '--profile',
            'infrastructure',
            '--profile',
            'containerized',
            'ps',
            '--format',
            'json',
          ],
          {},
        );
        expect(globalThis.fetch).toHaveBeenCalledWith(
          'http://127.0.0.1:3001/health',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toMatchObject({
          mode: 'dev',
          gateway: { url: 'http://127.0.0.1:3001', healthUrl: 'http://127.0.0.1:3001/health' },
          healthy: true,
        });
      } finally {
        output.mockRestore();
        stderr.mockRestore();
      }
    });
  });

  it('returns a failing status when a service or the gateway is unhealthy', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
      const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () =>
        composeOutput('exited', 'none'),
      );
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('unavailable', { status: 503 }));
      try {
        await expect(runCli(['status'], {}, { run, capture })).resolves.toBe(1);
      } finally {
        stdout.mockRestore();
        stderr.mockRestore();
      }
    });
  });

  it('queries release-scoped Kubernetes pods and reports their readiness', async () => {
    await withDirectory(async (directory) => {
      await writeInstallationMarker(directory, '1.2.6', {
        release: 'club-cup',
        namespace: 'production',
        context: 'prod-cluster',
      });
      const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () => ({
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          items: [
            {
              metadata: { name: 'club-cup-api-123' },
              status: {
                phase: 'Running',
                conditions: [{ type: 'Ready', status: 'True' }],
              },
            },
          ],
        }),
      }));
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        await expect(runCli(['status', '--json'], {}, { run, capture })).resolves.toBe(0);
        expect(capture).toHaveBeenCalledWith(
          'kubectl',
          [
            'get',
            'pods',
            '-l',
            'app.kubernetes.io/instance=club-cup',
            '-n',
            'production',
            '-o',
            'json',
            '--context',
            'prod-cluster',
          ],
          {},
        );
        expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toMatchObject({
          mode: 'kubernetes',
          release: 'club-cup',
          namespace: 'production',
          context: 'prod-cluster',
          healthy: true,
        });
      } finally {
        output.mockRestore();
        stderr.mockRestore();
      }
    });
  });

  it('prints an exact Kubernetes inspection command when kubectl is absent', async () => {
    await withDirectory(async (directory) => {
      await writeInstallationMarker(directory, '1.2.6', {
        release: 'club-cup',
        namespace: 'production',
      });
      const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () => {
        throw Object.assign(new Error('spawn kubectl ENOENT'), { code: 'ENOENT' });
      });
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        await expect(runCli(['status'], {}, { run, capture })).resolves.toBe(1);
        expect(output.mock.calls.at(-1)?.[0]).toContain(
          'kubectl get pods -l app.kubernetes.io/instance=club-cup -n production -o json',
        );
      } finally {
        output.mockRestore();
        stderr.mockRestore();
      }
    });
  });
});
