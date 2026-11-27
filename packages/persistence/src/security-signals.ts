import type { Kysely } from 'kysely';
import { newId } from './ids.js';
import type { Database } from './schema.js';
import { SYSTEM_ORGANIZATION } from './relay/scheduled-jobs.js';

/**
 * Suspicious-activity signals read from the audit log.
 *
 * The API's exception filter already records every 401 and 403 as an
 * `authorization.refused` entry naming the actor (a principal, or
 * `unauthenticated`) and the method and path, never a credential or a body.
 * A burst of those from one actor is the signal: repeated failed sign-ins,
 * a stolen token probing admin routes, a script walking organizations it
 * does not belong to.
 */

export interface RefusalBurst {
  /** `user:<principal>` or `unauthenticated`. */
  readonly actor: string;
  readonly refusals: number;
  /** The most refused paths, query strings removed, most frequent first. */
  readonly topPaths: readonly string[];
}

export const SECURITY_ALERT_ACTION = 'security.alert-raised';
const TOP_PATHS = 5;
const PATH_SAMPLE = 500;

function pathOf(previousState: unknown): string | undefined {
  const state = typeof previousState === 'string' ? safeJson(previousState) : previousState;
  if (!state || typeof state !== 'object') return undefined;
  const path = (state as { path?: unknown }).path;
  const method = (state as { method?: unknown }).method;
  if (typeof path !== 'string') return undefined;
  const bare = path.split('?')[0] ?? path;
  return typeof method === 'string' ? `${method} ${bare}` : bare;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Actors refused at least `threshold` times since `since`, most refused first. */
export async function refusalBursts(
  db: Kysely<Database>,
  options: { readonly since: Date; readonly threshold: number },
): Promise<readonly RefusalBurst[]> {
  const groups = await db
    .selectFrom('audit_log')
    .select(['actor', (eb) => eb.fn.countAll<number | string>().as('refusals')])
    .where('action', '=', 'authorization.refused')
    .where('occurred_at', '>=', options.since)
    .groupBy('actor')
    .having((eb) => eb.fn.countAll(), '>=', options.threshold)
    .execute();

  const bursts: RefusalBurst[] = [];
  for (const group of groups) {
    const rows = await db
      .selectFrom('audit_log')
      .select('previous_state')
      .where('action', '=', 'authorization.refused')
      .where('actor', '=', group.actor)
      .where('occurred_at', '>=', options.since)
      .orderBy('occurred_at', 'desc')
      .limit(PATH_SAMPLE)
      .execute();
    const tally = new Map<string, number>();
    for (const row of rows) {
      const path = pathOf(row.previous_state);
      if (path) tally.set(path, (tally.get(path) ?? 0) + 1);
    }
    bursts.push({
      actor: group.actor,
      refusals: Number(group.refusals),
      topPaths: [...tally.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, TOP_PATHS)
        .map(([path]) => path),
    });
  }
  return bursts.sort((a, b) => b.refusals - a.refusals || a.actor.localeCompare(b.actor));
}

/** Whether an alert for this actor was already raised since `since`, so one burst alerts once. */
export async function securityAlertRaisedSince(
  db: Kysely<Database>,
  actor: string,
  since: Date,
): Promise<boolean> {
  const row = await db
    .selectFrom('audit_log')
    .select('audit_id')
    .where('action', '=', SECURITY_ALERT_ACTION)
    .where('reason', '=', actor)
    .where('occurred_at', '>=', since)
    .executeTakeFirst();
  return row !== undefined;
}

/** Records that an alert was raised for a burst; the actor goes in `reason`, the counts in the state. */
export async function recordSecurityAlert(
  db: Kysely<Database>,
  burst: RefusalBurst,
  windowMinutes: number,
): Promise<void> {
  await db
    .insertInto('audit_log')
    .values({
      audit_id: newId(),
      organization_id: SYSTEM_ORGANIZATION,
      entity_type: 'installation',
      entity_id: SYSTEM_ORGANIZATION,
      action: SECURITY_ALERT_ACTION,
      actor: 'system:security-watch',
      authorization_context: '',
      previous_state: null,
      resulting_state: JSON.stringify({
        refusals: burst.refusals,
        windowMinutes,
        topPaths: burst.topPaths,
      }),
      reason: burst.actor,
      occurred_at: new Date(),
    })
    .execute();
}
