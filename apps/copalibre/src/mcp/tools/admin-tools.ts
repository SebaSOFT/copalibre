import { runStatisticsRebuild } from '@copalibre/statistics-refold';
import {
  InstalledModuleRepository,
  createDatabase,
  databaseConfigFromEnv,
} from '@copalibre/persistence';
import { createBackupPacket } from '../../backup-packet.js';
import {
  assertBackupFile,
  backupDryRunMessage,
  parseBackupOptions,
  type BackupOptions,
} from '../../backup.js';
import { readCopalibreVersion } from '../../banner.js';
import { refuseForKubernetesMode } from '../../compose-target.js';
import { runDoctor, type DoctorDependencies } from '../../doctor.js';
import {
  moduleAddDirect,
  moduleRemoveDirect,
  moduleVerifyDirect,
  resolveSource,
} from '../../module-commands.js';
import { systemProcessRunner } from '../../process-runner.js';
import { runUpgradeCheck } from '../../upgrade-check.js';
import type { McpToolDefinition } from '../tool.js';

/**
 * The eight installation-action tools call existing logic in-process: the
 * same functions the CLI's own `doctor`/`module add`/`module remove`/
 * `module verify`/`upgrade-check`/`statistics-rebuild`/`backup` commands
 * use (or, for `module list`, an equivalent direct read), never shelling
 * back out to `copalibre` itself.
 */
export function adminTools(environment: NodeJS.ProcessEnv): readonly McpToolDefinition[] {
  return [
    doctorTool(environment),
    moduleListTool(environment),
    upgradeCheckTool(environment),
    moduleAddTool(environment),
    moduleRemoveTool(environment),
    moduleVerifyTool(environment),
    statisticsRebuildTool(environment),
    backupTool(),
  ];
}

/** `dependencies` defaults to the real system checks; tests inject fakes, matching `doctor.test.ts`. */
export function doctorTool(
  environment: NodeJS.ProcessEnv,
  dependencies?: DoctorDependencies,
): McpToolDefinition {
  return {
    name: 'copalibre_doctor',
    description:
      'Checks whether this CopaLibre installation is correctly configured: required secrets, ' +
      'database reachability, JWKS content, object storage, and persistent-path writability. Use ' +
      'it before starting an installation, or to diagnose why one is failing. Runs the same checks ' +
      'as `copalibre doctor`; needs no API token — it inspects local configuration and connects ' +
      'directly to the database, not through apps/api.',
    inputSchema: { type: 'object' },
    handler: async () => {
      const report = await runDoctor(environment, dependencies);
      const lines = report.checks.map(
        (check) => `${check.status.toUpperCase()} ${check.name}: ${check.message}`,
      );
      return [report.ok ? 'doctor: OK' : 'doctor: FAILED', ...lines].join('\n');
    },
  };
}

export function moduleListTool(environment: NodeJS.ProcessEnv): McpToolDefinition {
  return {
    name: 'copalibre_module_list',
    description:
      'Lists every installed discipline and tournament-profile module (alias, version, kind, ' +
      'source, attribution). Use it to see what a given installation can run before creating a ' +
      'tournament, or to check whether a module you expect is actually installed. Needs no API ' +
      'token — reads directly from the database, not through apps/api.',
    inputSchema: { type: 'object' },
    handler: async () => {
      const db = createDatabase(databaseConfigFromEnv(environment));
      try {
        const modules = await new InstalledModuleRepository(db).list();
        return JSON.stringify(
          modules.map((module_) => ({
            alias: module_.alias,
            version: module_.version,
            kind: module_.kind,
            sourceKind: module_.sourceKind,
            attribution: module_.attribution,
          })),
          null,
          2,
        );
      } finally {
        await db.destroy();
      }
    },
  };
}

export function upgradeCheckTool(environment: NodeJS.ProcessEnv): McpToolDefinition {
  return {
    name: 'copalibre_upgrade_check',
    description:
      'Checks, before upgrading, whether every installed module would still satisfy its declared ' +
      'CopaLibre-version compatibility range under a target version, and lists database migrations ' +
      'that would run. Use it as a pre-flight gate before switching an installation to a new ' +
      'CopaLibre version — it reports incompatibilities without applying any migration or ' +
      'altering any installed data. Needs no API token.',
    inputSchema: {
      type: 'object',
      properties: { target_version: { type: 'string', description: 'CopaLibre semver to check' } },
      required: ['target_version'],
    },
    handler: async (args) => {
      const targetVersion = args.target_version;
      if (typeof targetVersion !== 'string') {
        throw new Error('target_version must be a string');
      }
      const report = await runUpgradeCheck(targetVersion, environment);
      return JSON.stringify(report, null, 2);
    },
  };
}

export function moduleAddTool(environment: NodeJS.ProcessEnv): McpToolDefinition {
  return {
    name: 'copalibre_module_add',
    description:
      'Installs a discipline or tournament-profile module — at its latest version, or one ' +
      'satisfying an optional semver range — from the curated module repository or another ' +
      'allow-listed source. Use it to add a module an installation needs before creating a ' +
      'tournament with it. Runs the same direct-database install `copalibre module add` uses; ' +
      'needs no API token — it installs directly into the local database and object storage, not ' +
      'through apps/api.',
    inputSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string' },
        range: { type: 'string', description: 'Semver range; omit for the latest version' },
        source: { type: 'string', description: 'Alternate repository URL; must be allow-listed' },
        allow_unsatisfied_capabilities: { type: 'boolean' },
      },
      required: ['alias'],
    },
    handler: async (args) => {
      const alias = args.alias;
      if (typeof alias !== 'string' || alias.length === 0) {
        throw new Error('alias must be a non-empty string');
      }
      const range = typeof args.range === 'string' ? args.range : undefined;
      const sourceFlag = typeof args.source === 'string' ? args.source : undefined;
      const source = resolveSource(sourceFlag, environment);
      const report = await moduleAddDirect(
        alias,
        range,
        source,
        environment,
        args.allow_unsatisfied_capabilities === true,
      );
      return JSON.stringify(report, null, 2);
    },
  };
}

