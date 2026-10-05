import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import {
  formatRequiredSecrets,
  repairInstallationAssets,
  writeInstallationAssets,
} from '../init.js';
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
          repair: { type: 'boolean', default: false },
          'skip-preflight': { type: 'boolean', default: false },
          'app-url': { type: 'string' },
          'api-url': { type: 'string' },
          disciplines: { type: 'string' },
          'email-provider': { type: 'string' },
          'email-from': { type: 'string' },
          'email-credential': { type: 'string' },
          'email-domain': { type: 'string' },
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
      let emailProvider = parseEmailProvider(parsed.values['email-provider']);
      let emailFrom = parsed.values['email-from'];
      let emailCredential = parsed.values['email-credential'];
      let emailDomain = parsed.values['email-domain'];

      const isInteractive = process.stdin.isTTY && !parsed.values['non-interactive'];
      const hasExistingInstallation = [
        'docker-compose.yml',
        '.env',
        'jwt-private.pem',
        'jwks.json',
        '.copalibre/installation.json',
      ].some((path) => existsSync(`${process.cwd()}/${path}`));
      if (parsed.values.repair || hasExistingInstallation) {
        if (!parsed.values.repair && !isInteractive) {
          throw new Error(
            'An existing CopaLibre installation was detected. Re-run with --repair to back up and inspect it safely.',
          );
        }
        if (isInteractive && !parsed.values.repair) {
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          let confirmed: string;
          try {
            confirmed = await rl.question(
              'An existing CopaLibre installation was detected. Back up, inspect and repair it? [y/N] ',
            );
          } finally {
            rl.close();
          }
          if (!/^y(es)?$/i.test(confirmed.trim())) {
            process.stdout.write('Repair cancelled; no files were changed.\n');
            return 0;
          }
        }
        const result = await repairInstallationAssets(process.cwd());
        process.stdout.write(
          [
            `Backups: ${result.backups.length ? result.backups.join(', ') : 'none (source files were absent)'}`,
            `Created or reconciled: ${result.createdAssets.length ? result.createdAssets.join(', ') : 'nothing'}`,
            result.preservedCompose ? 'Preserved docker-compose.yml without changes.' : '',
            ...(result.missingServices.length
              ? [
                  `WARNING: shipped Compose template includes services missing from this installation: ${result.missingServices.join(', ')}. Review and add the snippets below if required.`,
                  ...result.serviceSnippets.map((snippet) => `\n${snippet}`),
                ]
              : ['Compose service definitions match the shipped template.']),
          ]
            .filter(Boolean)
            .join('\n') + '\n',
        );
        return 0;
      }

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
          if (!emailProvider) {
            const enteredProvider = await rl.question(
              'Email delivery provider (smtp / resend / brevo / mailgun) [smtp]: ',
            );
            emailProvider = parseEmailProvider(enteredProvider.trim() || 'smtp');
          }
          if (!emailFrom) {
            const enteredFrom = await rl.question(
              'Email sender address [noreply@copalibre.local]: ',
            );
            emailFrom = enteredFrom.trim() || 'noreply@copalibre.local';
          }
          const credentialProvider = emailProvider ?? 'smtp';
          const credentialLabel =
            credentialProvider === 'smtp'
              ? 'SMTP connection URL [smtp://host.docker.internal:1025]: '
              : credentialProvider === 'mailgun'
                ? 'Mailgun API key: '
                : `${credentialProvider} API key: `;
          if (!emailCredential) {
            const enteredCredential = await rl.question(credentialLabel);
            emailCredential = enteredCredential.trim() || undefined;
            if (emailProvider === 'smtp' && !emailCredential) {
              emailCredential = 'smtp://host.docker.internal:1025';
            }
          }
          if (emailProvider === 'mailgun' && !emailDomain) {
            const enteredDomain = await rl.question('Mailgun domain: ');
            emailDomain = enteredDomain.trim() || undefined;
          }
        } finally {
          rl.close();
        }
      }

      validateEmailOptions(emailProvider, emailCredential, emailDomain);

      const result = await writeInstallationAssets(process.cwd(), {
        moduleDev: parsed.values['module-dev'],
        proxy: proxyChoice,
        appUrl,
        apiUrl,
        starterDisciplines,
        emailProvider,
        emailFrom,
        emailCredential,
        emailDomain,
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

function parseEmailProvider(
  value: string | undefined,
): 'smtp' | 'resend' | 'brevo' | 'mailgun' | undefined {
  if (value === undefined) return undefined;
  if (value === 'smtp' || value === 'resend' || value === 'brevo' || value === 'mailgun') {
    return value;
  }
  throw new Error('--email-provider must be one of: smtp, resend, brevo, mailgun');
}

function validateEmailOptions(
  provider: 'smtp' | 'resend' | 'brevo' | 'mailgun' | undefined,
  credential: string | undefined,
  domain: string | undefined,
): void {
  if (!provider) {
    if (credential || domain)
      throw new Error('--email-credential and --email-domain require --email-provider');
    return;
  }
  if (provider !== 'smtp' && !credential) {
    throw new Error(`--email-credential is required for the ${provider} provider`);
  }
  if (provider === 'mailgun' && !domain) {
    throw new Error('--email-domain is required for the mailgun provider');
  }
  if (provider !== 'mailgun' && domain) {
    throw new Error('--email-domain is only valid with --email-provider mailgun');
  }
}
