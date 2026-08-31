import { sql, type Kysely } from 'kysely';
import { toIsoString } from '../mapping.js';
import type { Database } from '../schema.js';

/**
 * The distributed lease that keeps one logical scheduler.
 *
 * Every expiry comparison uses `now()` — the database's clock, not a replica's.
 * Two machines whose clocks disagree is precisely the failure this exists to
 * survive, and a lease decided by the caller's `Date.now()` would hand the same
 * lease to two of them.
 *
 * The fencing token is bumped on every acquisition. A replica that paused long
 * enough to lose its lease and then woke up can compare the token it holds
 * against the row and discover it was replaced, instead of enqueueing on the
 * assumption that nothing happened while it was away.
 */

export interface Lease {
  readonly name: string;
  readonly holder: string;
  readonly expiresAt: string;
  readonly fencingToken: number;
}

export class SchedulerLeaseStore {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Takes the lease if it is free or expired, otherwise returns nothing.
   *
   * One statement: an insert with a conditional upsert. Read-then-write would
   * leave a window in which two replicas both read "expired" and both wrote.
   */
  async acquire(input: {
    readonly name: string;
    readonly holder: string;
    readonly ttlSeconds: number;
  }): Promise<Lease | undefined> {
    const { rows } = await sql<LeaseRow>`
      insert into scheduler_leases (lease_name, holder, expires_at, acquired_at, renewed_at, fencing_token)
      values (
        ${input.name},
        ${input.holder},
        now() + make_interval(secs => ${input.ttlSeconds}),
        now(),
        now(),
        1
      )
      on conflict (lease_name) do update
      set holder = excluded.holder,
          expires_at = excluded.expires_at,
          acquired_at = now(),
          renewed_at = now(),
          fencing_token = scheduler_leases.fencing_token + 1
      where scheduler_leases.expires_at < now()
         or scheduler_leases.holder = ${input.holder}
      returning *
    `.execute(this.db);

    const row = rows[0];
    return row ? toLease(row) : undefined;
  }

  /**
   * Extends the lease, and only for the replica that holds it.
   *
   * Returns nothing when somebody else has taken over — which is the signal to
   * stop enqueueing rather than to try harder.
   */
  async renew(input: {
    readonly name: string;
    readonly holder: string;
    readonly ttlSeconds: number;
  }): Promise<Lease | undefined> {
    const { rows } = await sql<LeaseRow>`
      update scheduler_leases
      set expires_at = now() + make_interval(secs => ${input.ttlSeconds}),
          renewed_at = now()
      where lease_name = ${input.name}
        and holder = ${input.holder}
        and expires_at > now()
      returning *
    `.execute(this.db);

    const row = rows[0];
    return row ? toLease(row) : undefined;
  }

  /** Gives the lease up immediately, so a planned shutdown is not a 30s gap. */
  async release(name: string, holder: string): Promise<void> {
    await this.db
      .updateTable('scheduler_leases')
      .set({ expires_at: new Date(0) })
      .where('lease_name', '=', name)
      .where('holder', '=', holder)
      .execute();
  }

  async current(name: string): Promise<Lease | undefined> {
    const row = await this.db
      .selectFrom('scheduler_leases')
      .selectAll()
      .where('lease_name', '=', name)
      .executeTakeFirst();
    return row ? toLease(row as unknown as LeaseRow) : undefined;
  }
}

interface LeaseRow {
  readonly lease_name: string;
  readonly holder: string;
  readonly expires_at: Date;
  readonly fencing_token: string | number;
}

function toLease(row: LeaseRow): Lease {
  return {
    name: row.lease_name,
    holder: row.holder,
    expiresAt: toIsoString(row.expires_at),
    fencingToken: Number(row.fencing_token),
  };
}
