import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { tournamentCreate } from '../tournament-operations.js';

export class TournamentCreateCommand extends Command<CliContext> {
  static override paths = [['tournament', 'create']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('tournament', () => tournamentCreate(this.args));
  }
}
