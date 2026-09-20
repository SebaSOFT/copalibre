import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { tournamentList } from '../tournament-operations.js';

export class TournamentListCommand extends Command<CliContext> {
  static override paths = [['tournament', 'list']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('tournament', () => tournamentList(this.args));
  }
}
