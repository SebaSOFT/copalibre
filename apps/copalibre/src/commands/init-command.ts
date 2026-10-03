import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { formatRequiredSecrets, writeInstallationAssets } from '../init.js';
import { writeKubernetesInstallationAssets } from '../kubernetes-init.js';
import { formatPreflightReport, runPreflight } from '../preflight.js';

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
          proxy: { type: 'string' },
          'non-interactive': { type: 'boolean', default: false },
          'skip-preflight': { type: 'boolean', default: false },
          'app-url': { type: 'string' },
          'api-url': { type: 'string' },
          disciplines: { type: 'string' },
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

      if (!parsed.values['skip-preflight']) {
        const preflight = await runPreflight();
        if (!preflight.ok) {
          process.stderr.write(formatPreflightReport(preflight) + '\n');
        }
      }

      let appUrl = parsed.values['app-url'];
      let apiUrl = parsed.values['api-url'];
      let starterDisciplines: string[] | undefined = parsed.values.disciplines
        ? parsed.values.disciplines
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      let proxyChoice = parsed.values.proxy;

      const isInteractive = process.stdin.isTTY && !parsed.values['non-interactive'];
      if (isInteractive) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          if (!appUrl) {
            const enteredAppUrl = await rl.question(
              'Public application URL [http://localhost:8080]: ',
            );
            appUrl = enteredAppUrl.trim() || 'http://localhost:8080';
          }
          if (!apiUrl) {
            const enteredApiUrl = await rl.question(`Public API URL [${appUrl}]: `);
            apiUrl = enteredApiUrl.trim() || appUrl;
          }
          if (!starterDisciplines) {
            const enteredDisciplines = await rl.question(
              'Starter sport disciplines to provision [football, tennis]: ',
            );
            starterDisciplines = enteredDisciplines.trim()
              ? enteredDisciplines
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : ['football', 'tennis'];
          }
          if (!proxyChoice) {
            const enteredProxy = await rl.question(
              'Export reverse proxy template? (nginx / none) [none]: ',
            );
            const val = enteredProxy.trim().toLowerCase();
            if (val === 'nginx') {
              proxyChoice = 'nginx';
            }
          }
        } finally {
          rl.close();
        }
      }

      const result = await writeInstallationAssets(process.cwd(), {
        moduleDev: parsed.values['module-dev'],
        proxy: proxyChoice,
        appUrl,
        apiUrl,
        starterDisciplines,
      });

      const lines = [
        `Wrote ${result.composeFile}`,
        ...(result.moduleDevFile ? [`Wrote ${result.moduleDevFile}`] : []),
        `Wrote ${result.envFile}`,
        ...(result.proxyConfigFile ? [`Wrote ${result.proxyConfigFile}`] : []),
        `Scaffolded local ./modules directory (disciplines and profiles)`,
        `Installation recorded: CopaLibre ${result.marker.version}, id ${result.marker.installId}`,
        '',
        `Required secrets:\n${formatRequiredSecrets()}`,
      ];
      process.stdout.write(`${lines.join('\n')}\n`);

      if (result.proxyConfigFile) {
        const proxyConfigContent = await readFile(result.proxyConfigFile, 'utf8');
        process.stdout.write(
          `\n--- Suggested Reverse Proxy Configuration (${result.proxyConfigFile}) ---\n${proxyConfigContent}\n` +
            `Ensure your proxy sets proxy_buffering off for /events/ and client_max_body_size >= 50M.\n`,
        );
      } else {
        process.stdout.write(
          `\nTip: If using an external reverse proxy (e.g. Nginx), export a turnkey configuration with:\n` +
            `  copalibre init --proxy nginx\n` +
            `Ensure /events/ disables buffering (proxy_buffering off) and client_max_body_size allows backup/media uploads (>= 50M).\n`,
        );
      }

      return 0;
    });
  }
}
