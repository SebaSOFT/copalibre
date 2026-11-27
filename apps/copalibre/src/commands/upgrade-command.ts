import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { readCopalibreVersion } from '../banner.js';
import { runCommand } from '../command-support.js';
import { isContainer, refuseForKubernetesMode, requireComposeTarget } from '../compose-target.js';
import { reconcileInstallationDirectory } from '../compose-reconciler.js';
import { GENERATED_DATABASE_SECRETS, readAsset } from '../init.js';
import {
  describePlan,
  surveyInstallation,
  type InstallationSurvey,
} from '../installation-survey.js';
import { upgradeInstallation } from '../installation-upgrade.js';
import type { ProcessRunner } from '../process-runner.js';
import { runHostDoctor } from './doctor-command.js';
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
          'keep-old-volume': { type: 'boolean', default: false },
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

        if (!isContainer(environment) && existsSync('docker-compose.yml')) {
          const survey = await surveyHere(processes, environment, targetVersion);
          process.stdout.write('What "copalibre upgrade" would do here:\n');
          for (const line of describePlan(survey, targetVersion)) {
            process.stdout.write(`- ${line}\n`);
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

      // 2. Binary Self-Update. A new binary carries the new release's files and steps, so it runs the
      // rest of the upgrade itself: an old binary going on would apply its own, older, steps.
      if (!parsed.values['skip-self-update']) {
        try {
          const selfResult = await performSelfUpdate({
            targetVersion,
            currentVersion,
          });
          if (selfResult.updated && selfResult.binaryPath) {
            process.stdout.write(
              `CLI binary updated to v${selfResult.newVersion}; it continues the upgrade.\n`,
            );
            return processes.run(selfResult.binaryPath, [
              'upgrade',
              ...this.args.filter((argument) => argument !== '--skip-self-update'),
              '--skip-self-update',
              '--yes',
            ]);
          }
        } catch (error) {
          process.stderr.write(`Notice: CLI self-update bypassed: ${(error as Error).message}\n`);
        }
      }

      const filesOnly = parsed.values['skip-services'] || isContainer(environment);
      const status = filesOnly
        ? await reconcileFilesOnly(processes, environment, targetVersion)
        : await upgradeServices(processes, environment, currentVersion, targetVersion, {
            keepOldVolume: parsed.values['keep-old-volume'],
            fromVersion: stackVersion ?? currentVersion,
          });
      if (status !== 0) return status;

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

/** This release's own copy of a shipped file; `COPALIBRE_ASSETS_DIR` points elsewhere when running from source. */
async function shippedAsset(name: string, environment: NodeJS.ProcessEnv): Promise<string> {
  return readAsset(name, environment.COPALIBRE_ASSETS_DIR?.trim() || undefined);
}

async function surveyHere(
  processes: ProcessRunner,
  environment: NodeJS.ProcessEnv,
  targetVersion: string,
): Promise<InstallationSurvey> {
  return surveyInstallation({
    cwd: process.cwd(),
    processes,
    environment,
    targetVersion,
    shippedCompose: await shippedAsset('docker-compose.yml', environment),
    shippedCaddyfile: await shippedAsset('Caddyfile', environment),
  });
}

/**
 * Inside a container, or with `--skip-services`: only `.env`, the image tags and the marker change.
 * Outside a container that is refused when the database must move first, because the next start
 * would otherwise find the new release's files over the old database.
 */
async function reconcileFilesOnly(
  processes: ProcessRunner,
  environment: NodeJS.ProcessEnv,
  targetVersion: string,
): Promise<number> {
  if (!isContainer(environment)) {
    const survey = await surveyHere(processes, environment, targetVersion);
    if (survey.legacyPostgres || survey.composeOrigin.kind === 'released') {
      process.stderr.write(
        'This installation needs its Compose file replaced and its database moved, which --skip-services cannot do. ' +
          'Run "copalibre upgrade" without --skip-services.\n',
      );
      return 1;
    }
  }
  const reconcileResult = await reconcileInstallationDirectory(process.cwd(), targetVersion);
  if (reconcileResult.envUpdated || reconcileResult.composeUpdated) {
    process.stdout.write(`Reconciled configuration files for CopaLibre v${targetVersion}.\n`);
  }
  const addedDatabaseSecrets = reconcileResult.addedEnvKeys.filter((key) =>
    (GENERATED_DATABASE_SECRETS as readonly string[]).includes(key),
  );
  if (addedDatabaseSecrets.length > 0) {
    process.stdout.write(
      `Added ${addedDatabaseSecrets.join(' and ')} to .env, with new random values: the passwords of the database's schema owner and runtime role.\n`,
    );
  }
  return 0;
}

async function upgradeServices(
  processes: ProcessRunner,
  environment: NodeJS.ProcessEnv,
  currentVersion: string,
  targetVersion: string,
  options: { readonly keepOldVolume: boolean; readonly fromVersion: string },
): Promise<number> {
  if (targetVersion !== currentVersion) {
    process.stdout.write(
      `Notice: this CLI is v${currentVersion} and installs its own release's files with v${targetVersion}'s images.\n`,
    );
  }
  const survey = await surveyHere(processes, environment, targetVersion);
  // A marker an older CLI already moved to the target says nothing about the files; the release
  // that shipped the Compose file does.
  const fromVersion =
    survey.composeOrigin.kind === 'released'
      ? (survey.composeOrigin.versions.at(-1) ?? options.fromVersion)
      : options.fromVersion;
  return upgradeInstallation({
    cwd: process.cwd(),
    processes,
    environment,
    survey,
    fromVersion,
    targetVersion,
    shippedCaddyfile: await shippedAsset('Caddyfile', environment),
    keepOldVolume: options.keepOldVolume,
    runDoctor: () => runHostDoctor(processes),
    io: {
      out: (text) => process.stdout.write(text),
      err: (text) => process.stderr.write(text),
    },
  });
}
