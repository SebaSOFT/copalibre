import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseEnv } from 'node:util';
import {
  CONFIGURABLE_SETTINGS,
  configurableSetting,
  type ConfigurableSetting,
  type SettingContext,
  type SettingFlags,
} from './configurable-settings.js';
import { validateHostEnvironment, type DoctorReport } from './doctor.js';
import { updateEnvFile } from './env-file.js';
import { runPreflight, type PreflightReport } from './preflight.js';
import type { ProcessRunner } from './process-runner.js';
import { createPrompts, type Prompts } from './prompts.js';

/**
 * Doctor as it runs from the installation directory on the host: the `.env` checks, the settings it
 * can configure, the Docker preflight, then the doctor service inside the Compose network.
 * `copalibre upgrade` ends with it, so an upgraded installation is offered the same fixes.
 */

export interface HostDoctorOptions {
  readonly cwd?: string;
  /** Whether to ask; by default when both standard input and output are a terminal. */
  readonly interactive?: boolean;
  readonly prompts?: () => Prompts;
  readonly preflight?: () => Promise<PreflightReport>;
  readonly write?: (text: string) => void;
}

/** The host's own options, taken out of the arguments; the rest go to the doctor service. */
export interface HostDoctorArguments {
  readonly configure: readonly string[];
  readonly flags: SettingFlags;
  readonly nonInteractive: boolean;
  readonly forward: readonly string[];
}

const VALUE_OPTIONS: Readonly<Record<string, keyof SettingFlags | 'configure'>> = {
  '--configure': 'configure',
  '--email-provider': 'emailProvider',
  '--email-credential': 'emailCredential',
  '--email-from': 'emailFrom',
  '--email-domain': 'emailDomain',
  '--email-region': 'emailRegion',
  '--app-url': 'appUrl',
};

export function parseHostDoctorArguments(arguments_: readonly string[]): HostDoctorArguments {
  const configure: string[] = [];
  const flags: Record<string, string> = {};
  const forward: string[] = [];
  let nonInteractive = false;
  const rest = [...arguments_];
  for (let argument = rest.shift(); argument !== undefined; argument = rest.shift()) {
    const [name, inline] = argument.startsWith('--') ? splitOption(argument) : [argument];
    const target = VALUE_OPTIONS[name];
    if (name === '--non-interactive') {
      nonInteractive = true;
    } else if (target) {
      const value = inline ?? rest.shift();
      if (value === undefined || (inline === undefined && value.startsWith('--'))) {
        throw new Error(`${name} needs a value`);
      }
      if (target === 'configure') configure.push(value);
      else flags[target] = value;
    } else {
      forward.push(argument);
    }
  }
  if (Object.keys(flags).length > 0 && configure.length === 0) {
    throw new Error(
      'Setting flags apply with --configure <setting>; for example --configure email',
    );
  }
  return { configure, flags, nonInteractive, forward };
}

function splitOption(argument: string): [string, string?] {
  const equals = argument.indexOf('=');
  return equals === -1 ? [argument] : [argument.slice(0, equals), argument.slice(equals + 1)];
}

export function dockerComposeDoctorRunArgs(arguments_: readonly string[]): readonly string[] {
  return ['compose', 'run', '--pull', 'missing', '--rm', 'doctor', ...arguments_];
}

export async function runHostDoctor(
  processes: ProcessRunner,
  arguments_: readonly string[] = [],
  options: HostDoctorOptions = {},
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const write = options.write ?? ((text: string) => void process.stdout.write(text));
  const parsed = parseHostDoctorArguments(arguments_);
  const envPath = join(cwd, '.env');
  const context: SettingContext = {
    sourceCheckout: existsSync(join(cwd, 'apps', 'copalibre', 'package.json')),
  };

  const initial = await readEnvironment(envPath, write);
  if (!initial) return 1;
  let environment: NodeJS.ProcessEnv = initial;

  if (parsed.configure.length > 0) {
    const settings = parsed.configure.map(configurableSetting);
    const updates = Object.assign(
      {},
      ...settings.map((setting) => setting.fromFlags(parsed.flags, environment)),
    ) as Record<string, string>;
    if (await applyUpdates(envPath, updates, write)) {
      write(
        `Restart the services that read them: docker compose up --detach --wait ${servicesOf(settings).join(' ')}\n`,
      );
    }
    environment = (await readEnvironment(envPath, write)) ?? environment;
  }

  let report = printReport(validateHostEnvironment(environment, context), write);
  const pending = CONFIGURABLE_SETTINGS.filter((setting) => setting.detect(environment, context));
  const interactive =
    !parsed.nonInteractive &&
    parsed.configure.length === 0 &&
    (options.interactive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true));

  if (pending.length > 0 && interactive) {
    const prompts = (options.prompts ?? createPrompts)();
    try {
      const configured = await configureInteractively(
        prompts,
        pending,
        environment,
        envPath,
        write,
      );
      if (configured.length > 0) {
        if (configured.some((setting) => setting.id === 'email')) {
          await offerTestEmail(prompts, processes, write);
        }
        await offerRestart(prompts, processes, servicesOf(configured), write);
        environment = (await readEnvironment(envPath, write)) ?? environment;
        write('\nAfter the changes:\n');
        report = printReport(validateHostEnvironment(environment, context), write);
      }
    } finally {
      prompts.close();
    }
  } else if (pending.length > 0) {
    for (const setting of pending) {
      write(`To configure ${setting.id} without questions: ${setting.flags}\n`);
    }
  }
  if (!report.ok) return 1;

  const preflight = await (options.preflight ?? (() => runPreflight()))();
  const socketFailure = preflight.checks.find(
    (check) => check.name === 'preflight:docker-socket' && check.status === 'fail',
  );
  if (socketFailure) {
    write(
      `FAIL ${socketFailure.name}: ${socketFailure.message}\n` +
        `Actionable remediation: ${socketFailure.remediation}\n`,
    );
    return 1;
  }
  return processes.run('docker', dockerComposeDoctorRunArgs(parsed.forward));
}

