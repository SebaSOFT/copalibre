import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { DEV_COMPOSE_FILE, resolveDeploymentTopology } from '../process-lifecycle.js';

export class StopCommand extends Command<CliContext> {
  static override paths = [['stop']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('stop', async () => {
      const parsed = parseArgs({
        args: [...this.args],
        options: {
          dev: { type: 'boolean', default: false },
          down: { type: 'boolean', default: false },
        },
        strict: true,
      });
      const topology = await resolveDeploymentTopology(
        process.cwd(),
        this.context.env,
        parsed.values.dev,
      );
      if (topology.mode === 'kubernetes') {
        const alternative = parsed.values.down
          ? 'use "helm uninstall <release> -n <namespace>"'
          : 'use "kubectl scale deployment --replicas=0" or "helm uninstall <release> -n <namespace>"';
        throw new Error(`use Kubernetes lifecycle command: ${alternative}`);
      }

      const prefix =
        topology.mode === 'dev'
          ? ['compose', '-f', DEV_COMPOSE_FILE, '--profile', 'infrastructure']
          : ['compose'];
      return this.context.processes.run('docker', [
        ...prefix,
        parsed.values.down ? 'down' : 'stop',
      ]);
    });
  }
}
