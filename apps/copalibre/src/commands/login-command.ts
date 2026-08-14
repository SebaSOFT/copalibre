import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { login as loginToInstallation, parseLoginArguments } from '../login.js';

export class LoginCommand extends Command<CliContext> {
  static override paths = [['login']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('login', async () => {
      const options = parseLoginArguments(this.args, this.context.env);
      const credential = await loginToInstallation(process.cwd(), options);
      process.stdout.write(
        `Stored credential for ${options.apiUrl} (saved ${credential.savedAt}).\n`,
      );
      return 0;
    });
  }
}
