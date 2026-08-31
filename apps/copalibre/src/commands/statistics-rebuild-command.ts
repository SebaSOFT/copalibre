import { createDatabase, databaseConfigFromEnv, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { readCredential } from '../credentials.js';
import {
  parseStatisticsRebuildOptions,
  runStatisticsRebuild,
  runStatisticsRebuildOverHttp,
} from '../statistics-rebuild.js';

export class StatisticsRebuildCommand extends Command<CliContext> {
  static override paths = [['statistics-rebuild']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('statistics-rebuild', async () => {
      const options = parseStatisticsRebuildOptions(this.args);
      const environment = this.context.env;
      const credential = await readCredential(process.cwd());

      // Dual-path: a stored credential in the current directory (`.copalibre/`,
      // `login`'s write target) means the authenticated HTTP path; otherwise
      // the direct-database path below. Auto-detected, not a flag, so an
      // existing checkout/DATABASE_URL workflow never has to opt into anything.
      const result = credential
        ? await runStatisticsRebuildOverHttp(credential.apiUrl, credential.token, options)
        : await statisticsRebuildDirect(options, environment);

      const scope =
        result.tournamentAlias === undefined
          ? `organization "${result.organizationAlias}"`
          : `tournament "${result.tournamentAlias}" in organization "${result.organizationAlias}"`;
      process.stdout.write(
        `Rebuilt statistics for ${scope}: ${result.matches} finalized match(es), ` +
          `${result.figures} figure row(s) written.\n`,
      );
      return 0;
    });
  }
}

async function statisticsRebuildDirect(
  options: ReturnType<typeof parseStatisticsRebuildOptions>,
  environment: NodeJS.ProcessEnv,
): Promise<Awaited<ReturnType<typeof runStatisticsRebuild>>> {
  const db: Kysely<Database> = createDatabase(databaseConfigFromEnv(environment));
  try {
    return await runStatisticsRebuild(db, options);
  } finally {
    await db.destroy();
  }
}
