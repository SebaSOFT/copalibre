import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { Command, Option } from 'clipanion';
import { createDatabase, databaseConfigFromEnv } from '@copalibre/persistence';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { isContainer, refuseForKubernetesMode, requireComposeTarget } from '../compose-target.js';
import { runDoctor, validateHostEnvironment, type DoctorOptions } from '../doctor.js';
import { runPreflight } from '../preflight.js';
import { probeDataIntegrity } from '../doctor-data-probe.js';
import {
  createPrompter,
  createRepairActions,
  runInteractiveRepair,
} from '../doctor-data-repair.js';

export function dockerComposeDoctorRunArgs(arguments_: readonly string[]): readonly string[] {
  return ['compose', 'run', '--pull', 'never', '--rm', 'doctor', ...arguments_];
}

export class DoctorCommand extends Command<CliContext> {
  static override paths = [['doctor']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('doctor', async () => {
      const environment = this.context.env;
      if (!isContainer(environment)) {
        await refuseForKubernetesMode(
          'run job-doctor.yaml instead (helm install --set doctor.enabled=true, or equivalent)',
        );
        await requireComposeTarget(environment);
        let envContent: string;
        try {
          envContent = await readFile(join(process.cwd(), '.env'), 'utf8');
        } catch (error) {
          const detail =
            (error as NodeJS.ErrnoException).code === 'ENOENT'
              ? '.env is missing; run "copalibre init" in this directory'
              : `could not read .env: ${(error as Error).message}`;
          process.stdout.write(`FAIL host-env: ${detail}\n`);
          return 1;
        }
        const hostEnvReport = validateHostEnvironment(parseEnv(envContent));
        for (const check of hostEnvReport.checks) {
          process.stdout.write(`${check.status.toUpperCase()} ${check.name}: ${check.message}\n`);
        }
        if (!hostEnvReport.ok) return 1;

        const preflight = await runPreflight();
        const socketFailure = preflight.checks.find(
          (c) => c.name === 'preflight:docker-socket' && c.status === 'fail',
        );
        if (socketFailure) {
          process.stderr.write(
            `FAIL ${socketFailure.name}: ${socketFailure.message}\n` +
              `Actionable remediation: ${socketFailure.remediation}\n`,
          );
          return 1;
        }
        return this.context.processes.run('docker', dockerComposeDoctorRunArgs(this.args));
      }
      const parsed = parseArgs({
        args: [...this.args],
        options: {
          'check-proxy': { type: 'boolean', default: false },
          'proxy-url': { type: 'string' },
          smoke: { type: 'boolean', default: false },
          fix: { type: 'boolean', default: false },
          interactive: { type: 'boolean', default: false },
        },
        strict: true,
      });
      const options: DoctorOptions = {
        checkProxy: parsed.values['check-proxy'],
        proxyUrl: parsed.values['proxy-url'],
        smoke: parsed.values.smoke,
      };
      const report = await runDoctor(environment, undefined, options);
      for (const check of report.checks) {
        process.stdout.write(`${check.status.toUpperCase()} ${check.name}: ${check.message}\n`);
      }

      const shouldRepair = parsed.values.fix || parsed.values.interactive;
      if (shouldRepair) {
        await this.repairDataIntegrity(environment);
      }

      return report.ok ? 0 : 1;
    });
  }

  /**
   * `--fix`/`--interactive`: re-probes the database (the report above is
   * read-only) and walks any fixable anomaly through the decision-support
   * prompt (design.md Decision 2). Never affects the exit code above —
   * repair is an operator-initiated action, not a readiness gate.
   */
  private async repairDataIntegrity(environment: NodeJS.ProcessEnv): Promise<void> {
    if (!environment.DATABASE_URL) return;
    const database = createDatabase(databaseConfigFromEnv(environment));
    const prompter = createPrompter();
    try {
      const snapshot = await probeDataIntegrity(database);
      await runInteractiveRepair(snapshot, prompter, createRepairActions(database));
    } finally {
      prompter.close();
      await database.destroy();
    }
  }
}
