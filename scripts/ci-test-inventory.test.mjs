import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNIT_GROUPS,
  INTEGRATION_GROUPS,
  LEGACY_FOCUSED_UNIT_RERUNS,
  LEGACY_FOCUSED_INTEGRATION_RERUNS,
  validatePartitionPlan,
} from './ci-test-inventory.mjs';

describe('ci-test-inventory', () => {
  it('validates the complete partitioned plan with zero coverage loss', () => {
    const result = validatePartitionPlan();
    assert.equal(result.valid, true, `Validation errors: ${result.errors.join(', ')}`);
    assert.equal(result.errors.length, 0);
  });

  it('preserves all 32 legacy focused unit reruns within owning workspace suites', () => {
    assert.equal(LEGACY_FOCUSED_UNIT_RERUNS.length, 32);

    const allUnitWorkspaces = new Set([
      ...UNIT_GROUPS[1].workspaces.map((w) => w.workspace),
      ...UNIT_GROUPS[2].workspaces.map((w) => w.workspace),
    ]);

    for (const rerun of LEGACY_FOCUSED_UNIT_RERUNS) {
      assert.equal(
        allUnitWorkspaces.has(rerun.workspace),
        true,
        `Workspace ${rerun.workspace} must be present in unit groups`,
      );
    }
  });

  it('preserves all 23 legacy focused integration reruns within owning workspace suites', () => {
    assert.equal(LEGACY_FOCUSED_INTEGRATION_RERUNS.length, 23);

    const allIntegrationWorkspaces = new Set([
      ...INTEGRATION_GROUPS[1].workspaces.map((w) => w.workspace),
      ...INTEGRATION_GROUPS[2].workspaces.map((w) => w.workspace),
    ]);

    for (const rerun of LEGACY_FOCUSED_INTEGRATION_RERUNS) {
      assert.equal(
        allIntegrationWorkspaces.has(rerun.workspace),
        true,
        `Workspace ${rerun.workspace} must be present in integration groups`,
      );
    }
  });

  it('preserves SQLite dialect obligations as distinct from PostgreSQL', () => {
    const sqliteEntries = UNIT_GROUPS[2].workspaces.filter((w) => w.dialect === 'sqlite');
    const sqliteWorkspaces = sqliteEntries.map((w) => w.workspace).sort();
    assert.deepEqual(sqliteWorkspaces, [
      '@copalibre/api',
      '@copalibre/persistence',
      '@copalibre/seed',
    ]);
  });

  it('confirms no workspace coverage suite is split across groups', () => {
    const g1Coverage = new Set(
      UNIT_GROUPS[1].workspaces
        .filter((w) => w.command === 'test:coverage')
        .map((w) => w.workspace),
    );
    const g2Coverage = new Set(
      UNIT_GROUPS[2].workspaces
        .filter((w) => w.command === 'test:coverage')
        .map((w) => w.workspace),
    );

    for (const ws of g1Coverage) {
      assert.equal(
        g2Coverage.has(ws),
        false,
        `Workspace ${ws} coverage suite cannot be split across groups`,
      );
    }
  });

  it('confirms integration service isolation: Group 1 uses only postgres, Group 2 uses minio/clamd', () => {
    assert.deepEqual(INTEGRATION_GROUPS[1].services, ['postgres']);
    assert.deepEqual(INTEGRATION_GROUPS[2].services, ['postgres', 'minio', 'clamd']);
  });
});
