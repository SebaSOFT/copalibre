import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { runMigrate } from '../migrate-logic.js';

export class MigrateCommand extends Command<CliContext> {
  static override paths = [['migrate']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('migrate', () =>
      runMigrate(this.context.processes, this.context.env, this.args),
    );
  }
}
