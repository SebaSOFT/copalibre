import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { moduleSubmitCommand } from '../module-authoring/cli.js';

export class ModuleSubmitCommand extends Command<CliContext> {
  static override paths = [['module', 'submit']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('module', () => moduleSubmitCommand(this.args));
  }
}
