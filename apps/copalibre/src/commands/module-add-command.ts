import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { moduleAdd } from '../module-commands.js';

export class ModuleAddCommand extends Command<CliContext> {
  static override paths = [['module', 'add']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('module', () => moduleAdd(this.args, this.context.env));
  }
}
