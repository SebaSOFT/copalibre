import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validateModulePackage } from '@copalibre/module-distribution';

/**
 * Runs the identical validation `copalibre module add` runs, against every
 * module directory in a checked-out module repository — the reusable
 * `module-validation.yml` workflow calls this against a pull request's
 * content, and
 * `k8s`-unrelated `ci.yml`'s `module-validation` job (task 8.1) calls it
 * against the reference repository's fixtures on every PR to this repo, so
 * a core change that breaks the module contract fails here rather than in
 * the community repository.
 */
async function main() {
  const repositoryDirectory = process.argv[2];
  if (!repositoryDirectory) {
    console.error(
      'Usage: node validate-module-repository.mjs <path-to-checked-out-module-repository>',
    );
    process.exitCode = 1;
    return;
  }

  const runningCopalibreVersion = process.env.COPALIBRE_VERSION ?? '0.0.0';
  const moduleDirectories = [
    ...(await listModuleDirectories(join(repositoryDirectory, 'disciplines'))),
    ...(await listModuleDirectories(join(repositoryDirectory, 'profiles'))),
  ];

  if (moduleDirectories.length === 0) {
    console.error(
      `No module directories found under ${repositoryDirectory} (disciplines/*, profiles/*)`,
    );
    process.exitCode = 1;
    return;
  }

  let ok = true;
  for (const directory of moduleDirectories) {
    const result = await validateModulePackage(directory, { runningCopalibreVersion });
    if (result.ok) {
      console.log(
        `PASS ${directory} — ${result.value.manifest.alias}@${result.value.manifest.version}`,
      );
    } else {
      ok = false;
      console.log(`FAIL ${directory}`);
      for (const failure of result.failures) {
        console.log(
          `  [${failure.stage}]${failure.field ? ` (${failure.field})` : ''} ${failure.message}`,
        );
      }
    }
  }

  process.exitCode = ok ? 0 : 1;
}

async function listModuleDirectories(categoryDirectory) {
  let entries;
  try {
    entries = await readdir(categoryDirectory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(categoryDirectory, entry.name));
}

await main();
