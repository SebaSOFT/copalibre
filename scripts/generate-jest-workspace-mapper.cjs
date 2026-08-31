const fs = require('node:fs');
const path = require('node:path');

/**
 * Produces a Jest `moduleNameMapper` fragment for every `@copalibre/*` package
 * reachable — directly or transitively, through other workspace packages —
 * from a consuming workspace's own `package.json` `dependencies`.
 *
 * Computed fresh every time a `jest.config.cjs` loads, not generated and
 * committed: the mapper can never drift from the real dependency graph
 * because it *is* the real dependency graph, read live (the design
 * decision followed the same "a transitive workspace import has no
 * mapper entry" bug twice via two separately hand-typed fixes).
 *
 * @param {string} consumingDir - the directory containing the calling
 *   jest.config.cjs (pass `__dirname`).
 * @returns {Record<string, string>}
 */
function generateJestWorkspaceMapper(consumingDir) {
  const repoRoot = findRepoRoot(consumingDir);
  const index = indexPackages(path.join(repoRoot, 'packages'));

  const consumingPackageJson = readPackageJson(consumingDir);
  const mapper = {};
  const visited = new Set();
  const queue = [...copalibreDependencyNames(consumingPackageJson)];

  while (queue.length > 0) {
    const name = queue.shift();
    if (visited.has(name)) continue;
    visited.add(name);

    const packageDir = index.get(name);
    if (packageDir === undefined) {
      throw new Error(
        `generate-jest-workspace-mapper: "${name}" is a dependency of a workspace under ` +
          `${consumingDir}, but no packages/*/package.json declares that name. Every ` +
          '@copalibre/* dependency must resolve to a package under packages/ (apps/* are ' +
          'never depended on by another workspace).',
      );
    }

    const entryPoint = path.join(packageDir, 'src', 'index.ts');
    if (!fs.existsSync(entryPoint)) {
      throw new Error(
        `generate-jest-workspace-mapper: "${name}" (${packageDir}) has no src/index.ts. Every ` +
          'workspace package this generator maps must have one — the convention every hand-' +
          'written jest.config.cjs mapper already assumed.',
      );
    }

    const relative = toPosixRelative(consumingDir, entryPoint);
    mapper[`^${escapeRegExp(name)}$`] = `<rootDir>/${relative}`;

    const dependencyPackageJson = readPackageJson(packageDir);
    for (const dependencyName of copalibreDependencyNames(dependencyPackageJson)) {
      if (!visited.has(dependencyName)) queue.push(dependencyName);
    }
  }

  return mapper;
}

/** Walks up from `startDir` to the nearest ancestor declaring `workspaces`. */
function findRepoRoot(startDir) {
  let current = startDir;
  for (;;) {
    const candidate = path.join(current, 'package.json');
    if (fs.existsSync(candidate)) {
      const parsed = readPackageJson(current);
      if (parsed.workspaces !== undefined) return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        `generate-jest-workspace-mapper: no ancestor of ${startDir} declares a "workspaces" ` +
          'field in package.json.',
      );
    }
    current = parent;
  }
}

/** Maps every packages/*'s declared name to its absolute directory. */
function indexPackages(packagesDir) {
  const index = new Map();
  if (!fs.existsSync(packagesDir)) return index;
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageDir = path.join(packagesDir, entry.name);
    const packageJsonPath = path.join(packageDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) continue;
    const parsed = readPackageJson(packageDir);
    if (typeof parsed.name === 'string') index.set(parsed.name, packageDir);
  }
  return index;
}

function readPackageJson(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
}

function copalibreDependencyNames(packageJson) {
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  return Object.keys(dependencies).filter((name) => name.startsWith('@copalibre/'));
}

function toPosixRelative(fromDir, toFile) {
  return path.relative(fromDir, toFile).split(path.sep).join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = generateJestWorkspaceMapper;
