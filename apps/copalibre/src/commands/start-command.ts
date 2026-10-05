import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { DEV_COMPOSE_FILE, resolveDeploymentTopology } from '../process-lifecycle.js';

export class StartCommand extends Command<CliContext> {
  static override paths = [['start']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('start', async () => {
      const environment = this.context.env;
      const processes = this.context.processes;
      const parsed = parseArgs({
        args: [...this.args],
        options: { dev: { type: 'boolean', default: false } },
        strict: true,
      });
      const topology = await resolveDeploymentTopology(
        process.cwd(),
        environment,
        parsed.values.dev,
      );
      if (topology.mode === 'kubernetes') {
        throw new Error(
          'use "helm upgrade --install" with this installation\'s values.yaml to start Kubernetes services',
        );
      }
      if (topology.mode === 'dev') {
        return processes.run('docker', [
          'compose',
          '-f',
          DEV_COMPOSE_FILE,
          '--profile',
          'containerized',
          'up',
          '--detach',
          '--wait',
        ]);
      }
      const database = await processes.run('docker', ['compose', 'up', '--detach', 'postgres']);
      if (database !== 0) return database;
      const doctor = await processes.run('docker', ['compose', 'run', '--rm', 'doctor']);
      if (doctor !== 0) return doctor;
      return processes.run('docker', ['compose', 'up', '--detach', '--wait']);
    });
  }
}
