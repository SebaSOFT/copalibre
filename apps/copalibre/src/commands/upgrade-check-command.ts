import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { assertMarkerVersionCompatible, isContainer, requireComposeTarget } from '../compose-target.js';
import { runUpgradeCheck } from '../upgrade-check.js';

export class UpgradeCheckCommand extends Command<CliContext> {
  static override paths = [['upgrade-check']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('upgrade-check', async () => {
      const environment = this.context.env;
      const processes = this.context.processes;
      if (!isContainer(environment)) {
        await requireComposeTarget(environment);
        await assertMarkerVersionCompatible();
        return processes.run('docker', ['compose', 'run', '--rm', 'upgrade-check', ...this.args]);
      }
      const parsed = parseArgs({
        args: [...this.args],
        options: { 'target-version': { type: 'string' } },
        strict: true,
      });
      const targetVersion = parsed.values['target-version'];
      if (!targetVersion) throw new Error('--target-version is required');

      const report = await runUpgradeCheck(targetVersion, environment);
      for (const failure of report.moduleFailures) {
        process.stdout.write(`FAIL [${failure.stage}] ${failure.field ?? ''}: ${failure.message}\n`);
      }
      process.stdout.write(
        report.pendingMigrations.length === 0
          ? 'No pending migrations.\n'
          : `Pending migrations: ${report.pendingMigrations.join(', ')}\n`,
      );
      process.stdout.write(
        report.ok
          ? `upgrade-check: OK for target version ${targetVersion}\n`
          : `upgrade-check: FAILED for target version ${targetVersion}\n`,
      );
      return report.ok ? 0 : 1;
    });
  }
}
