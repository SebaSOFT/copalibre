import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

const root = new URL('../', import.meta.url);
const workspaces = ['api', 'events', 'scheduler', 'worker'];
const frameworkPackages = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/platform-fastify',
  '@nestjs/testing',
];

function dependencyMajor(versionRange, label) {
  const match = versionRange.match(/^[~^]?(\d+)\./);
  assert.ok(match, `${label}: expected a semver range, received ${versionRange}`);
  return Number(match[1]);
}

function assertWorkspaceMajorsAligned(manifests) {
  const declaredMajors = new Map();

  for (const [workspace, manifest] of Object.entries(manifests)) {
    for (const name of frameworkPackages) {
      const range = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
      assert.ok(range, `${workspace}: missing ${name} dependency`);
      const major = dependencyMajor(range, `${workspace} ${name}`);
      declaredMajors.set(`${workspace}/${name}`, major);
    }
  }

  const majors = new Set(declaredMajors.values());
  assert.equal(
    majors.size,
    1,
    `NestJS framework packages must share one major across all workspaces; found ${[...majors].join(', ')}`,
  );

  return [...majors][0];
}

function assertLockMajorsAligned(lock, expectedMajor) {
  for (const name of frameworkPackages) {
    const entries = Object.values(lock).filter((entry) =>
      entry.resolution?.startsWith(`${name}@npm:`),
    );
    assert.ok(entries.length > 0, `${name}: no resolution found in yarn.lock`);

    const majors = new Set(
      entries.map((entry) => dependencyMajor(entry.version, entry.resolution)),
    );
    assert.deepEqual(
      [...majors],
      [expectedMajor],
      `${name}: lockfile must resolve only NestJS major ${expectedMajor}; found ${[...majors].join(', ')}`,
    );
  }
}

const manifests = Object.fromEntries(
  workspaces.map((workspace) => [
    workspace,
    JSON.parse(readFileSync(new URL(`apps/${workspace}/package.json`, root), 'utf8')),
  ]),
);
const lock = parse(readFileSync(new URL('yarn.lock', root), 'utf8'));

test('all NestJS service workspaces declare one consistent framework major', () => {
  assert.ok(Number.isInteger(assertWorkspaceMajorsAligned(manifests)));
});

test('yarn.lock resolves every framework package to the declared major', () => {
  const major = assertWorkspaceMajorsAligned(manifests);
  assertLockMajorsAligned(lock, major);
});

test('the alignment guard rejects a framework package from another major', () => {
  const mismatched = Object.fromEntries(
    Object.entries(manifests).map(([workspace, manifest]) => [
      workspace,
      {
        ...manifest,
        dependencies: { ...manifest.dependencies },
        devDependencies: { ...manifest.devDependencies },
      },
    ]),
  );
  mismatched.events.dependencies['@nestjs/core'] = '^11.1.28';

  assert.throws(() => assertWorkspaceMajorsAligned(mismatched), /share one major/);
});

test('the alignment guard rejects a lockfile retaining another framework major', () => {
  const mismatched = {
    ...lock,
    '@nestjs/core@npm:^11.1.28': {
      version: '11.1.28',
      resolution: '@nestjs/core@npm:11.1.28',
    },
  };

  assert.throws(
    () => assertLockMajorsAligned(mismatched, assertWorkspaceMajorsAligned(manifests)),
    /must resolve only NestJS major/,
  );
});
