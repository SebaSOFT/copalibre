import {
  createDatabase,
  databaseConfigFromEnv,
  EXPECTED_SCHEMA_VERSION,
  isSchemaReady,
  readAppliedSchemaVersion,
} from '@copalibre/persistence';

export interface ReadinessReport {
  readonly ready: boolean;
  readonly expectedSchemaVersion: string;
  readonly appliedSchemaVersion: string | null;
  readonly reason?: string;
}

/**
 * Refuses to report ready against an unmigrated or stale database, so an
 * operator who skips `copalibre migrate` gets a failing readiness probe instead
 * of a half-working API, not deferred to a later phase.
 */
export async function checkReadiness(connectionString?: string): Promise<ReadinessReport> {
  const config = connectionString ? { connectionString } : databaseConfigFromEnv();
  const db = createDatabase(config);
  try {
    const applied = await readAppliedSchemaVersion(db);
    const ready = await isSchemaReady(db);
    return {
      ready,
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      appliedSchemaVersion: applied,
      reason: ready
        ? undefined
        : `database schema is ${applied ?? 'unmigrated'}; run "copalibre migrate"`,
    };
  } finally {
    await db.destroy();
  }
}
