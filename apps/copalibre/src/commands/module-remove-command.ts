import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { moduleRemove } from '../module-commands.js';

export class ModuleRemoveCommand extends Command<CliContext> {
  static override paths = [['module', 'remove']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('module', () => moduleRemove(this.args, this.context.env));
  }
}
