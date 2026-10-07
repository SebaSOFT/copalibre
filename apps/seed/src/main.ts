import { loadDefaultModuleCatalogue } from '@copalibre/module-catalogue';
import { listDatasetAliases, readDataset } from '@copalibre/demo-datasets';
import { createObjectStorageAdapter, objectStorageConfigFromEnv } from '@copalibre/object-storage';
import { createDatabase, databaseConfigFromEnv } from '@copalibre/persistence';
import { parseSeedArguments } from './arguments.js';
import { seedModuleCatalogue } from './catalogue-seeder.js';
import { DemoDatasetError, loadDemoDatasetByAlias } from './demo-loader.js';

/** Explicit bootstrap role. Application startup and migrations never call it. */
async function main(): Promise<number> {
  const command = parseSeedArguments(process.argv.slice(2));
  if (command.kind === 'invalid') {
    process.stderr.write(`${command.message}\n`);
    return 2;
  }
  if (command.kind === 'demo-list') {
    for (const alias of await listDatasetAliases()) {
      process.stdout.write(`${alias}\t${(await readDataset(alias)).name}\n`);
    }
    return 0;
  }

  const db = createDatabase(databaseConfigFromEnv());
  const storage = createObjectStorageAdapter(objectStorageConfigFromEnv(process.env));
  try {
    if (command.kind === 'demo-load') {
      const report = await loadDemoDatasetByAlias(
        db,
        storage,
        command.alias,
        undefined,
        (message) => process.stdout.write(`  ${message}\n`),
      );
      process.stdout.write(`${report.status}: demo dataset ${report.dataset}\n`);
      if (report.status === 'installed') {
        const { counts } = report;
        process.stdout.write(
          `  ${counts.clubs} clubs, ${counts.players} players, ${counts.fixtures} games ` +
            `(${counts.goalEvents} goals), ${counts.venues} venues, ${counts.emblems} emblems\n`,
        );
      }
      return 0;
    }
    const report = await seedModuleCatalogue(db, await loadDefaultModuleCatalogue(), storage);
    for (const module of report.modules) {
      process.stdout.write(`${module.status}: ${module.kind} ${module.alias}@${module.version}\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof DemoDatasetError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  } finally {
    await db.destroy();
  }
}

process.exitCode = await main();
