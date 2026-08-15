import { Command, Option } from 'clipanion';
import {
  createDatabase,
  databaseConfigFromEnv,
  EXPECTED_SCHEMA_VERSION,
  isSchemaReady,
  readAppliedSchemaVersion,
} from '@copalibre/persistence';
import { assertBackupFile, parseRestoreOptions, restoreDryRunMessage } from '../backup.js';
import { restoreBackupPacket } from '../backup-packet.js';
import { readCopalibreVersion } from '../banner.js';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { refuseForKubernetesMode } from '../compose-target.js';
import { runMigrate } from '../migrate-logic.js';

export class RestoreCommand extends Command<CliContext> {
  static override paths = [['restore']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('restore', async () => {
      await refuseForKubernetesMode();
      const options = parseRestoreOptions(this.args);
      if (!options.dryRun && !options.confirmed) {
        throw new Error('restore requires --confirm (or use --dry-run)');
      }
      assertBackupFile(options.file);
      if (options.dryRun) {
        process.stdout.write(`${restoreDryRunMessage(options)}\n`);
        return 0;
      }
      const environment = this.context.env;
      const processes = this.context.processes;
      const database = environment.POSTGRES_DB?.trim() || 'copalibre';
      const restored = await restoreBackupPacket(processes, {
        file: options.file,
        database,
        runningCopalibreVersion: readCopalibreVersion(),
        allowNewerBackup: options.allowNewerBackup,
      });
      process.stdout.write(
        `Restored from packet: ${options.file} (CopaLibre ${restored.backupVersion}, ` +
          `created ${restored.backupCreatedAt})\n`,
      );

      const migrateResult = await runMigrate(processes, environment);
      if (migrateResult !== 0) {
        process.stderr.write(
          'Restore completed but migration failed. Run "copalibre migrate" to retry, then ' +
            '"copalibre doctor" to check the installation before serving traffic.\n',
        );
        return migrateResult;
      }
      process.stdout.write('Migrations applied.\n');

      const db = createDatabase(databaseConfigFromEnv(environment));
      try {
        const applied = await readAppliedSchemaVersion(db);
        if (!(await isSchemaReady(db))) {
          process.stderr.write(
            `Schema check failed after restore: applied schema is ${applied ?? 'unmigrated'}, ` +
              `expected ${EXPECTED_SCHEMA_VERSION}. Run "copalibre doctor" before serving traffic.\n`,
          );
          return 1;
        }
        process.stdout.write(`Schema verified: ${applied} matches this installation.\n`);
      } finally {
        await db.destroy();
      }
      return 0;
    });
  }
}
