import {
  InstalledModuleRepository,
  createDatabase,
  databaseConfigFromEnv,
} from '@copalibre/persistence';
import { runDoctor, type DoctorDependencies } from '../../doctor.js';
import { runUpgradeCheck } from '../../upgrade-check.js';
import type { McpToolDefinition } from '../tool.js';

/**
 * The three installation-action tools call existing logic in-process (0047
 * design): the same functions the CLI's own `doctor`/`upgrade-check` commands
 * and `module list` call, never shelling back out to `copalibre` itself.
 */
export function adminTools(environment: NodeJS.ProcessEnv): readonly McpToolDefinition[] {
  return [doctorTool(environment), moduleListTool(environment), upgradeCheckTool(environment)];
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
