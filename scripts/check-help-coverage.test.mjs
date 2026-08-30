import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isOperatorFacing,
  scenarioBlocks,
  listCapabilities,
  operatorFacingCapabilityIds,
  parseHelpFrontmatter,
  claimedCapabilityIds,
  uncoveredCapabilities,
  uncoveredRoles,
} from './check-help-coverage.mjs';

// 4.1 — the operator-facing heuristic

test('a capability whose scenarios name a person as subject is operator-facing', () => {
  const spec = `# example/thing Specification

## Requirements

### Requirement: An organizer configures a thing

#### Scenario: An organizer sets a value
- **WHEN** an organizer sets the value
- **THEN** the value is stored
`;
  assert.equal(isOperatorFacing(spec), true);
});

test('a capability whose scenarios name only the system as subject is exempt', () => {
  const spec = `# example/internal Specification

## Requirements

### Requirement: A job retries on failure

#### Scenario: A job fails and is retried
- **WHEN** a job fails processing
- **THEN** the job is retried up to the configured limit
`;
  assert.equal(isOperatorFacing(spec), false);
});

test("scenario blocks do not bleed into the next requirement's unrelated prose", () => {
  // A scenario immediately followed by a differently-worded requirement
  // whose own prose happens to contain a person word must not make the
  // FIRST scenario's block (and therefore its capability) look
  // operator-facing on account of text that isn't part of it.
  const spec = `# example/internal Specification

## Requirements

### Requirement: A job retries on failure

#### Scenario: A job fails and is retried
- **WHEN** a job fails processing
- **THEN** the job is retried up to the configured limit

### Requirement: An operator can inspect dead letters elsewhere
This is a different requirement's prose, not the scenario above's.
`;
  const blocks = scenarioBlocks(spec);
  assert.equal(blocks.length, 1);
  assert.equal(/operator/i.test(blocks[0]), false);
});

test('a scenario heading followed by a blank line before its bullets is still captured', () => {
  // Some spec files separate the heading from its WHEN/THEN with a blank
  // line; the block must not be considered empty because of it.
  const spec = `#### Scenario: A user logs in

- **WHEN** a user provides valid credentials
- **THEN** the system issues a session
`;
  assert.equal(isOperatorFacing(spec), true);
});

// 4.2 — the coverage gate

test('a claimed capability is not reported as uncovered', () => {
  const uncovered = uncoveredCapabilities(
    ['domain/a', 'domain/b'],
    new Set(['domain/a', 'domain/b']),
  );
  assert.deepEqual(uncovered, []);
});

test('an unclaimed operator-facing capability is reported, naming its id', () => {
  const uncovered = uncoveredCapabilities(['domain/a', 'domain/b'], new Set(['domain/a']));
  assert.deepEqual(uncovered, ['domain/b']);
});

test('listCapabilities finds every domain/capability/spec.md under a specs root', () => {
  const fixturesRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    'test-fixtures/help-coverage/specs',
  );
  const capabilities = listCapabilities(fixturesRoot);
  assert.deepEqual(
    capabilities.map((c) => c.id),
    ['domain-a/operator-facing', 'domain-a/system-only'],
  );
});

test('operatorFacingCapabilityIds filters a real capability list down to person-subject ones', () => {
  const fixturesRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    'test-fixtures/help-coverage/specs',
  );
  const capabilities = listCapabilities(fixturesRoot);
  assert.deepEqual(operatorFacingCapabilityIds(capabilities), ['domain-a/operator-facing']);
});

// 4.3 — role coverage

test('every role named by some page reports no uncovered roles', () => {
  const pages = [{ roles: ['admin'] }, { roles: ['viewer'] }];
  assert.deepEqual(uncoveredRoles(pages, ['admin', 'viewer']), []);
});

test('a role named by no page is reported as uncovered', () => {
  const pages = [{ roles: ['admin'] }];
  assert.deepEqual(uncoveredRoles(pages, ['admin', 'referee']), ['referee']);
});

test("removing a role's only claiming page makes that role uncovered again", () => {
  const withPage = [{ roles: ['admin'] }, { roles: ['referee'] }];
  assert.deepEqual(uncoveredRoles(withPage, ['admin', 'referee']), []);
  const withoutPage = [{ roles: ['admin'] }];
  assert.deepEqual(uncoveredRoles(withoutPage, ['admin', 'referee']), ['referee']);
});

// 4.4 — frontmatter parsing / the undeclared-page case

test('a page declaring capabilities and roles parses both', () => {
  const source = `---
title: Example
capabilities:
  - domain/example
roles:
  - admin
---

Body text.
`;
  assert.deepEqual(parseHelpFrontmatter(source), {
    capabilities: ['domain/example'],
    roles: ['admin'],
  });
});

test('a page declaring neither capabilities nor roles is reported, not silently accepted', () => {
  const source = `---
title: Example
description: No capabilities or roles here.
---

Body text.
`;
  assert.equal(parseHelpFrontmatter(source), undefined);
});

test('claimedCapabilityIds unions capabilities across every page', () => {
  const pages = [{ capabilities: ['domain/a'] }, { capabilities: ['domain/b', 'domain/a'] }];
  assert.deepEqual([...claimedCapabilityIds(pages)].sort(), ['domain/a', 'domain/b']);
});

// 5.1 — integration: the real specification tree, with the pages this change adds

test('the real help-page frontmatter covers every real operator-facing capability (proves the gaps are closed)', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const capabilities = listCapabilities(join(repoRoot, 'openspec/specs'));
  const operatorFacingIds = operatorFacingCapabilityIds(capabilities);

  const helpRoot = join(repoRoot, 'apps/web/src/content/docs/help');
  const pages = readdirSync(helpRoot, { recursive: true })
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => parseHelpFrontmatter(readFileSync(join(helpRoot, entry), 'utf8')))
    .filter((frontmatter) => frontmatter !== undefined);

  const claimed = claimedCapabilityIds(pages);
  assert.deepEqual(uncoveredCapabilities(operatorFacingIds, claimed), []);
  assert.deepEqual(
    uncoveredRoles(pages, [
      'admin',
      'club-admin',
      'tournament-admin',
      'referee',
      'broadcaster',
      'viewer',
      'super-admin',
    ]),
    [],
  );
});
