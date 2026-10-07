import { datasetDirectory, listDatasetAliases } from './datasets.js';
import { validateDatasetDirectory } from './validate.js';

/** `yarn workspace @copalibre/demo-datasets validate [alias...]`: validates committed datasets. */
async function main(): Promise<number> {
  const requested = process.argv.slice(2);
  const aliases = requested.length > 0 ? requested : await listDatasetAliases();
  let failed = false;
  for (const alias of aliases) {
    const issues = await validateDatasetDirectory(datasetDirectory(alias));
    if (issues.length === 0) {
      process.stdout.write(`ok: ${alias}\n`);
      continue;
    }
    failed = true;
    for (const issue of issues) {
      process.stderr.write(`${alias}: ${issue.file} ${issue.path} ${issue.message}\n`);
    }
  }
  return failed ? 1 : 0;
}

process.exitCode = await main();
