import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { DEV_COMPOSE_FILE, resolveDeploymentTopology } from '../process-lifecycle.js';

export class RestartCommand extends Command<CliContext> {
  static override paths = [['restart']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('restart', async () => {
      const parsed = parseArgs({
        args: [...this.args],
        options: {
          dev: { type: 'boolean', default: false },
          'no-doctor': { type: 'boolean', default: false },
        },
        strict: true,
      });
      const topology = await resolveDeploymentTopology(
        process.cwd(),
        this.context.env,
        parsed.values.dev,
      );
      if (topology.mode === 'kubernetes') {
        throw new Error(
          `use "kubectl rollout restart deployment/${topology.marker.release}-api deployment/${topology.marker.release}-web -n ${topology.marker.namespace}"`,
        );
      }

      const runner = this.context.processes;
      if (topology.mode === 'dev') {
        const prefix = ['compose', '-f', DEV_COMPOSE_FILE, '--profile', 'infrastructure'];
        const stopped = await runner.run('docker', [...prefix, 'stop']);
        if (stopped !== 0) return stopped;
        return runner.run('docker', [...prefix, 'up', '--detach', '--wait']);
      }

      const stopped = await runner.run('docker', ['compose', 'stop']);
      if (stopped !== 0) return stopped;
      const database = await runner.run('docker', [
        'compose',
        'up',
        '--detach',
        '--wait',
        'postgres',
      ]);
      if (database !== 0) return database;
      if (!parsed.values['no-doctor']) {
        const doctor = await runner.run('docker', ['compose', 'run', '--rm', 'doctor']);
        if (doctor !== 0) return doctor;
      }
      return runner.run('docker', ['compose', 'up', '--detach', '--wait']);
    });
  }
}
