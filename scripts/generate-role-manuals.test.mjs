import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  documentedCapabilities,
  generatedCapabilityBlock,
  roleManualPages,
  withRegeneratedCapabilities,
} from './generate-role-manuals.mjs';

const PAGE = (block) =>
  `---\ntitle: Club admin\nroles:\n  - club-admin\n---\n\nProse.\n\n${block}\n\nMore prose.\n`;

test('generates a sorted, code-span bullet per held capability', () => {
  const block = generatedCapabilityBlock('club-admin');
  assert.match(block, /- `org\.manage-clubs`/);
  assert.ok(block.startsWith('<!-- GENERATED:CAPABILITIES:START -->'));
  assert.ok(block.endsWith('<!-- GENERATED:CAPABILITIES:END -->'));
});

test('names the inheritance source next to an inherited capability, and states the relation once', () => {
  const block = generatedCapabilityBlock('admin');
  assert.match(block, /`org\.manage-clubs` \(inherited from `club-admin`\)/);
  assert.match(block, /holds every capability `club-admin` holds, by inheritance/);
});

test('states plainly when a role holds nothing, rather than an empty list', () => {
  const block = generatedCapabilityBlock('viewer');
  assert.match(block, /No capabilities are granted to this role today\./);
});

test('a tournament-admin capability never appears organization-wide', () => {
  const block = generatedCapabilityBlock('tournament-admin');
  assert.doesNotMatch(block, /org\.manage-users/);
  assert.doesNotMatch(block, /org\.manage-settings/);
  assert.doesNotMatch(block, /org\.manage-clubs/);
});

test('regenerating replaces only the marked block, leaving surrounding prose untouched', () => {
  const original = PAGE(generatedCapabilityBlock('club-admin'));
  const regenerated = withRegeneratedCapabilities(original, 'club-admin');
  assert.equal(regenerated, original);
  assert.match(regenerated, /^Prose\.$/m);
  assert.match(regenerated, /^More prose\.$/m);
});

test('regenerating after a mapping change produces the changed list with no manual edit', () => {
  const stale = PAGE(
    '<!-- GENERATED:CAPABILITIES:START -->\n\n- `org.a-capability-that-moved-on`\n\n<!-- GENERATED:CAPABILITIES:END -->',
  );
  const regenerated = withRegeneratedCapabilities(stale, 'club-admin');
  assert.doesNotMatch(regenerated, /org\.a-capability-that-moved-on/);
  assert.match(regenerated, /org\.manage-clubs/);
});

test('refuses a page with no marker pair', () => {
  assert.throws(() =>
    withRegeneratedCapabilities('---\nroles:\n  - viewer\n---\nNo markers.', 'viewer'),
  );
});

test('parses back exactly the capability ids the block lists', () => {
  const block = generatedCapabilityBlock('admin');
  const ids = documentedCapabilities(block);
  assert.equal(ids.length, 21);
  assert.ok(ids.includes('org.manage-clubs'));
});

test('reports no capabilities for a block outside its markers', () => {
  assert.deepEqual(documentedCapabilities('no markers here'), []);
});

test('roleManualPages reads the first role named in frontmatter, skipping pages with none', () => {
  // roleManualPages reads real files; covered end to end by
  // check-role-manual-drift.test.mjs against the actual role pages.
  assert.deepEqual(roleManualPages('/does/not/exist'), []);
});
