import { type Entrant } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { toEntrant } from '../../mapping.js';
import type { Database } from '../../schema.js';
import {
  type ParticipantTeamMembership,
  type ParticipantReportedResult,
} from './enrollment-support.js';

/** Participant-facing reads: entrants, memberships, players, teams, clubs and reported results. */
export class ParticipantQueryRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** Entrants owned by one participant, never a whole tournament's registration list. */
  async listParticipantEntrants(
    organizationId: string,
    personId: string,
  ): Promise<readonly Entrant[]> {
    const rows = await this.db
      .selectFrom('entrants')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'entrants.tournament_id')
      .selectAll('entrants')
      .where('tournaments.organization_id', '=', organizationId)
      .where('entrants.person_id', '=', personId)
      .orderBy('entrants.created_at')
      .execute();
    return rows.map(toEntrant);
  }

  /** Team memberships are the participant's readable membership projection. */
  async listParticipantTeamMemberships(
    organizationId: string,
    personId: string,
  ): Promise<readonly ParticipantTeamMembership[]> {
    const rows = await this.db
      .selectFrom('players')
      .innerJoin('teams', 'teams.team_id', 'players.team_id')
      .select([
        'players.player_id as player_id',
        'players.team_id as team_id',
        'players.role as role',
        'teams.name as team_name',
      ])
      .where('players.person_id', '=', personId)
      .where('teams.organization_id', '=', organizationId)
      .orderBy('teams.name')
      .execute();
    return rows.map((row) => ({
      playerId: row.player_id,
      teamId: row.team_id,
      teamName: row.team_name,
      role: row.role,
    }));
  }

  /**
   * Every player row for a set of teams, keyed by team then person.
   *
   * A match roster resolves several entrants at once, and each entrant may
   * carry a dozen players — a lookup per person would be a query per roster
   * member. One query over every team a match's entrants name, grouped in
   * memory, is the batch this and `refold` both need.
   */
  async playersByTeams(
    teamIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly { personId: string; playerId: string; role: string }[]>> {
    if (teamIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('players')
      .select(['team_id', 'person_id', 'player_id', 'role'])
      .where('team_id', 'in', teamIds)
      .execute();

    const byTeam = new Map<string, { personId: string; playerId: string; role: string }[]>();
    for (const row of rows) {
      const forTeam = byTeam.get(row.team_id) ?? [];
      forTeam.push({ personId: row.person_id, playerId: row.player_id, role: row.role });
      byTeam.set(row.team_id, forTeam);
    }
    return byTeam;
  }

  /**
   * The team each of a set of players belongs to — a `player`-grain
   * figure's `actorId` is a `player_id`, and rolling it up to `team`/`club`
   * needs this hop; `listParticipantTeamMemberships` is keyed by person, not
   * by the player row a stored figure already names.
   */
  async teamsOfPlayers(playerIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (playerIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('players')
      .select(['player_id', 'team_id'])
      .where('player_id', 'in', playerIds)
      .execute();

    return new Map(rows.map((row) => [row.player_id, row.team_id]));
  }

  /**
   * The club fielding each of a set of teams, the symmetric read
   * `listParticipantTeamMemberships` does not offer: that method starts from
   * a person, this one starts from the team a fold already resolved.
   */
  async clubsOfTeams(teamIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (teamIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('teams')
      .select(['team_id', 'club_id'])
      .where('team_id', 'in', teamIds)
      .execute();

    const byTeam = new Map<string, string>();
    for (const row of rows) {
      if (row.club_id !== null) byTeam.set(row.team_id, row.club_id);
    }
    return byTeam;
  }

  /** Published match results for this participant's individual registrations. */
  async listParticipantReportedResults(
    organizationId: string,
    personId: string,
  ): Promise<readonly ParticipantReportedResult[]> {
    const entrants = await this.listParticipantEntrants(organizationId, personId);
    const results: ParticipantReportedResult[] = [];
    for (const entrant of entrants) {
      const rows = await this.db
        .selectFrom('fixtures')
        .innerJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
        .select(['matches.match_id', 'matches.status', 'matches.result'])
        .where((eb) =>
          eb.or([
            eb('fixtures.home_entrant_id', '=', entrant.entrantId),
            eb('fixtures.away_entrant_id', '=', entrant.entrantId),
          ]),
        )
        .where('matches.result', 'is not', null)
        .orderBy('matches.created_at')
        .execute();
      results.push(
        ...rows.map((row) => ({
          matchId: row.match_id,
          entrantId: entrant.entrantId,
          status: row.status,
          result: row.result,
        })),
      );
    }
    return results;
  }

  /**
   * Whether this participant is a party to this match — the ownership check a
   * report or dispute submission needs, extracted from
   * `listParticipantReportedResults`'s join so it is a real, reusable check
   * rather than logic that only exists inlined inside a read listing. A
   * roster is match-scoped and does not by itself grant this: the check is
   * "is one of this match's entrants owned by this person," not "is this
   * person named on the roster."
   */
  async isParticipantPartyToMatch(
    organizationId: string,
    personId: string,
    matchId: string,
  ): Promise<boolean> {
    // A fixture's home/away entrant columns are nullable (a bye) — joining
    // both sides at once and requiring both to resolve would wrongly say
    // the present entrant is not a party to a match with a bye on the other
    // side, so this checks against this person's own entrant ids instead.
    const entrants = await this.listParticipantEntrants(organizationId, personId);
    if (entrants.length === 0) return false;
    const entrantIds = entrants.map((entrant) => entrant.entrantId);

    const row = await this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select('matches.match_id')
      .where('matches.match_id', '=', matchId)
      .where((eb) =>
        eb.or([
          eb('fixtures.home_entrant_id', 'in', entrantIds),
          eb('fixtures.away_entrant_id', 'in', entrantIds),
        ]),
      )
      .executeTakeFirst();
    return row !== undefined;
  }
}
