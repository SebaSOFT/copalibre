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
      'Validate this CopaLibre installation’s configuration and dependencies, the same ' +
      'checks `copalibre doctor` runs.',
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
    description: 'List installed discipline and tournament-profile modules.',
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
      'Check installed modules’ compatibility with a target CopaLibre version and list ' +
      'pending database migrations, the same check `copalibre upgrade-check` runs.',
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
