import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORGANIZATION_ROLES } from '@copalibre/domain';
import { capabilityDrift, findAllDrift } from './check-role-manual-drift.mjs';
import { roleManualPages } from './generate-role-manuals.mjs';

test('reports nothing when the documented set exactly equals the granted set', () => {
  const { undocumented, overclaimed } = capabilityDrift('club-admin', ['org.manage-clubs']);
  assert.deepEqual(undocumented, []);
  assert.deepEqual(overclaimed, []);
});

test('an undocumented grant fails, naming the capability', () => {
  const { undocumented } = capabilityDrift('club-admin', []);
  assert.deepEqual(undocumented, ['org.manage-clubs']);
});

test('a documented capability the mapping does not grant fails, naming the claim', () => {
  const { overclaimed } = capabilityDrift('club-admin', ['org.manage-clubs', 'org.manage-users']);
  assert.deepEqual(overclaimed, ['org.manage-users']);
});

test('findAllDrift skips a page whose frontmatter role is not an organization role (e.g. super-admin)', () => {
  const drift = findAllDrift([{ role: 'super-admin', path: '/x.md' }], () => {
    throw new Error('should not read a non-organization-role page');
  });
  assert.deepEqual(drift, []);
});

test('findAllDrift reports every drifted page, not just the first', () => {
  const pages = [
    { role: 'club-admin', path: '/club.md' },
    { role: 'referee', path: '/referee.md' },
  ];
  const drift = findAllDrift(
    pages,
    () => '<!-- GENERATED:CAPABILITIES:START -->\n<!-- GENERATED:CAPABILITIES:END -->',
  );
  assert.deepEqual(
    drift.map((entry) => entry.role),
    ['club-admin', 'referee'],
  );
});

test('the real role manual pages match the declared mapping exactly', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const rolesRoot = join(repoRoot, 'apps/web/src/content/docs/help/roles');
  const pages = roleManualPages(rolesRoot);

  const missing = ORGANIZATION_ROLES.filter((role) => !pages.some((page) => page.role === role));
  assert.deepEqual(missing, []);

  const drift = findAllDrift(pages, (path) => readFileSync(path, 'utf8'));
  assert.deepEqual(drift, []);
});
