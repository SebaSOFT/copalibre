import { Inject, Injectable } from '@nestjs/common';
import { parseArgs } from 'node:util';
import {
  assertBackupFile,
  backupDryRunMessage,
  parseBackupOptions,
  parseRestoreOptions,
  restoreDryRunMessage,
} from './backup.js';
import { createBackupPacket, restoreBackupPacket } from './backup-packet.js';
import { readCopalibreVersion, renderBanner } from './banner.js';
import { createInitialAdministrator, parseCreateAdminArguments } from './create-admin.js';
import { runDoctor, type DoctorOptions } from './doctor.js';
import {
  COMMAND_HELP,
  MODULE_SUBCOMMAND_HELP,
  renderCommandHelp,
  renderModuleHelp,
  renderTopLevelHelp,
} from './help-text.js';
import { formatRequiredSecrets, writeLocalDefaults } from './init.js';
import { startMcpServer } from './mcp/server.js';
import { moduleAdd, moduleList, moduleRemove, moduleVerify } from './module-commands.js';
import type { ProcessRunner } from './process-runner.js';
import { PROCESS_RUNNER } from './tokens.js';
import { runUpgradeCheck } from './upgrade-check.js';

const HELP_FLAGS = new Set(['--help', '-h']);

@Injectable()
export class CliRunner {
  constructor(@Inject(PROCESS_RUNNER) private readonly processes: ProcessRunner) {}

  async run(
    arguments_: readonly string[],
    environment: NodeJS.ProcessEnv = process.env,
  ): Promise<number> {
    // Unconditional, first statement (task 2.1): every invocation — including
    // --help/-h and an unknown command — discloses identity, version and
    // license before any subcommand output. stderr, never stdout, so a
    // script piping a subcommand's stdout never has to filter this out.
    process.stderr.write(renderBanner());
    const command = arguments_[0];
    if (!command || HELP_FLAGS.has(command)) {
      process.stdout.write(renderTopLevelHelp());
      return 0;
    }
    // Help is intercepted before any command body runs (task 1.2): a help
    // request must never reach a command's own `parseArgs` call (which would
    // reject an unrecognized flag) or any of its real side effects.
    if (command === 'module') {
      const moduleHelp = this.moduleHelpFor(arguments_.slice(1));
      if (moduleHelp !== undefined) {
        process.stdout.write(moduleHelp);
        return 0;
      }
    } else if (
      HELP_FLAGS.has(arguments_[1] ?? '') &&
      COMMAND_HELP.some((candidate) => candidate.name === command)
    ) {
      process.stdout.write(renderCommandHelp(command, COMMAND_HELP));
      return 0;
    }
    try {
      switch (command) {
        case 'init':
          return await this.init(arguments_.slice(1));
        case 'doctor':
          return await this.doctor(arguments_.slice(1), environment);
        case 'dev':
          return await this.dev(arguments_.slice(1), environment);
        case 'start':
          return await this.start();
        case 'migrate':
          return await this.migrate(arguments_.slice(1));
        case 'backup':
          return await this.backup(arguments_.slice(1));
        case 'restore':
          return await this.restore(arguments_.slice(1), environment);
        case 'upgrade-check':
          return await this.upgradeCheck(arguments_.slice(1), environment);
        case 'create-admin':
          return await this.createAdmin(arguments_.slice(1), environment);
        case 'module':
          return await this.module(arguments_.slice(1), environment);
        case 'mcp':
          return await this.mcp(environment);
        default:
          process.stderr.write(`Unknown copalibre command: ${command}\n`);
          return 64;
      }
    } catch (error) {
      process.stderr.write(`copalibre ${command} failed: ${errorMessage(error)}\n`);
      return 1;
    }
  }

  private async init(arguments_: readonly string[]): Promise<number> {
    const parsed = parseArgs({
      args: [...arguments_],
      options: { file: { type: 'string', default: '.env' } },
      strict: true,
    });
    const file = parsed.values.file ?? '.env';
    await writeLocalDefaults(file);
    process.stdout.write(
      `Wrote non-secret defaults to ${file}\nRequired secrets:\n${formatRequiredSecrets()}\n`,
    );
    return 0;
  }

