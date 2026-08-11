import { loadDefaultModuleCatalogue } from '@copalibre/module-catalogue';
import { createDatabase, databaseConfigFromEnv } from '@copalibre/persistence';
import { seedModuleCatalogue } from './catalogue-seeder.js';

/** Explicit bootstrap role. Application startup and migrations never call it. */
async function main(): Promise<void> {
  const db = createDatabase(databaseConfigFromEnv());
  try {
    const report = await seedModuleCatalogue(db, await loadDefaultModuleCatalogue());
    for (const module of report.modules) {
      process.stdout.write(`${module.status}: ${module.kind} ${module.alias}@${module.version}\n`);
    }
  } finally {
    await db.destroy();
  }
}

void main();
