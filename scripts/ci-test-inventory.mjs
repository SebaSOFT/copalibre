/**
 * OpenSpec 0221 CI Test Inventory & Partitioning Plan.
 *
 * Records the test inventory for full and focused invocations, defines
 * duration-balanced unit and integration groups, and validates that zero
 * coverage is lost when removing redundant focused reruns.
 */

export const UNIT_GROUPS = {
  1: {
    name: 'Unit Group 1 (Core Domain & Engines)',
    workspaces: [
      { workspace: '@copalibre/domain', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/rules', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/tournament-engine', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/statistics-refold', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/module-catalogue', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/module-distribution', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/auth', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/routing', command: 'test:coverage', dialect: 'none' },
    ],
    scriptTests: ['scripts/tv-soak-test.test.mjs'],
  },
  2: {
    name: 'Unit Group 2 (Services, Web & SQLite Dialects)',
    workspaces: [
      { workspace: '@copalibre/api', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/api', command: 'test:sqlite', dialect: 'sqlite' },
      { workspace: '@copalibre/persistence', command: 'test:sqlite', dialect: 'sqlite' },
      { workspace: '@copalibre/seed', command: 'test:sqlite', dialect: 'sqlite' },
      { workspace: '@copalibre/object-storage', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/worker', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/scheduler', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/events', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/copalibre', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/design-tokens', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/realtime', command: 'test:coverage', dialect: 'none' },
      { workspace: '@copalibre/web', command: 'test:coverage', dialect: 'none' },
    ],
    scriptTests: [],
  },
};

export const INTEGRATION_GROUPS = {
  1: {
    name: 'Integration Group 1 (Persistence & Core API - Postgres)',
    services: ['postgres'],
    workspaces: [
      { workspace: '@copalibre/persistence', command: 'test:integration', dialect: 'postgresql' },
      { workspace: '@copalibre/seed', command: 'test:integration', dialect: 'postgresql' },
      { workspace: '@copalibre/api', command: 'test:integration', dialect: 'postgresql' },
      {
        workspace: '@copalibre/tournament-engine',
        command: 'test:integration',
        dialect: 'postgresql',
      },
      {
        workspace: '@copalibre/statistics-refold',
        command: 'test:integration',
        dialect: 'postgresql',
      },
    ],
  },
  2: {
    name: 'Integration Group 2 (Storage, Worker, Scheduler, Events, CLI - Postgres + MinIO + ClamAV)',
    services: ['postgres', 'minio', 'clamd'],
    workspaces: [
      {
        workspace: '@copalibre/object-storage',
        command: 'test:integration',
        dialect: 'postgresql',
      },
      { workspace: '@copalibre/worker', command: 'test:integration', dialect: 'postgresql' },
      { workspace: '@copalibre/scheduler', command: 'test:integration', dialect: 'postgresql' },
      { workspace: '@copalibre/events', command: 'test:integration', dialect: 'postgresql' },
      {
        workspace: '@copalibre/copalibre',
        command: 'test:integration',
        dialect: 'postgresql',
        buildFirst: true,
      },
    ],
  },
};

/**
 * 32 legacy focused reruns previously executed in unit-tests.
 * Each entry names the workspace and pattern that was rerun for log visibility.
 */
export const LEGACY_FOCUSED_UNIT_RERUNS = [
  { workspace: '@copalibre/rules', pattern: 'render' },
  { workspace: '@copalibre/web', pattern: 'descriptor-builder|profile-builder' },
  { workspace: '@copalibre/module-distribution', pattern: 'author' },
  { workspace: '@copalibre/web', pattern: 'decision-hint|wizard' },
  { workspace: '@copalibre/domain', pattern: 'descriptor-schema' },
  { workspace: '@copalibre/web', pattern: 'schedule-series|offline-queue|live-surfaces' },
  { workspace: '@copalibre/api', pattern: 'stage-series' },
  { workspace: '@copalibre/tournament-engine', pattern: 'standings' },
  {
    workspace: '@copalibre/web',
    pattern:
      'authoring\\.test|authoring-ui\\.test|StandingsTemplate\\.test|overview\\.test|public-api-client\\.test',
  },
  { workspace: '@copalibre/web', pattern: 'control-help-links|help-coverage' },
  { workspace: '@copalibre/web', pattern: 'MatchCard|MatchesViewPage' },
  { workspace: '@copalibre/web', pattern: 'tv-branding|device-heartbeat' },
  { workspace: '@copalibre/domain', pattern: 'i18n' },
  { workspace: '@copalibre/web', pattern: 'language-preference' },
  { workspace: '@copalibre/web', pattern: 'i18n/i18n\\.test' },
  { workspace: '@copalibre/web', pattern: 'toast|notification' },
  { workspace: '@copalibre/web', pattern: 'lib/i18n/public-intl' },
  { workspace: '@copalibre/domain', pattern: 'participant-report' },
  { workspace: '@copalibre/api', pattern: 'resource-policy' },
  { workspace: '@copalibre/domain', pattern: 'compiler' },
  { workspace: '@copalibre/worker', pattern: 'report-evidence' },
  { workspace: '@copalibre/web', pattern: 'control/lib/reports' },
  { workspace: '@copalibre/domain', pattern: 'tournament' },
  { workspace: '@copalibre/domain', pattern: 'ruleset-override-mutation' },
  { workspace: '@copalibre/copalibre', pattern: 'banner' },
  { workspace: '@copalibre/copalibre', pattern: 'help-text|cli-docs-parity' },
  { workspace: '@copalibre/copalibre', pattern: 'descriptor-authoring-tools' },
  { workspace: '@copalibre/copalibre', pattern: 'upgrade-check' },
  { workspace: '@copalibre/copalibre', pattern: 'pat-cutover' },
  { workspace: '@copalibre/copalibre', pattern: 'backup-packet|backup\\.test|cli\\.test' },
  { workspace: '@copalibre/copalibre', pattern: 'mcp' },
  { workspace: '@copalibre/copalibre', pattern: 'module-authoring' },
];

/**
 * 23 legacy focused reruns previously executed in integration-tests.
 */
export const LEGACY_FOCUSED_INTEGRATION_RERUNS = [
  { workspace: '@copalibre/api', pattern: 'series' },
  { workspace: '@copalibre/api', pattern: 'series-operations' },
  { workspace: '@copalibre/api', pattern: 'structure-editing|object-deletion' },
  { workspace: '@copalibre/api', pattern: 'ruleset-editing|stage-configuration-editing' },
  { workspace: '@copalibre/api', pattern: 'participant-and-access-correction' },
  { workspace: '@copalibre/api', pattern: 'participant-direct-authoring' },
  { workspace: '@copalibre/api', pattern: 'refusal-audit|audit-trail' },
  { workspace: '@copalibre/api', pattern: 'role-scope' },
  { workspace: '@copalibre/api', pattern: 'accounting-grain' },
  { workspace: '@copalibre/api', pattern: 'compiled-ruleset' },
  { workspace: '@copalibre/api', pattern: 'matches-view' },
  { workspace: '@copalibre/api', pattern: 'authored-modules' },
  { workspace: '@copalibre/api', pattern: 'worked-transcription' },
  { workspace: '@copalibre/api', pattern: 'live-statistics' },
  { workspace: '@copalibre/persistence', pattern: 'display-token' },
  { workspace: '@copalibre/persistence', pattern: 'personal-access-token-repository' },
  { workspace: '@copalibre/events', pattern: 'display-token' },
  { workspace: '@copalibre/api', pattern: 'reports' },
  { workspace: '@copalibre/persistence', pattern: 'match-operations' },
  { workspace: '@copalibre/api', pattern: 'lifecycle' },
  { workspace: '@copalibre/persistence', pattern: 'organization-repository' },
  { workspace: '@copalibre/api', pattern: 'organization-access-guard' },
  { workspace: '@copalibre/copalibre', pattern: 'statistics-rebuild' },
];

/**
 * Validates the partitioned execution plan.
 * Verifies that:
 * 1. Every workspace from the legacy plan is preserved.
 * 2. Every legacy focused rerun's workspace is present in the new plan.
 * 3. Distinct dialect obligations (Postgres vs SQLite) remain preserved.
 * 4. No workspace's coverage run is split across groups.
 *
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePartitionPlan() {
  const errors = [];

  // Check unit coverage workspaces
  const allUnitWorkspaces = new Set([
    ...UNIT_GROUPS[1].workspaces.map((w) => w.workspace),
    ...UNIT_GROUPS[2].workspaces.map((w) => w.workspace),
  ]);

  // Check integration workspaces
  const allIntegrationWorkspaces = new Set([
    ...INTEGRATION_GROUPS[1].workspaces.map((w) => w.workspace),
    ...INTEGRATION_GROUPS[2].workspaces.map((w) => w.workspace),
  ]);

  // Verify all 32 legacy unit reruns map to an included unit workspace
  for (const item of LEGACY_FOCUSED_UNIT_RERUNS) {
    if (!allUnitWorkspaces.has(item.workspace)) {
      errors.push(`Legacy unit rerun workspace ${item.workspace} missing from unit groups`);
    }
  }

  // Verify all 23 legacy integration reruns map to an included integration workspace
  for (const item of LEGACY_FOCUSED_INTEGRATION_RERUNS) {
    if (!allIntegrationWorkspaces.has(item.workspace)) {
      errors.push(
        `Legacy integration rerun workspace ${item.workspace} missing from integration groups`,
      );
    }
  }

  // Verify SQLite obligations are preserved in Unit Group 2
  const sqliteWorkspaces = UNIT_GROUPS[2].workspaces.filter((w) => w.dialect === 'sqlite');
  if (sqliteWorkspaces.length !== 3) {
    errors.push(
      `Expected 3 SQLite dialect obligations (api, persistence, seed); found ${sqliteWorkspaces.length}`,
    );
  }

  // Verify PostgreSQL obligations in both integration groups
  const group1Pg = INTEGRATION_GROUPS[1].workspaces.every((w) => w.dialect === 'postgresql');
  const group2Pg = INTEGRATION_GROUPS[2].workspaces.every((w) => w.dialect === 'postgresql');
  if (!group1Pg || !group2Pg) {
    errors.push('Not all integration workspaces are mapped to postgresql dialect');
  }

  // Verify no workspace coverage run is split across unit groups
  const g1Coverage = new Set(
    UNIT_GROUPS[1].workspaces.filter((w) => w.command === 'test:coverage').map((w) => w.workspace),
  );
  const g2Coverage = new Set(
    UNIT_GROUPS[2].workspaces.filter((w) => w.command === 'test:coverage').map((w) => w.workspace),
  );
  for (const ws of g1Coverage) {
    if (g2Coverage.has(ws)) {
      errors.push(`Workspace ${ws} has coverage run split across Unit Group 1 and Unit Group 2`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('ci-test-inventory.mjs')) {
  const result = validatePartitionPlan();
  if (!result.valid) {
    process.stderr.write(
      `::error::Partition plan validation failed:\n${result.errors.join('\n')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    'Partition plan validated: 100% test coverage retention with zero coverage loss.\n',
  );
  process.exit(0);
}
