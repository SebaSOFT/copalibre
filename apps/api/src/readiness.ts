import {
  createDatabase,
  databaseConfigFromEnv,
  EXPECTED_SCHEMA_VERSION,
  isSchemaReady,
  readAppliedSchemaVersion,
} from '@copalibre/persistence';
import { SESSION_COOKIE_SECURE_ENV, sessionCookieConfigFromEnv } from '@copalibre/auth';

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
  const cookieProblem = sessionCookieProblem(process.env);
  if (cookieProblem !== undefined) {
    return {
      ready: false,
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      appliedSchemaVersion: null,
      reason: cookieProblem,
    };
  }
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

/**
 * An `https` public URL with `Secure` cookies turned off silently drops the
 * session cookie's transport protection, so the API refuses to report ready.
 * The opposite mismatch makes sign-in fail visibly and is a `doctor` warning.
 */
export function sessionCookieProblem(env: NodeJS.ProcessEnv): string | undefined {
  const { secure } = sessionCookieConfigFromEnv(env);
  const appUrl = env.COPALIBRE_APP_URL?.trim();
  if (secure || !appUrl?.toLowerCase().startsWith('https:')) return undefined;
  return `${SESSION_COOKIE_SECURE_ENV}=false with an https COPALIBRE_APP_URL; set it to true`;
}
