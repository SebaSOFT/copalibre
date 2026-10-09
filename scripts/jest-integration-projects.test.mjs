import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { integrationProjects } from './jest-integration-projects.mjs';

function workspace(root, group, name, source) {
  const directory = path.join(root, group, name);
  mkdirSync(directory, { recursive: true });
  if (source !== undefined)
    writeFileSync(path.join(directory, 'jest.integration.config.cjs'), source);
  return directory;
}

test('carries each workspace timeout into its own test environment', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jest-projects-'));
  const slow = workspace(
    root,
    'apps',
    'slow',
    "module.exports = { displayName: 'slow', testTimeout: 60000 };",
  );
  const quick = workspace(
    root,
    'packages',
    'quick',
    "module.exports = { displayName: 'quick', testTimeout: 30000 };",
  );

  const projects = integrationProjects(root);

  assert.deepEqual(
    projects.map((project) => [
      project.displayName,
      project.rootDir,
      project.globals.__DECLARED_TEST_TIMEOUT__,
    ]),
    [
      ['slow', slow, 60000],
      ['quick', quick, 30000],
    ],
  );
  assert.ok(
    projects.every((project) =>
      project.setupFilesAfterEnv.at(-1).endsWith('jest.apply-declared-timeout.cjs'),
    ),
  );
  assert.ok(projects.every((project) => !('testTimeout' in project)));
});

test('keeps the setup files and globals a workspace already declares', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jest-projects-'));
  workspace(
    root,
    'apps',
    'own',
    "module.exports = { setupFilesAfterEnv: ['own-setup.cjs'], globals: { kept: true }, testTimeout: 1 };",
  );

  const [project] = integrationProjects(root);

  assert.equal(project.setupFilesAfterEnv[0], 'own-setup.cjs');
  assert.equal(project.globals.kept, true);
});

test('skips a workspace with no integration configuration and tolerates a missing group', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jest-projects-'));
  workspace(root, 'apps', 'unit-only', undefined);

  assert.deepEqual(integrationProjects(root), []);
});

test('a workspace that declares no timeout leaves the default in force', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jest-projects-'));
  workspace(root, 'apps', 'plain', "module.exports = { displayName: 'plain' };");

  const [project] = integrationProjects(root);

  assert.equal(project.globals.__DECLARED_TEST_TIMEOUT__, undefined);
});
