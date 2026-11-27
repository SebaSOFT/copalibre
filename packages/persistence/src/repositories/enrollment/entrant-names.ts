import { abbreviationOf } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { Database } from '../../schema.js';

/** Entrant display names and podium details. */
export class EntrantNameRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Entrant id to display name/abbreviation, for a surface that shows people
   * rather than ids (public overview/live/bracket projections).
   *
   * An entrant's own abbreviation wins in tournament scope; a team or club
   * label remains the fallback for legacy entrants without one.
   * An entrant id this installation does not recognise is simply absent from
   * the returned map — the caller decides what to show for that, this method
   * does not invent a label.
   */
  async resolveEntrantNames(
    entrantIds: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly name: string; readonly abbreviation?: string }>> {
    const names = new Map<string, { name: string; abbreviation?: string }>();
    if (entrantIds.length === 0) return names;

    const entrants = await this.db
      .selectFrom('entrants')
      .select(['entrant_id', 'entrant_kind', 'person_id', 'team_id', 'abbreviation'])
      .where('entrant_id', 'in', entrantIds)
      .execute();

    const personIds = entrants
      .map((entrant) => entrant.person_id)
      .filter((id): id is string => id !== null);
    const teamIds = entrants
      .map((entrant) => entrant.team_id)
      .filter((id): id is string => id !== null);

    const [persons, teams] = await Promise.all([
      personIds.length === 0
        ? []
        : this.db
            .selectFrom('persons')
            .select(['person_id', 'display_name'])
            .where('person_id', 'in', personIds)
            .execute(),
      teamIds.length === 0
        ? []
        : this.db
            .selectFrom('teams')
            .leftJoin('clubs', 'clubs.club_id', 'teams.club_id')
            .select([
              'teams.team_id as team_id',
              'teams.name as name',
              'teams.abbreviation as team_abbreviation',
              'clubs.abbreviation as club_abbreviation',
            ])
            .where('team_id', 'in', teamIds)
            .execute(),
    ]);

    const personById = new Map(persons.map((person) => [person.person_id, person]));
    const teamById = new Map(teams.map((team) => [team.team_id, team]));

    for (const entrant of entrants) {
      if (entrant.entrant_kind === 'team' && entrant.team_id !== null) {
        const team = teamById.get(entrant.team_id);
        if (team) {
          const abbreviation =
            entrant.abbreviation ??
            abbreviationOf(
              { abbreviation: team.team_abbreviation ?? undefined },
              { abbreviation: team.club_abbreviation ?? undefined },
            );
          names.set(entrant.entrant_id, {
            name: team.name,
            ...(abbreviation === undefined ? {} : { abbreviation }),
          });
        }
        continue;
      }
      if (entrant.person_id !== null) {
        const person = personById.get(entrant.person_id);
        if (person) {
          names.set(entrant.entrant_id, {
            name: person.display_name,
            ...(entrant.abbreviation === null ? {} : { abbreviation: entrant.abbreviation }),
          });
        }
      }
    }

    return names;
  }

  /**
   * Resolves entrants into display names, abbreviations, club IDs, and emblem
   * object IDs for winner/runner-up podium presentation.
   */
  async resolveEntrantPodiumDetails(entrantIds: readonly string[]): Promise<
    ReadonlyMap<
      string,
      {
        readonly name: string;
        readonly abbreviation?: string;
        readonly clubId?: string;
        readonly clubAlias?: string;
        readonly emblemObjectId?: string;
      }
    >
  > {
    const details = new Map<
      string,
      {
        name: string;
        abbreviation?: string;
        clubId?: string;
        clubAlias?: string;
        emblemObjectId?: string;
      }
    >();
    if (entrantIds.length === 0) return details;

    const entrants = await this.db
      .selectFrom('entrants')
      .select(['entrant_id', 'entrant_kind', 'person_id', 'team_id', 'abbreviation'])
      .where('entrant_id', 'in', entrantIds)
      .execute();

    const personIds = entrants
      .map((entrant) => entrant.person_id)
      .filter((id): id is string => id !== null);
    const teamIds = entrants
      .map((entrant) => entrant.team_id)
      .filter((id): id is string => id !== null);

    const [persons, teams] = await Promise.all([
      personIds.length === 0
        ? []
        : this.db
            .selectFrom('persons')
            .select(['person_id', 'display_name'])
            .where('person_id', 'in', personIds)
            .execute(),
      teamIds.length === 0
        ? []
        : this.db
            .selectFrom('teams')
            .leftJoin('clubs', 'clubs.club_id', 'teams.club_id')
            .select([
              'teams.team_id as team_id',
              'teams.name as name',
              'teams.abbreviation as team_abbreviation',
              'teams.club_id as club_id',
              'clubs.alias as club_alias',
              'clubs.abbreviation as club_abbreviation',
              'clubs.emblem_object_id as emblem_object_id',
            ])
            .where('team_id', 'in', teamIds)
            .execute(),
    ]);

    const personById = new Map(persons.map((person) => [person.person_id, person]));
    const teamById = new Map(teams.map((team) => [team.team_id, team]));

    for (const entrant of entrants) {
      if (entrant.entrant_kind === 'team' && entrant.team_id !== null) {
        const team = teamById.get(entrant.team_id);
        if (team) {
          const abbreviation =
            entrant.abbreviation ??
            abbreviationOf(
              { abbreviation: team.team_abbreviation ?? undefined },
              { abbreviation: team.club_abbreviation ?? undefined },
            );
          details.set(entrant.entrant_id, {
            name: team.name,
            ...(abbreviation === undefined ? {} : { abbreviation }),
            ...(team.club_id === null ? {} : { clubId: team.club_id }),
            ...(team.club_alias === null || team.club_alias === ''
              ? {}
              : { clubAlias: team.club_alias }),
            ...(team.emblem_object_id === null ? {} : { emblemObjectId: team.emblem_object_id }),
          });
        }
        continue;
      }
      if (entrant.person_id !== null) {
        const person = personById.get(entrant.person_id);
        if (person) {
          details.set(entrant.entrant_id, {
            name: person.display_name,
            ...(entrant.abbreviation === null ? {} : { abbreviation: entrant.abbreviation }),
          });
        }
      }
    }

    return details;
  }
}
