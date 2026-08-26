const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const generateJestWorkspaceMapper = require('./generate-jest-workspace-mapper.cjs');

/**
 * Builds a fixture repo under a temp directory: a root package.json with
 * `workspaces`, one `packages/<name>` directory per entry in `packages`
 * (each with its own package.json `dependencies` and a `src/index.ts`), and
 * one `apps/consumer` directory whose package.json `dependencies` is
 * `consumerDependencies`. Returns the `apps/consumer` absolute path, the
 * directory `generateJestWorkspaceMapper` is called with.
 */
function fixtureRepo(packages, consumerDependencies) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-mapper-fixture-'));
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture-root', workspaces: ['apps/*', 'packages/*'] }),
  );

  for (const [name, dependencies] of Object.entries(packages)) {
    const dir = path.join(root, 'packages', name.replace('@copalibre/', ''));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, dependencies }));
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export {};\n');
  }

  const consumerDir = path.join(root, 'apps', 'consumer');
  fs.mkdirSync(consumerDir, { recursive: true });
  fs.writeFileSync(
    path.join(consumerDir, 'package.json'),
    JSON.stringify({ name: '@copalibre/consumer', dependencies: consumerDependencies }),
  );

  return consumerDir;
}

test('a direct dependency maps to its src/index.ts', () => {
  const consumerDir = fixtureRepo({ '@copalibre/domain': {} }, { '@copalibre/domain': '*' });
  const mapper = generateJestWorkspaceMapper(consumerDir);
  assert.deepEqual(Object.keys(mapper), ['^@copalibre/domain$']);
  assert.equal(mapper['^@copalibre/domain$'], '<rootDir>/../../packages/domain/src/index.ts');
});

test("a two-level transitive dependency is mapped without being the consumer's own dependency", () => {
  const consumerDir = fixtureRepo(
    {
      '@copalibre/statistics-refold': { '@copalibre/tournament-engine': '*' },
      '@copalibre/tournament-engine': { '@copalibre/rules': '*' },
      '@copalibre/rules': {},
    },
    { '@copalibre/statistics-refold': '*' },
  );
  const mapper = generateJestWorkspaceMapper(consumerDir);
  assert.deepEqual(
    Object.keys(mapper).sort(),
    [
      '^@copalibre/rules$',
      '^@copalibre/statistics-refold$',
      '^@copalibre/tournament-engine$',
    ].sort(),
  );
});

test('a diamond dependency appears exactly once', () => {
  const consumerDir = fixtureRepo(
    {
      '@copalibre/b': { '@copalibre/d': '*' },
      '@copalibre/c': { '@copalibre/d': '*' },
      '@copalibre/d': {},
    },
    { '@copalibre/b': '*', '@copalibre/c': '*' },
  );
  const mapper = generateJestWorkspaceMapper(consumerDir);
  assert.deepEqual(
    Object.keys(mapper).sort(),
    ['^@copalibre/b$', '^@copalibre/c$', '^@copalibre/d$'].sort(),
  );
});

test('a cycle resolves without infinite recursion', () => {
  const consumerDir = fixtureRepo(
    { '@copalibre/a': { '@copalibre/b': '*' }, '@copalibre/b': { '@copalibre/a': '*' } },
    { '@copalibre/a': '*' },
  );
  const mapper = generateJestWorkspaceMapper(consumerDir);
  assert.deepEqual(Object.keys(mapper).sort(), ['^@copalibre/a$', '^@copalibre/b$']);
});

test('a dependency naming a package outside packages/* throws', () => {
  const consumerDir = fixtureRepo({}, { '@copalibre/does-not-exist': '*' });
  assert.throws(() => generateJestWorkspaceMapper(consumerDir), /does-not-exist/);
});

test('a package missing src/index.ts throws', () => {
  const consumerDir = fixtureRepo({ '@copalibre/broken': {} }, { '@copalibre/broken': '*' });
  fs.rmSync(
    path.join(path.dirname(path.dirname(consumerDir)), 'packages', 'broken', 'src', 'index.ts'),
  );
  assert.throws(() => generateJestWorkspaceMapper(consumerDir), /src\/index\.ts/);
});

test('a non-@copalibre dependency is ignored', () => {
  const consumerDir = fixtureRepo({}, { typescript: '^5.0.0' });
  const mapper = generateJestWorkspaceMapper(consumerDir);
  assert.deepEqual(mapper, {});
});