  private async doctor(
    arguments_: readonly string[],
    environment: NodeJS.ProcessEnv,
  ): Promise<number> {
    if (!isContainer(environment)) {
      return this.processes.run('docker', ['compose', 'run', '--rm', 'doctor', ...arguments_]);
    }
    const parsed = parseArgs({
      args: [...arguments_],
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
  }

  private async dev(
    arguments_: readonly string[],
    environment: NodeJS.ProcessEnv,
  ): Promise<number> {
    const parsed = parseArgs({
      args: [...arguments_],
      options: { hybrid: { type: 'boolean', default: false } },
      strict: true,
    });
    if (parsed.values.hybrid) {
      const infrastructure = await this.processes.run('docker', [
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
      const migration = await this.processes.run(
        'yarn',
        ['workspace', '@copalibre/migrate', 'run', 'start'],
        hybrid,
      );
      if (migration !== 0) return migration;
      return this.processes.run(
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
    return this.processes.run('docker', [
      'compose',
      '-f',
      'docker-compose.dev.yml',
      '--profile',
      'containerized',
      'up',
      '--watch',
    ]);
  }

  private async start(): Promise<number> {
    const database = await this.processes.run('docker', ['compose', 'up', '--detach', 'postgres']);
    if (database !== 0) return database;
    const doctor = await this.processes.run('docker', ['compose', 'run', '--rm', 'doctor']);
    if (doctor !== 0) return doctor;
    return this.processes.run('docker', ['compose', 'up', '--detach', '--wait']);
  }

  private migrate(arguments_: readonly string[]): Promise<number> {
    return this.processes.run('docker', ['compose', 'run', '--rm', 'migrate', ...arguments_]);
  }

  private async backup(arguments_: readonly string[]): Promise<number> {
    const options = parseBackupOptions(arguments_);
    assertBackupFile(options.file);
    if (options.dryRun) {
      process.stdout.write(`${backupDryRunMessage(options)}\n`);
      return 0;
    }
    const result = await createBackupPacket(this.processes, options, readCopalibreVersion());
    process.stdout.write(`Backup packet written: ${result.file}\n`);
    if (result.pruned.length > 0) {
      process.stdout.write(`Pruned older packet(s): ${result.pruned.join(', ')}\n`);
    }
    return 0;
  }

  private async restore(
    arguments_: readonly string[],
    environment: NodeJS.ProcessEnv,
  ): Promise<number> {
    const options = parseRestoreOptions(arguments_);
    if (!options.dryRun && !options.confirmed) {
      throw new Error('restore requires --confirm (or use --dry-run)');
    }
    assertBackupFile(options.file);
    if (options.dryRun) {
      process.stdout.write(`${restoreDryRunMessage(options)}\n`);
      return 0;
    }
    const database = environment.POSTGRES_DB?.trim() || 'copalibre';
    await restoreBackupPacket(this.processes, { file: options.file, database });
    process.stdout.write(`Restored from packet: ${options.file}\n`);
    return 0;
  }

  private async createAdmin(
    arguments_: readonly string[],
    environment: NodeJS.ProcessEnv,
  ): Promise<number> {
    const result = await createInitialAdministrator(
      parseCreateAdminArguments(arguments_),
      environment,
    );
    process.stdout.write(`Administrator setup link (shown once): ${result.setupUrl}\n`);
    return 0;
  }

  private async upgradeCheck(
    arguments_: readonly string[],
    environment: NodeJS.ProcessEnv,
  ): Promise<number> {
    if (!isContainer(environment)) {
      return this.processes.run('docker', [
        'compose',
        'run',
        '--rm',
        'upgrade-check',
        ...arguments_,
      ]);
    }
    const parsed = parseArgs({
      args: [...arguments_],
      options: { 'target-version': { type: 'string' } },
      strict: true,
    });
    const targetVersion = parsed.values['target-version'];
    if (!targetVersion) throw new Error('--target-version is required');

    const report = await runUpgradeCheck(targetVersion, environment);
    for (const failure of report.moduleFailures) {
      process.stdout.write(`FAIL [${failure.stage}] ${failure.field ?? ''}: ${failure.message}\n`);
    }
    process.stdout.write(
      report.pendingMigrations.length === 0
        ? 'No pending migrations.\n'
        : `Pending migrations: ${report.pendingMigrations.join(', ')}\n`,
    );
    process.stdout.write(
      report.ok
        ? `upgrade-check: OK for target version ${targetVersion}\n`
        : `upgrade-check: FAILED for target version ${targetVersion}\n`,
    );
    return report.ok ? 0 : 1;
  }

  private async module(
    arguments_: readonly string[],
    environment: NodeJS.ProcessEnv,
  ): Promise<number> {
    const [sub, ...rest] = arguments_;
    switch (sub) {
      case 'add':
        return moduleAdd(rest, environment);
      case 'list':
        return moduleList(rest, environment);
      case 'remove':
        return moduleRemove(rest, environment);
      case 'verify':
        return moduleVerify(rest, environment);
      default:
        process.stderr.write(renderModuleHelp());
        return 64;
    }
  }

  /**
   * Runs until stdin closes, the same way an MCP client's spawned server
   * process is expected to (0047). Protocol messages go over stdout/stdin
   * only — stderr (the banner, and any logging) never mixes with them.
   */
  private async mcp(environment: NodeJS.ProcessEnv): Promise<number> {
    await startMcpServer(environment);
    return 0;
  }

  /**
   * Returns rendered help text for a `module` help request (task 1.2), or
   * `undefined` when `arguments_` is not a help request and dispatch should
   * proceed normally to `module()`.
   */
  private moduleHelpFor(arguments_: readonly string[]): string | undefined {
    const [sub, next] = arguments_;
    if (!sub || HELP_FLAGS.has(sub)) return renderModuleHelp();
    if (HELP_FLAGS.has(next ?? '') && MODULE_SUBCOMMAND_HELP.some((c) => c.name === sub)) {
      return renderCommandHelp(sub, MODULE_SUBCOMMAND_HELP);
    }
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isContainer(environment: NodeJS.ProcessEnv): boolean {
  return environment.COPALIBRE_IN_CONTAINER === 'true';
}

function hybridEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...environment,
    DATABASE_URL:
      environment.DATABASE_URL ??
      'postgres://copalibre:copalibre_dev_only@localhost:5432/copalibre',
    COPALIBRE_APP_URL: environment.COPALIBRE_APP_URL ?? 'http://localhost:4321',
    COPALIBRE_API_URL: environment.COPALIBRE_API_URL ?? 'http://localhost:3001',
    COPALIBRE_BOOTSTRAP_TOKEN:
      environment.COPALIBRE_BOOTSTRAP_TOKEN ?? 'copalibre_dev_bootstrap_only',
    COPALIBRE_JWKS_URI: environment.COPALIBRE_JWKS_URI ?? 'http://oidc.invalid/jwks.json',
    COPALIBRE_JWT_ISSUER: environment.COPALIBRE_JWT_ISSUER ?? 'http://oidc.invalid',
    COPALIBRE_JWT_AUDIENCE: environment.COPALIBRE_JWT_AUDIENCE ?? 'copalibre',
    COPALIBRE_OIDC_CLIENT_ID: environment.COPALIBRE_OIDC_CLIENT_ID ?? 'copalibre-dev',
    COPALIBRE_EMAIL_PROVIDER: environment.COPALIBRE_EMAIL_PROVIDER ?? 'smtp',
    COPALIBRE_EMAIL_FROM: environment.COPALIBRE_EMAIL_FROM ?? 'dev@copalibre.invalid',
    COPALIBRE_SMTP_URL: environment.COPALIBRE_SMTP_URL ?? 'smtp://localhost:1025',
  };
}
