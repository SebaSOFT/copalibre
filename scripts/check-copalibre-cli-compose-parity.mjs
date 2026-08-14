import { existsSync, readFileSync } from 'node:fs';

/**
 * `apps/copalibre`'s build (`scripts/build-assets.mjs`) copies the root
 * `docker-compose.yml`/`docker-compose.module-dev.yml` into
 * `dist/assets/` byte-for-byte, so the embedded copy `copalibre init`
 * writes can never hand-drift from the canonical root files (0084). Unlike
 * `check-helm-compose-parity.mjs` (two independently hand-authored files
 * that really can disagree), a `copyFile` cannot introduce content drift —
 * what this guards against is a *stale* build artifact: `dist/assets/`
 * committed or cached from before a later edit to the root file.
 */

/**
 * @param {string} expected
 * @param {string} actual
 */
export function matches(expected, actual) {
  return expected === actual;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pairs = [
    [
      'docker-compose.yml',
      '../docker-compose.yml',
      '../apps/copalibre/dist/assets/docker-compose.yml',
    ],
    [
      'docker-compose.module-dev.yml',
      '../docker-compose.module-dev.yml',
      '../apps/copalibre/dist/assets/docker-compose.module-dev.yml',
    ],
  ];

  const problems = [];
  for (const [name, rootRelative, assetRelative] of pairs) {
    const assetUrl = new URL(assetRelative, import.meta.url);
    if (!existsSync(assetUrl)) {
      problems.push(
        `${name}: apps/copalibre/dist/assets/${name} does not exist — run ` +
          '"yarn workspace @copalibre/copalibre run build" first',
      );
      continue;
    }
    const expected = readFileSync(new URL(rootRelative, import.meta.url), 'utf8');
    const actual = readFileSync(assetUrl, 'utf8');
    if (!matches(expected, actual)) {
      problems.push(
        `${name}: apps/copalibre/dist/assets/${name} is stale relative to the root file`,
      );
    }
  }

  if (problems.length === 0) {
    process.stdout.write('apps/copalibre/dist/assets matches the root compose files.\n');
  } else {
    process.stderr.write(
      `CLI compose asset parity check failed:\n${problems.map((p) => `  ${p}`).join('\n')}\n`,
    );
    process.exit(1);
  }
}