async function readEnvironment(
  path: string,
  write: (text: string) => void,
): Promise<NodeJS.ProcessEnv | undefined> {
  try {
    return parseEnv(await readFile(path, 'utf8'));
  } catch (error) {
    const detail =
      (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? '.env is missing; run "copalibre init" in this directory'
        : `could not read .env: ${(error as Error).message}`;
    write(`FAIL host-env: ${detail}\n`);
    return undefined;
  }
}

function printReport(report: DoctorReport, write: (text: string) => void): DoctorReport {
  for (const check of report.checks) {
    write(`${check.status.toUpperCase()} ${check.name}: ${check.message}\n`);
  }
  return report;
}

function servicesOf(settings: readonly ConfigurableSetting[]): string[] {
  return [...new Set(settings.flatMap((setting) => setting.services))];
}

/** Writes `updates` and says which keys changed, never their values; false when none did. */
async function applyUpdates(
  path: string,
  updates: Record<string, string>,
  write: (text: string) => void,
): Promise<boolean> {
  const { changed, backup } = await updateEnvFile(path, updates);
  write(
    changed.length === 0
      ? '.env already held these values; nothing changed.\n'
      : `Updated .env: ${changed.join(', ')} (the previous file is ${basename(backup ?? '')})\n`,
  );
  return changed.length > 0;
}

async function configureInteractively(
  prompts: Prompts,
  pending: readonly ConfigurableSetting[],
  environment: NodeJS.ProcessEnv,
  envPath: string,
  write: (text: string) => void,
): Promise<ConfigurableSetting[]> {
  const configured: ConfigurableSetting[] = [];
  const updates: Record<string, string> = {};
  for (const setting of pending) {
    write('\n');
    if (!(await prompts.confirm(setting.offer))) {
      write(`Left ${setting.id} as it is. Later: ${setting.flags}\n`);
      continue;
    }
    Object.assign(updates, await setting.configure(prompts, environment));
    configured.push(setting);
  }
  if (configured.length > 0) {
    write('\n');
    await applyUpdates(envPath, updates, write);
  }
  return configured;
}

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function offerTestEmail(
  prompts: Prompts,
  processes: ProcessRunner,
  write: (text: string) => void,
): Promise<void> {
  if (!(await prompts.confirm('Send a test email now?'))) {
    write('Later: copalibre doctor --send-test-email <address>\n');
    return;
  }
  const address = await prompts.text('Send it to', {
    validate: (value) => (EMAIL_ADDRESS.test(value) ? undefined : 'Type an email address.'),
  });
  // Sent by the doctor service, inside the Compose network and with the worker's own code.
  await processes.run('docker', dockerComposeDoctorRunArgs(['--send-test-email', address]));
}

async function offerRestart(
  prompts: Prompts,
  processes: ProcessRunner,
  services: readonly string[],
  write: (text: string) => void,
): Promise<void> {
  const running = processes.capture
    ? await processes.capture('docker', ['compose', 'ps', '--services', '--status', 'running'])
    : undefined;
  const restart =
    running && running.code === 0
      ? services.filter((service) => running.stdout.split('\n').includes(service))
      : [...services];
  if (restart.length === 0) {
    write('The stack is not running; the new settings apply when it starts.\n');
    return;
  }
  const command = ['compose', 'up', '--detach', '--wait', ...restart];
  if (!(await prompts.confirm(`Restart ${restart.join(', ')} so they read the new settings?`))) {
    write(`Later: docker ${command.join(' ')}\n`);
    return;
  }
  const code = await processes.run('docker', command);
  if (code !== 0) write(`The restart failed (exit ${code}); run: docker ${command.join(' ')}\n`);
}