export function moduleRemoveTool(environment: NodeJS.ProcessEnv): McpToolDefinition {
  return {
    name: 'copalibre_module_remove',
    description:
      'Removes every installed version of a discipline or tournament-profile module by alias, ' +
      'refusing (and removing nothing) if any started tournament still references it. Use it to ' +
      'uninstall a module no longer needed. Runs the same direct-database removal `copalibre ' +
      'module remove` uses; needs no API token.',
    inputSchema: {
      type: 'object',
      properties: { alias: { type: 'string' } },
      required: ['alias'],
    },
    handler: async (args) => {
      const alias = args.alias;
      if (typeof alias !== 'string' || alias.length === 0) {
        throw new Error('alias must be a non-empty string');
      }
      const report = await moduleRemoveDirect(alias, environment);
      return JSON.stringify(report, null, 2);
    },
  };
}

export function moduleVerifyTool(environment: NodeJS.ProcessEnv): McpToolDefinition {
  return {
    name: 'copalibre_module_verify',
    description:
      "Re-validates every installed module's stored document and assets against the running " +
      'CopaLibre core version, reporting PASS/FAIL per module with failure details. Use it to ' +
      'check installation integrity, especially after an upgrade. Runs the same direct-database ' +
      'checks `copalibre module verify` uses; needs no API token.',
    inputSchema: { type: 'object' },
    handler: async () => {
      const results = await moduleVerifyDirect(environment);
      const ok = results.every((result) => result.ok);
      const lines = results.flatMap((result) => {
        if (result.ok) return [`PASS ${result.alias}@${result.version}`];
        return [
          `FAIL ${result.alias}@${result.version}`,
          ...result.failures.map((failure) => `  [${failure.stage}] ${failure.message}`),
        ];
      });
      return [ok ? 'verify: OK' : 'verify: FAILED', ...lines].join('\n');
    },
  };
}

export function statisticsRebuildTool(environment: NodeJS.ProcessEnv): McpToolDefinition {
  return {
    name: 'copalibre_statistics_rebuild',
    description:
      'Recomputes every folded statistic total from source match facts, for an organization or ' +
      'one tournament within it — idempotent, safe to re-run. Use it after a data backfill, a ' +
      'statistics-engine fix, or to repair drift. Runs the same direct-database recompute ' +
      '`copalibre statistics-rebuild` uses; needs no API token.',
    inputSchema: {
      type: 'object',
      properties: {
        organization_alias: { type: 'string' },
        tournament_alias: { type: 'string', description: 'Scope to one tournament; omit for all' },
      },
      required: ['organization_alias'],
    },
    handler: async (args) => {
      const organizationAlias = args.organization_alias;
      if (typeof organizationAlias !== 'string' || organizationAlias.length === 0) {
        throw new Error('organization_alias must be a non-empty string');
      }
      const tournamentAlias =
        typeof args.tournament_alias === 'string' ? args.tournament_alias : undefined;
      const db = createDatabase(databaseConfigFromEnv(environment));
      try {
        const result = await runStatisticsRebuild(db, {
          organization: organizationAlias,
          ...(tournamentAlias === undefined ? {} : { tournament: tournamentAlias }),
        });
        return JSON.stringify(result, null, 2);
      } finally {
        await db.destroy();
      }
    },
  };
}

export function backupTool(): McpToolDefinition {
  return {
    name: 'copalibre_backup',
    description:
      'Creates a compressed backup packet of the database (pg_dump via the `database-tools` ' +
      'Compose service) under backups/, pruning older packets beyond the retention count. Use it ' +
      'before a risky operation or as part of a backup routine. Runs the same steps `copalibre ' +
      'backup` uses, including its Kubernetes-mode refusal; needs no API token.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path within backups/; omit for a timestamped name' },
        retain: { type: 'integer', description: 'Most recent packets to keep; defaults to 5' },
        dry_run: { type: 'boolean' },
      },
    },
    handler: async (args) => {
      await refuseForKubernetesMode();
      const cliArguments: string[] = [];
      if (typeof args.file === 'string') cliArguments.push('--file', args.file);
      if (args.retain !== undefined) cliArguments.push('--retain', String(args.retain));
      if (args.dry_run === true) cliArguments.push('--dry-run');
      const options: BackupOptions = parseBackupOptions(cliArguments);
      assertBackupFile(options.file);
      if (options.dryRun) return backupDryRunMessage(options);
      const result = await createBackupPacket(systemProcessRunner, options, readCopalibreVersion());
      const lines = [`Backup packet written: ${result.file}`];
      if (result.pruned.length > 0) {
        lines.push(`Pruned older packet(s): ${result.pruned.join(', ')}`);
      }
      return lines.join('\n');
    },
  };
}
