import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { isContainer, requireComposeTarget } from '../compose-target.js';
import { runDoctor, type DoctorOptions } from '../doctor.js';

export class DoctorCommand extends Command<CliContext> {
  static override paths = [['doctor']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('doctor', async () => {
      const environment = this.context.env;
      if (!isContainer(environment)) {
        await requireComposeTarget(environment);
        return this.context.processes.run('docker', [
          'compose',
          'run',
          '--rm',
          'doctor',
          ...this.args,
        ]);
      }
      const parsed = parseArgs({
        args: [...this.args],
        options: {
          'check-proxy': { type: 'boolean', default: false },
          'proxy-url': { type: 'string' },
        },
        strict: true,
      });
      const options: DoctorOptions = {
        checkProxy: parsed.values['check-proxy'],
        proxyUrl: parsed.values['proxy-url'],
      };
      const report = await runDoctor(environment, undefined, options);
      for (const check of report.checks) {
        process.stdout.write(`${check.status.toUpperCase()} ${check.name}: ${check.message}\n`);
      }
      return report.ok ? 0 : 1;
    });
  }
}
