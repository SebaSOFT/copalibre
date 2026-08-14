import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { requireComposeTarget } from '../compose-target.js';

export class StartCommand extends Command<CliContext> {
  static override paths = [['start']];

  // `start` takes no options of its own (unchanged from before 0086) — the
  // proxy exists only so stray trailing arguments don't trip clipanion's own
  // "unknown option" validation, matching the original's silent no-op.
  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('start', async () => {
      const environment = this.context.env;
      const processes = this.context.processes;
      await requireComposeTarget(environment);
      const database = await processes.run('docker', ['compose', 'up', '--detach', 'postgres']);
      if (database !== 0) return database;
      const doctor = await processes.run('docker', ['compose', 'run', '--rm', 'doctor']);
      if (doctor !== 0) return doctor;
      return processes.run('docker', ['compose', 'up', '--detach', '--wait']);
    });
  }
}
