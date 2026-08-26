import { createDatabase, databaseConfigFromEnv, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import {
  executePatCutover,
  patCutoverCompleteMessage,
  patCutoverDryRunMessage,
  parsePatCutoverOptions,
  previewPatCutover,
  requirePatCutoverConfirmation,
} from '../pat-cutover.js';

export class RevokeLegacyPersonalAccessTokensCommand extends Command<CliContext> {
  static override paths = [['revoke-legacy-personal-access-tokens']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('revoke-legacy-personal-access-tokens', async () => {
      const options = parsePatCutoverOptions(this.args);
      requirePatCutoverConfirmation(options);
      const db: Kysely<Database> = createDatabase(databaseConfigFromEnv(this.context.env));
      try {
        if (options.dryRun) {
          const activeTokens = await previewPatCutover(db);
          process.stdout.write(`${patCutoverDryRunMessage(activeTokens)}\n`);
          return 0;
        }
        const result = await executePatCutover(db);
        process.stdout.write(`${patCutoverCompleteMessage(result.revoked)}\n`);
        return 0;
      } finally {
        await db.destroy();
      }
    });
  }
}
