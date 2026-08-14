import { Command, Option } from 'clipanion';
import { assertBackupFile, backupDryRunMessage, parseBackupOptions } from '../backup.js';
import { createBackupPacket } from '../backup-packet.js';
import { readCopalibreVersion } from '../banner.js';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';

export class BackupCommand extends Command<CliContext> {
  static override paths = [['backup']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('backup', async () => {
      const options = parseBackupOptions(this.args);
      assertBackupFile(options.file);
      if (options.dryRun) {
        process.stdout.write(`${backupDryRunMessage(options)}\n`);
        return 0;
      }
      const result = await createBackupPacket(
        this.context.processes,
        options,
        readCopalibreVersion(),
      );
      process.stdout.write(`Backup packet written: ${result.file}\n`);
      if (result.pruned.length > 0) {
        process.stdout.write(`Pruned older packet(s): ${result.pruned.join(', ')}\n`);
      }
      return 0;
    });
  }
}
