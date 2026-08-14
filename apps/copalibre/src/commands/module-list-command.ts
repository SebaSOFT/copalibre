import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { moduleList } from '../module-commands.js';

export class ModuleListCommand extends Command<CliContext> {
  static override paths = [['module', 'list']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('module', () => moduleList(this.args, this.context.env));
  }
}
