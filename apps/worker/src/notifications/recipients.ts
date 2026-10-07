import type { Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';

/** The principal id inside an outbox `actor` string (`user:<principalId>`), when it has one. */
export function actorPrincipalId(actor: unknown): string | undefined {
  if (typeof actor !== 'string' || !actor.startsWith('user:')) return undefined;
  const id = actor.slice('user:'.length);
  return id === '' || id === 'unknown' ? undefined : id;
}

/**
 * The addresses an operational notification goes to: every active organization `admin`, plus, when the
 * event belongs to a tournament, the `tournament-admin` assignments scoped to that tournament.
 *
 * The actor is left out (nobody needs an email about what they just did) and an address held through
 * several assignments appears once, compared case-insensitively.
 */
export async function resolveAudience(
  db: Kysely<Database>,
  input: {
    readonly organizationId: string;
    readonly tournamentId?: string;
    readonly actor?: unknown;
  },
): Promise<readonly string[]> {
  const rows = await db
    .selectFrom('organization_role_assignments')
    .select(['email', 'principal_id'])
    .where('organization_id', '=', input.organizationId)
    .where('status', '=', 'active')
    .where('deleted_at', 'is', null)
    .where((eb) => {
      const admin = eb('role', '=', 'admin');
      if (input.tournamentId === undefined) return admin;
      return eb.or([
        admin,
        eb.and([eb('role', '=', 'tournament-admin'), eb('tournament_id', '=', input.tournamentId)]),
      ]);
    })
    .execute();

  const actorId = actorPrincipalId(input.actor);
  const seen = new Set<string>();
  const addresses: string[] = [];
  for (const row of rows) {
    if (actorId !== undefined && row.principal_id === actorId) continue;
    const key = row.email.trim().toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    addresses.push(row.email.trim());
  }
  // Sorted here, not by the database, so the order does not depend on the server's collation.
  return addresses.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en'));
}
