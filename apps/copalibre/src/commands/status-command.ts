import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { readInstallationMarker } from '../installation-marker.js';
import { DEV_COMPOSE_FILE, resolveDeploymentTopology } from '../process-lifecycle.js';
import type { ProcessOutput } from '../process-runner.js';

export interface ComposeServiceRow {
  readonly Name?: unknown;
  readonly Service?: unknown;
  readonly State?: unknown;
  readonly Health?: unknown;
  readonly Publishers?: readonly {
    readonly URL?: unknown;
    readonly PublishedPort?: unknown;
    readonly TargetPort?: unknown;
    readonly Protocol?: unknown;
  }[];
}

interface KubernetesPodList {
  readonly items?: readonly {
    readonly metadata?: { readonly name?: unknown };
    readonly status?: {
      readonly phase?: unknown;
      readonly conditions?: readonly {
        readonly type?: unknown;
        readonly status?: unknown;
      }[];
    };
  }[];
}

export class StatusCommand extends Command<CliContext> {
  static override paths = [['status']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('status', async () => {
      const parsed = parseArgs({
        args: [...this.args],
        options: {
          json: { type: 'boolean', default: false },
          dev: { type: 'boolean', default: false },
        },
        strict: true,
      });
      const topology = await resolveDeploymentTopology(
        process.cwd(),
        this.context.env,
        parsed.values.dev,
      );
      if (topology.mode === 'kubernetes') {
        return this.statusKubernetes(topology.marker, parsed.values.json);
      }
      return this.statusCompose(topology.mode, parsed.values.json);
    });
  }

  private async statusCompose(mode: 'compose' | 'dev', json: boolean): Promise<number> {
    const environment = await this.installationEnvironment();
    const prefix =
      mode === 'dev'
        ? [
            'compose',
            '-f',
            DEV_COMPOSE_FILE,
            '--profile',
            'infrastructure',
            '--profile',
            'containerized',
          ]
        : ['compose'];
    const result = await this.capture('docker', [...prefix, 'ps', '--format', 'json'], environment);
    if (result.code !== 0) {
      process.stderr.write(result.stderr || 'docker compose ps failed\n');
      return result.code;
    }

    let services: readonly ComposeServiceRow[];
    try {
      services = parseComposePs(result.stdout);
    } catch (error) {
      throw new Error(`could not parse docker compose status: ${(error as Error).message}`, {
        cause: error,
      });
    }
    const gatewayUrl =
      mode === 'dev'
        ? 'http://127.0.0.1:3001'
        : `http://127.0.0.1:${environment.COPALIBRE_PORT ?? '8080'}`;
    const healthUrl = mode === 'dev' ? `${gatewayUrl}/health` : `${gatewayUrl}/api/health`;
    const gateway = await probeGateway(healthUrl);
    const healthy = gateway.ok && services.every(isRunningAndHealthy);
    const publishedPorts = collectPublishedPorts(services);

    if (json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            mode,
            services,
            ingressPorts: publishedPorts,
            gateway: { url: gatewayUrl, healthUrl, ...gateway },
            healthy,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      process.stdout.write(`Installation mode: ${mode}\n`);
      if (services.length === 0) {
        process.stdout.write('No containers are running.\n');
      } else {
        for (const service of services) {
          const name = stringValue(service.Service) ?? stringValue(service.Name) ?? 'unknown';
          const state = stringValue(service.State) ?? 'unknown';
          const health = stringValue(service.Health);
          process.stdout.write(`${name}: ${state}${health ? ` (${health})` : ''}\n`);
        }
      }
      process.stdout.write(
        `Ingress ports: ${publishedPorts.length ? publishedPorts.join(', ') : 'none'}\n`,
      );
      process.stdout.write(`Gateway: ${gatewayUrl} (${gateway.ok ? 'healthy' : gateway.error})\n`);
    }
    return healthy ? 0 : 1;
  }

