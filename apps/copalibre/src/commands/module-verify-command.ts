import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { moduleVerify } from '../module-commands.js';

export class ModuleVerifyCommand extends Command<CliContext> {
  static override paths = [['module', 'verify']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('module', () => moduleVerify(this.args, this.context.env));
  }
}
