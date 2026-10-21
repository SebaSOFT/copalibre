import { parseArgs } from 'node:util';
import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';

export class DevCommand extends Command<CliContext> {
  static override paths = [['dev']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('dev', async () => {
      const parsed = parseArgs({
        args: [...this.args],
        options: { hybrid: { type: 'boolean', default: false } },
        strict: true,
      });
      const processes = this.context.processes;
      const environment = this.context.env;
      if (parsed.values.hybrid) {
        const infrastructure = await processes.run('docker', [
          'compose',
          '-f',
          'docker-compose.dev.yml',
          '--profile',
          'infrastructure',
          'up',
          '--detach',
          '--wait',
        ]);
        if (infrastructure !== 0) return infrastructure;
        const hybrid = hybridEnvironment(environment);
        const migration = await processes.run(
          'yarn',
          ['workspace', '@copalibre/migrate', 'run', 'start'],
          hybrid,
        );
        if (migration !== 0) return migration;
        const supervised = processes.runSupervised;
        if (supervised) {
          const roles = ['api', 'events', 'worker', 'scheduler', 'web'] as const;
          return supervised.call(
            processes,
            roles.map((role) => ({
              role,
              command: 'yarn',
              arguments: [
                'workspace',
                `@copalibre/${role}`,
                'run',
                'dev',
                ...(role === 'web' ? ['--ignore-lock', '--host', '0.0.0.0', '--port', '4321'] : []),
              ],
            })),
            { ...hybrid, COPALIBRE_DEV_HYBRID: 'true' },
          );
        }
        return processes.run(
          'yarn',
          [
            'workspaces',
            'foreach',
            '--all',
            '--parallel',
            '--interlaced',
            '--include',
            '@copalibre/api',
            '--include',
            '@copalibre/events',
            '--include',
            '@copalibre/worker',
            '--include',
            '@copalibre/scheduler',
            '--include',
            '@copalibre/web',
            'run',
            'dev',
          ],
          hybrid,
        );
      }
      return processes.run('docker', [
        'compose',
        '-f',
        'docker-compose.dev.yml',
        '--profile',
        'containerized',
        'up',
        '--watch',
      ]);
    });
  }
}

/** The host-side environment for the dev infrastructure, defaulting every value to the dev Compose profile's own. */
export function hybridEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const apiUrl = environment.COPALIBRE_API_URL ?? 'http://localhost:3001';
  const nativeIssuer = environment.COPALIBRE_NATIVE_JWT_ISSUER ?? 'http://localhost:8080';
  return {
    ...environment,
    DATABASE_URL:
      environment.DATABASE_URL ??
      'postgres://copalibre:copalibre_dev_only@localhost:5432/copalibre',
    COPALIBRE_APP_URL: environment.COPALIBRE_APP_URL ?? 'http://localhost:4321',
    COPALIBRE_API_URL: apiUrl,
    COPALIBRE_BOOTSTRAP_TOKEN:
      environment.COPALIBRE_BOOTSTRAP_TOKEN ?? 'copalibre_dev_bootstrap_only',
    COPALIBRE_JWKS_URI: environment.COPALIBRE_JWKS_URI ?? `${apiUrl}/.well-known/jwks.json`,
    COPALIBRE_JWT_ISSUER: environment.COPALIBRE_JWT_ISSUER ?? nativeIssuer,
    COPALIBRE_NATIVE_JWT_ISSUER: nativeIssuer,
    COPALIBRE_JWT_AUDIENCE: environment.COPALIBRE_JWT_AUDIENCE ?? 'copalibre',
    COPALIBRE_OIDC_CLIENT_ID: environment.COPALIBRE_OIDC_CLIENT_ID ?? 'copalibre-dev',
    COPALIBRE_EMAIL_PROVIDER: environment.COPALIBRE_EMAIL_PROVIDER ?? 'smtp',
    COPALIBRE_DEV_HYBRID: environment.COPALIBRE_DEV_HYBRID ?? 'true',
    // Astro detects agent shells and daemonizes by default. This sentinel
    // disables that behavior so the process supervisor owns the web server.
    ASTRO_DEV_BACKGROUND: '0',
    COPALIBRE_EMAIL_FROM: environment.COPALIBRE_EMAIL_FROM ?? 'dev@copalibre.invalid',
    COPALIBRE_SMTP_URL: environment.COPALIBRE_SMTP_URL ?? 'smtp://localhost:1025',
  };
}
