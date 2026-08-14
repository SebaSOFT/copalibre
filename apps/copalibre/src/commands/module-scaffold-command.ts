import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { moduleScaffoldCommand } from '../module-authoring/cli.js';

export class ModuleScaffoldCommand extends Command<CliContext> {
  static override paths = [['module', 'scaffold']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('module', () => moduleScaffoldCommand(this.args));
  }
}
