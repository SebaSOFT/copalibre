import { Command, Option } from 'clipanion';
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
      // migrateResult === 0 already means the applied schema matches what
      // this installation expects — apps/migrate's own entrypoint checks
      // that and sets a non-zero exit code otherwise (design.md). A second,
      // host-side connection to re-confirm it would need DATABASE_URL set on
      // the host, which nothing about running this CLI against a
      // Compose-hosted Postgres requires or provides.
      process.stdout.write('Migrations applied.\n');
      return 0;
    });
  }
}
