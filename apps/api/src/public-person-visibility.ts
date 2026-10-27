import type { Tournament } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { Database } from '@copalibre/persistence';

export interface PublicPersonVisibility {
  readonly hiddenAtRequest: boolean;
  readonly publicProfileAvailable: boolean;
  readonly nationalityVisible: boolean;
}

export function youthProfilesSuppressed(tournament: Tournament): boolean {
  return tournament.includesMinors === true && tournament.showYouthProfiles !== true;
}

export function personVisibility(
  tournament: Tournament,
  hiddenFromPublic = false,
): PublicPersonVisibility {
  const hiddenAtRequest = hiddenFromPublic;
  const publicProfileAvailable = !hiddenAtRequest && !youthProfilesSuppressed(tournament);
  return {
    hiddenAtRequest,
    publicProfileAvailable,
    nationalityVisible: publicProfileAvailable,
  };
}

export async function personVisibilityById(
  db: Kysely<Database>,
  tournament: Tournament,
  personIds: readonly string[],
): Promise<ReadonlyMap<string, PublicPersonVisibility>> {
  const uniqueIds = [...new Set(personIds)];
  if (uniqueIds.length === 0) return new Map();

  const rows = await db
    .selectFrom('persons')
    .select(['person_id', 'hidden_from_public'])
    .where('person_id', 'in', uniqueIds)
    .execute();

  return new Map(
    rows.map((row) => [
      row.person_id,
      personVisibility(tournament, Boolean(row.hidden_from_public)),
    ]),
  );
}

export async function entrantVisibilityById(
  db: Kysely<Database>,
  tournament: Tournament,
  entrantIds: readonly string[],
): Promise<ReadonlyMap<string, PublicPersonVisibility>> {
  const uniqueIds = [...new Set(entrantIds)];
  if (uniqueIds.length === 0) return new Map();

  const rows = await db
    .selectFrom('entrants')
    .select(['entrant_id', 'person_id'])
    .where('tournament_id', '=', tournament.tournamentId)
    .where('entrant_id', 'in', uniqueIds)
    .execute();

  const personIds = rows.flatMap((row) => (row.person_id === null ? [] : [row.person_id]));
  const visibilityByPersonId = await personVisibilityById(db, tournament, personIds);
  const defaultVisibility = personVisibility(tournament);
  return new Map(
    rows.flatMap((row) =>
      row.person_id === null
        ? []
        : [[row.entrant_id, visibilityByPersonId.get(row.person_id) ?? defaultVisibility] as const],
    ),
  );
}
