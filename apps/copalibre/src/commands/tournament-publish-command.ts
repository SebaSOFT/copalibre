import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { tournamentPublish } from '../tournament-operations.js';

export class TournamentPublishCommand extends Command<CliContext> {
  static override paths = [['tournament', 'publish']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('tournament', () => tournamentPublish(this.args));
  }
}