  private async statusKubernetes(
    marker: Extract<Awaited<ReturnType<typeof readInstallationMarker>>, { mode: 'kubernetes' }>,
    json: boolean,
  ): Promise<number> {
    const command = [
      'get',
      'pods',
      '-l',
      `app.kubernetes.io/instance=${marker.release}`,
      '-n',
      marker.namespace,
      '-o',
      'json',
      ...(marker.context ? ['--context', marker.context] : []),
    ];
    let result: ProcessOutput;
    try {
      result = await this.capture('kubectl', command, this.context.env);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const inspection = `kubectl ${command.join(' ')}`;
      if (json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              mode: 'kubernetes',
              release: marker.release,
              namespace: marker.namespace,
              context: marker.context,
              available: false,
              inspectionCommand: inspection,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        process.stdout.write(
          `Kubernetes release: ${marker.release}\nNamespace: ${marker.namespace}\n` +
            `${marker.context ? `Context: ${marker.context}\n` : ''}` +
            `kubectl is not installed. Inspect pods with:\n  ${inspection}\n`,
        );
      }
      return 1;
    }

    if (result.code !== 0) {
      process.stderr.write(result.stderr || 'kubectl get pods failed\n');
      return result.code;
    }
    let pods: KubernetesPodList;
    try {
      pods = JSON.parse(result.stdout) as KubernetesPodList;
    } catch (error) {
      throw new Error(`could not parse kubectl pod status: ${(error as Error).message}`, {
        cause: error,
      });
    }
    const items = pods.items ?? [];
    const healthy = items.length > 0 && items.every(isReadyPod);
    if (json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            mode: 'kubernetes',
            release: marker.release,
            namespace: marker.namespace,
            context: marker.context,
            pods: items,
            healthy,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      process.stdout.write(
        `Kubernetes release: ${marker.release}\nNamespace: ${marker.namespace}\n` +
          `${marker.context ? `Context: ${marker.context}\n` : ''}`,
      );
      for (const pod of items) {
        process.stdout.write(
          `${stringValue(pod.metadata?.name) ?? 'unknown'}: ${stringValue(pod.status?.phase) ?? 'unknown'}${isReadyPod(pod) ? ' (ready)' : ''}\n`,
        );
      }
    }
    return healthy ? 0 : 1;
  }

  private async installationEnvironment(): Promise<NodeJS.ProcessEnv> {
    let fromFile: NodeJS.ProcessEnv = {};
    try {
      fromFile = parseEnv(await readFile(join(process.cwd(), '.env'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return { ...fromFile, ...this.context.env };
  }

  private async capture(
    command: string,
    arguments_: readonly string[],
    environment: NodeJS.ProcessEnv,
  ): Promise<ProcessOutput> {
    const capture = this.context.processes.capture;
    if (!capture) {
      throw new Error('status requires a process runner that can capture command output');
    }
    return capture.call(this.context.processes, command, arguments_, environment);
  }
}

export function parseComposePs(output: string): readonly ComposeServiceRow[] {
  const trimmed = output.trim();
  if (!trimmed) return [];
  const parsed: unknown = JSON.parse(
    trimmed.startsWith('[') ? trimmed : `[${trimmed.split(/\r?\n/).join(',')}]`,
  );
  if (!Array.isArray(parsed) || !parsed.every((row) => typeof row === 'object' && row !== null)) {
    throw new Error('expected a JSON array of services');
  }
  return parsed as readonly ComposeServiceRow[];
}

function isRunningAndHealthy(service: ComposeServiceRow): boolean {
  return stringValue(service.State) === 'running' && stringValue(service.Health) !== 'unhealthy';
}

function collectPublishedPorts(services: readonly ComposeServiceRow[]): string[] {
  return [
    ...new Set(
      services.flatMap((service) =>
        (service.Publishers ?? []).flatMap((publisher) => {
          const published = stringValue(publisher.PublishedPort);
          return published ? [published] : [];
        }),
      ),
    ),
  ];
}

function isReadyPod(pod: NonNullable<KubernetesPodList['items']>[number]): boolean {
  return (
    pod.status?.phase === 'Running' &&
    pod.status.conditions?.some(
      (condition) => condition.type === 'Ready' && condition.status === 'True',
    ) === true
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

async function probeGateway(
  url: string,
): Promise<{ readonly ok: boolean; readonly error?: string }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.ok ? { ok: true } : { ok: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
