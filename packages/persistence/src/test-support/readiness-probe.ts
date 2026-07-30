import { createDatabase } from '../database.js';
import {
  EXPECTED_SCHEMA_VERSION,
  isSchemaReady,
  readAppliedSchemaVersion,
} from '../migrations/index.js';

/**
 * Mirrors what `apps/api`'s readiness endpoint does, using only this package's
 * primitives — `packages/persistence` tests must not import from `apps/*`.
 * The shape is identical to apps/api's ReadinessReport, so a drift between the
 * two would surface here.
 */
export interface ReadinessProbeResult {
  readonly ready: boolean;
  readonly expectedSchemaVersion: string;
  readonly appliedSchemaVersion: string | null;
  readonly reason?: string;
}

export async function checkReadinessAgainst(
  connectionString: string,
): Promise<ReadinessProbeResult> {
  const db = createDatabase({ connectionString, maxConnections: 2 });
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
