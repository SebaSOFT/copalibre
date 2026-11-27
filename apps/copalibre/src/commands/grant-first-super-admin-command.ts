import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { describeGrant, grantFirstSuperAdminFromEnv } from '../super-admin.js';

export class GrantFirstSuperAdminCommand extends Command<CliContext> {
  static override paths = [['grant-first-super-admin']];

  email = Option.String('--email');

  async execute(): Promise<number> {
    return runCommand('grant-first-super-admin', async () => {
      // Checked here, not by the parser, so it reads like every other command's failure.
      if (!this.email?.trim()) throw new Error('--email is required');
      const grant = await grantFirstSuperAdminFromEnv(this.email, this.context.env);
      process.stdout.write(describeGrant(grant));
      return 0;
    });
  }
}
