import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { tournamentGet } from '../tournament-operations.js';

export class TournamentGetCommand extends Command<CliContext> {
  static override paths = [['tournament', 'get']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('tournament', () => tournamentGet(this.args));
  }
}
