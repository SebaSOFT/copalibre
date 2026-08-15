import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { formatRequiredSecrets, writeInstallationAssets } from '../init.js';

export class InitCommand extends Command<CliContext> {
  static override paths = [['init']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('init', async () => {
      const parsed = parseArgs({
        args: [...this.args],
        options: { 'module-dev': { type: 'boolean', default: false } },
        strict: true,
      });
      const result = await writeInstallationAssets(process.cwd(), {
        moduleDev: parsed.values['module-dev'],
      });
      const lines = [
        `Wrote ${result.composeFile}`,
        ...(result.moduleDevFile ? [`Wrote ${result.moduleDevFile}`] : []),
        `Wrote ${result.envFile}`,
        `Installation recorded: CopaLibre ${result.marker.version}, id ${result.marker.installId}`,
        '',
        `Required secrets:\n${formatRequiredSecrets()}`,
      ];
      process.stdout.write(`${lines.join('\n')}\n`);
      return 0;
    });
  }
}
