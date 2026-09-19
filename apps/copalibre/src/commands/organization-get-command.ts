import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { organizationGet } from '../tournament-operations.js';

export class OrganizationGetCommand extends Command<CliContext> {
  static override paths = [['organization', 'get']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('organization', () => organizationGet(this.args));
  }
}
