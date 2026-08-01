import { sql, type Kysely } from 'kysely';
import { toIsoString } from '../mapping.js';
import type { OutboxRecord } from '../outbox.js';
import type { Database } from '../schema.js';

/**
 * Reading the outbox as a stream (0018-realtime-sse-contract).
 *
 * The same rows the worker consumes, read a second time for a different
 * purpose: the relay asks "what has nobody processed", a subscriber asks "what
 * happened after the point I got to". Both are the outbox, and neither consumes
 * the other's progress — `consumed_at` belongs to the relay, and a stream that
 * respected it would go silent the moment the worker caught up.
 *
 * ## The replay window
 *
 * A client that reconnects inside the window is replayed exactly what it
 * missed. A client whose cursor is older than the window is **told to fetch the
 * projection** rather than replayed from wherever the data happens to start —
 * a partial replay presented as a complete one is a scoreboard that is quietly
 * wrong, which is worse than one that admits it needs to reload.
 */

export interface StreamQuery {
  readonly organizationId: string;
  /** Restricts to one tournament's entities; absent means the organization. */
  readonly tournamentId?: string;
  readonly afterEventId?: string;
  readonly limit?: number;
}

export type ReplayResolution =
  | { readonly kind: 'replay'; readonly events: readonly OutboxRecord[] }
  /** The cursor is older than the window, or names an event nobody has. */
  | { readonly kind: 'expired'; readonly reason: string };

export interface ReplayWindow {
  readonly seconds: number;
  readonly maxEvents: number;
}

/**
 * An hour of history, five hundred events at a time.
 *
 * An hour covers a half-time, a bus tunnel and a flat battery; beyond that a
 * client is better served by the current projection than by replaying a match
 * it half remembers. The batch cap is what keeps one reconnect from reading a
 * season into memory.
 */
export const DEFAULT_REPLAY_WINDOW: ReplayWindow = { seconds: 3600, maxEvents: 500 };

export class EventStreamReader {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly window: ReplayWindow = DEFAULT_REPLAY_WINDOW,
  ) {}

  /**
   * Resolves what a subscriber should receive for its cursor.
   *
   * One function for SSE reconnection and for the long-poll fallback, because
   * two implementations of "replay window" would eventually disagree about
   * which side of it a client is on — and only one of them would be telling the
   * truth.
   */
  async resolve(query: StreamQuery): Promise<ReplayResolution> {
    if (query.afterEventId !== undefined) {
      const cursor = await this.db
        .selectFrom('outbox_events')
        .select(['event_id', 'created_at'])
        .where('event_id', '=', query.afterEventId)
        .executeTakeFirst();

      if (!cursor) {
        return {
          kind: 'expired',
          reason: 'the cursor names an event this installation does not have',
        };
      }

      const age = (Date.now() - new Date(toIsoString(cursor.created_at)).getTime()) / 1000;
      if (age > this.window.seconds) {
        return {
          kind: 'expired',
          reason: `the cursor is ${Math.round(age)}s old and the replay window is ${this.window.seconds}s`,
        };
      }
    }

    return { kind: 'replay', events: await this.after(query) };
  }

  /** Events after the cursor, oldest first. */
  async after(query: StreamQuery): Promise<readonly OutboxRecord[]> {
    const entityIds =
      query.tournamentId === undefined ? undefined : await this.entitiesOf(query.tournamentId);

    // A tournament with nothing in it yet has no entities, and `in ()` is not a
    // query — returning nothing is the honest answer.
    if (entityIds !== undefined && entityIds.length === 0) return [];

    let statement = this.db
      .selectFrom('outbox_events')
      .selectAll()
      .where('organization_id', '=', query.organizationId)
      .orderBy('created_at')
      .orderBy('event_id')
      .limit(Math.min(query.limit ?? this.window.maxEvents, this.window.maxEvents));

    if (entityIds !== undefined) {
      statement = statement.where('entity_id', 'in', entityIds);
    }

    if (query.afterEventId !== undefined) {
      // Strictly after the cursor's position, compared on the same pair the
      // ordering uses so a tie on `created_at` cannot resend an event.
      statement = statement.where(
        sql<boolean>`(created_at, event_id) > (
          select created_at, event_id from outbox_events where event_id = ${query.afterEventId}
        )`,
      );
    }

    const rows = await statement.execute();

    return rows.map((row) => ({
      eventId: row.event_id,
      organizationId: row.organization_id,
      stream: row.stream,
      entityId: row.entity_id,
      eventType: row.event_type,
      projectionVersion: row.projection_version,
      payload: row.payload as Record<string, unknown>,
      createdAt: toIsoString(row.created_at),
      ...(row.consumed_at === null ? {} : { consumedAt: toIsoString(row.consumed_at) }),
    }));
  }

  /**
   * Everything a tournament's events are filed under: the tournament, its
   * seasons, stages, fixtures and matches.
   *
   * Resolved by joining rather than by a `tournament_id` column on the outbox,
   * because that column would have to be set correctly by every publisher
   * forever, and the first one that forgot would drop events off a public
   * stream with nothing failing. If this join ever becomes the bottleneck, the
   * column is the documented escape hatch — denormalisation with a reason,
   * rather than by default.
   */
  async entitiesOf(tournamentId: string): Promise<readonly string[]> {
    const { rows } = await sql<{ entity_id: string }>`
      select ${tournamentId}::text as entity_id
      union
      select season_id::text from seasons where tournament_id = ${tournamentId}
      union
      select stage_id::text from stages
        where season_id in (select season_id from seasons where tournament_id = ${tournamentId})
      union
      select fixture_id::text from fixtures
        where stage_id in (
          select stage_id from stages
          where season_id in (select season_id from seasons where tournament_id = ${tournamentId})
        )
      union
      select match_id::text from matches
        where fixture_id in (
          select fixture_id from fixtures where stage_id in (
            select stage_id from stages
            where season_id in (select season_id from seasons where tournament_id = ${tournamentId})
          )
        )
    `.execute(this.db);

    return rows.map((row) => row.entity_id);
  }

  /** The newest event id, for a subscriber that wants only what happens next. */
  async latestEventId(organizationId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('outbox_events')
      .select('event_id')
      .where('organization_id', '=', organizationId)
      .orderBy('created_at', 'desc')
      .orderBy('event_id', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.event_id;
  }
}
