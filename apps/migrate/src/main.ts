import {
  createDatabase,
  databaseConfigFromEnv,
  EXPECTED_SCHEMA_VERSION,
  migrateDownOneStep,
  migrateToLatest,
  readAppliedSchemaVersion,
} from '@copalibre/persistence';

/**
 * The one controlled migration entrypoint ("one controlled job per release" —
 * architecture doc, process-roles table). Never invoked automatically from
 * `api`/`worker` startup.
 *
 *   copalibre migrate          -> apply pending migrations
 *   copalibre migrate --down   -> revert exactly one step
 */
async function main(): Promise<void> {
  const down = process.argv.includes('--down');
  const db = createDatabase(databaseConfigFromEnv());

  try {
    const before = await readAppliedSchemaVersion(db);
    const { error, results } = down ? await migrateDownOneStep(db) : await migrateToLatest(db);

    for (const result of results ?? []) {
      const verb = result.status === 'Success' ? 'applied' : result.status.toLowerCase();
      process.stdout.write(`${verb}: ${result.migrationName}\n`);
    }

    if (error) {
      process.stderr.write(`migration failed: ${String(error)}\n`);
      process.exitCode = 1;
      return;
    }

    const after = await readAppliedSchemaVersion(db);
    if (before === after) {
      process.stdout.write(`no pending migrations; schema at ${after ?? 'none'}\n`);
    } else {
      process.stdout.write(`schema version: ${after ?? 'none'}\n`);
    }
    if (!down && after !== EXPECTED_SCHEMA_VERSION) {
      process.stderr.write(`expected schema ${EXPECTED_SCHEMA_VERSION}, got ${after ?? 'none'}\n`);
      process.exitCode = 1;
    }
  } finally {
    await db.destroy();
  }
}

void main();
