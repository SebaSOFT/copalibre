import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { moduleValidateLocalCommand } from '../module-authoring/cli.js';

export class ModuleValidateLocalCommand extends Command<CliContext> {
  static override paths = [['module', 'validate-local']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('module', () => moduleValidateLocalCommand(this.args, this.context.env));
  }
}
