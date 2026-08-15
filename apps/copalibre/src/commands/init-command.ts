import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { formatRequiredSecrets, writeInstallationAssets } from '../init.js';
import { writeKubernetesInstallationAssets } from '../kubernetes-init.js';

const DEFAULT_KUBERNETES_NAMESPACE = 'default';
const DEFAULT_KUBERNETES_RELEASE = 'copalibre';

export class InitCommand extends Command<CliContext> {
  static override paths = [['init']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('init', async () => {
      const parsed = parseArgs({
        args: [...this.args],
        options: {
          'module-dev': { type: 'boolean', default: false },
          kubernetes: { type: 'boolean', default: false },
          namespace: { type: 'string' },
          release: { type: 'string' },
          context: { type: 'string' },
        },
        strict: true,
      });

      if (parsed.values.kubernetes) {
        const result = await writeKubernetesInstallationAssets(process.cwd(), {
          namespace: parsed.values.namespace ?? DEFAULT_KUBERNETES_NAMESPACE,
          release: parsed.values.release ?? DEFAULT_KUBERNETES_RELEASE,
          ...(parsed.values.context === undefined ? {} : { context: parsed.values.context }),
        });
        process.stdout.write(
          `${[
            `Wrote ${result.valuesFile}`,
            `Installation recorded: CopaLibre ${result.marker.version}, id ${result.marker.installId}`,
            `Release "${result.marker.release}" in namespace "${result.marker.namespace}"` +
              (result.marker.context ? `, context "${result.marker.context}"` : ''),
          ].join('\n')}\n`,
        );
        return 0;
      }

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
