import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { readCopalibreVersion } from '../banner.js';
import { runCommand } from '../command-support.js';
import { isContainer, refuseForKubernetesMode, requireComposeTarget } from '../compose-target.js';
import { reconcileInstallationDirectory } from '../compose-reconciler.js';
import { readInstallationMarker } from '../installation-marker.js';
import { formatOutdatedModules, runModuleUpgradeCheck } from '../module-upgrade-check.js';
import { fetchReleaseMetadata, performSelfUpdate } from '../self-update.js';
import { runUpgradeCheck } from '../upgrade-check.js';

export class UpgradeCommand extends Command<CliContext> {
  static override paths = [['upgrade']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('upgrade', async () => {
      const environment = this.context.env;
      const processes = this.context.processes;
      const currentVersion = readCopalibreVersion();

      const parsed = parseArgs({
        args: [...this.args],
        options: {
          check: { type: 'boolean', default: false },
          'target-version': { type: 'string' },
          self: { type: 'boolean', default: false },
          yes: { type: 'boolean', short: 'y', default: false },
          'skip-self-update': { type: 'boolean', default: false },
          'skip-services': { type: 'boolean', default: false },
          'skip-modules': { type: 'boolean', default: false },
        },
        strict: true,
      });

      const isCheckMode = parsed.values.check;
      const onlySelf = parsed.values.self;
      let targetVersion = parsed.values['target-version'];

      // Discover target version if not specified
      if (!targetVersion) {
        try {
          const repo = environment.COPALIBRE_GITHUB_REPO ?? 'SebaSOFT/copalibre';
          const release = await fetchReleaseMetadata(repo, undefined);
          targetVersion = release.tag_name.replace(/^v/, '');
        } catch {
          targetVersion = currentVersion;
        }
      } else {
        targetVersion = targetVersion.replace(/^v/, '');
      }

      const marker = await readInstallationMarker(process.cwd());
      const stackVersion = marker?.version;

      if (isCheckMode) {
        process.stdout.write(`Current CopaLibre version: v${currentVersion}\n`);
        if (stackVersion) {
          process.stdout.write(`Installed stack version: v${stackVersion}\n`);
        }
        process.stdout.write(`Target / Latest available version: v${targetVersion}\n`);

        const cliUpToDate = currentVersion === targetVersion;
        const stackUpToDate = !stackVersion || stackVersion === targetVersion;

        if (cliUpToDate && stackUpToDate) {
          process.stdout.write('CopaLibre is up to date.\n');
        } else {
          if (!cliUpToDate) {
            process.stdout.write(
              `CLI binary upgrade available: v${currentVersion} -> v${targetVersion}\n`,
            );
          }
          if (!stackUpToDate) {
            process.stdout.write(
              `Platform stack upgrade available: v${stackVersion} -> v${targetVersion}\n`,
            );
          }
        }

        try {
          const outdated = await runModuleUpgradeCheck(environment);
          process.stdout.write(formatOutdatedModules(outdated));
        } catch {
          // Database not accessible in check mode; non-blocking
        }
        return 0;
      }

      // Self-update CLI binary only
      if (onlySelf) {
        const result = await performSelfUpdate({
          targetVersion,
          currentVersion,
        });
        if (result.skipped) {
          process.stdout.write(`CLI self-update: ${result.reason}\n`);
        } else if (result.updated) {
          process.stdout.write(`Updated CopaLibre CLI binary to v${result.newVersion}\n`);
        }
        return 0;
      }

      if (!isContainer(environment)) {
        await refuseForKubernetesMode('helm upgrade copalibre deploy/helm/copalibre');
        await requireComposeTarget(environment);
      }

      // Interactive confirmation if running in interactive terminal
      if (!parsed.values.yes && process.stdin.isTTY) {
        if (stackVersion && stackVersion !== currentVersion) {
          process.stdout.write(
            `Notice: CLI binary (v${currentVersion}) and installed stack (v${stackVersion}) differ.\n`,
          );
        }
        const readline = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        try {
          const answer = await readline.question(
            `Upgrade CopaLibre installation to v${targetVersion}? [y/N] `,
          );
          if (answer.trim().toLowerCase() !== 'y') {
            process.stdout.write('Upgrade cancelled.\n');
            return 0;
          }
        } finally {
          readline.close();
        }
      }

      // 1. Compatibility Check
      try {
        const report = await runUpgradeCheck(targetVersion, environment);
        if (!report.ok) {
          process.stderr.write(
            `Upgrade aborted: ${report.moduleFailures.length} installed module(s) are incompatible with target version v${targetVersion}.\n`,
          );
          for (const failure of report.moduleFailures) {
            process.stderr.write(`  - ${failure.field}: ${failure.message}\n`);
          }
          return 1;
        }
        if (report.pendingMigrations.length > 0) {
          process.stdout.write(
            `Pending migrations detected: ${report.pendingMigrations.join(', ')}\n`,
          );
        }
      } catch {
        // If database connection not available yet, proceed with compose/container upgrade
      }

      // 2. Binary Self-Update
      if (!parsed.values['skip-self-update']) {
        try {
          const selfResult = await performSelfUpdate({
            targetVersion,
            currentVersion,
          });
          if (selfResult.updated) {
            process.stdout.write(`CLI binary updated to v${selfResult.newVersion}.\n`);
          }
        } catch (error) {
          process.stderr.write(`Notice: CLI self-update bypassed: ${(error as Error).message}\n`);
        }
      }

      // 3. Compose & Environment Reconciliation
      const reconcileResult = await reconcileInstallationDirectory(process.cwd(), targetVersion);
      if (reconcileResult.envUpdated || reconcileResult.composeUpdated) {
        process.stdout.write(`Reconciled configuration files for CopaLibre v${targetVersion}.\n`);
      }

      // 4. Docker Images & Service Refresh
      if (!parsed.values['skip-services'] && !isContainer(environment)) {
        process.stdout.write('Pulling updated container images...\n');
        await processes.run('docker', ['compose', 'pull']);

        process.stdout.write('Applying database schema migrations...\n');
        await processes.run('docker', ['compose', 'run', '--rm', 'migrate']);

        process.stdout.write('Restarting CopaLibre stack...\n');
        await processes.run('docker', ['compose', 'up', '-d']);
      }

      // 5. Module Update Inspection
      if (!parsed.values['skip-modules']) {
        try {
          const outdated = await runModuleUpgradeCheck(environment);
          process.stdout.write(formatOutdatedModules(outdated));
        } catch {
          // Non-blocking
        }
      }

      process.stdout.write(`CopaLibre upgrade to v${targetVersion} completed successfully.\n`);
      return 0;
    });
  }
}
