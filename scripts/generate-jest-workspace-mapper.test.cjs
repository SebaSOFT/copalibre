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

/**
 * The package names an exact-match key names. Each package contributes two
 * entries — `^name$` and `^name/(.*)$` for its `exports` subpaths — and every
 * test below is about which packages are reached, not about that shape.
 */
function mappedPackages(mapper) {
  return Object.keys(mapper)
    .filter((key) => key.endsWith('$') && !key.includes('(.*)'))
    .map((key) => key.slice(1, -1))
    .sort();
}

test('a direct dependency maps to its src/index.ts', () => {
  const consumerDir = fixtureRepo({ '@copalibre/domain': {} }, { '@copalibre/domain': '*' });
  const mapper = generateJestWorkspaceMapper(consumerDir);
  assert.deepEqual(mappedPackages(mapper), ['@copalibre/domain']);
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
  assert.deepEqual(mappedPackages(mapper), [
    '@copalibre/rules',
    '@copalibre/statistics-refold',
    '@copalibre/tournament-engine',
  ]);
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
  assert.deepEqual(mappedPackages(mapper), ['@copalibre/b', '@copalibre/c', '@copalibre/d']);
});

test('a cycle resolves without infinite recursion', () => {
  const consumerDir = fixtureRepo(
    { '@copalibre/a': { '@copalibre/b': '*' }, '@copalibre/b': { '@copalibre/a': '*' } },
    { '@copalibre/a': '*' },
  );
  const mapper = generateJestWorkspaceMapper(consumerDir);
  assert.deepEqual(mappedPackages(mapper), ['@copalibre/a', '@copalibre/b']);
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

test("a package subpath maps to that subpath's own index.ts", () => {
  // `@copalibre/domain/import-export` exists so `csv-parse`/`csv-stringify` —
  // which read `Buffer` at module scope — stay out of the barrel every browser
  // file imports. Jest resolves through this mapper rather than through the
  // package's `exports`, so without a subpath entry that import fails in tests
  // while working everywhere else.
  const consumerDir = fixtureRepo({ '@copalibre/a': {} }, { '@copalibre/a': '*' });
  const mapper = generateJestWorkspaceMapper(consumerDir);
  const subpathKey = Object.keys(mapper).find((key) => key.includes('(.*)'));
  assert.ok(subpathKey, 'expected a subpath mapper entry');
  assert.equal(subpathKey, '^@copalibre/a/(.*)$');
  assert.match(mapper[subpathKey], /packages\/a\/src\/\$1\/index\.ts$/);
});
