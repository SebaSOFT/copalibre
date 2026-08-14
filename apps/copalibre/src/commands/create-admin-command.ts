import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { createInitialAdministrator, parseCreateAdminArguments } from '../create-admin.js';

export class CreateAdminCommand extends Command<CliContext> {
  static override paths = [['create-admin']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('create-admin', async () => {
      const result = await createInitialAdministrator(
        parseCreateAdminArguments(this.args),
        this.context.env,
      );
      process.stdout.write(`Administrator setup link (shown once): ${result.setupUrl}\n`);
      return 0;
    });
  }
}
