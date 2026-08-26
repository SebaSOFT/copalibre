import type { ActorGranularity, CollectorMeasure, CompetitionGranularity } from '@copalibre/domain';
import {
  EnrollmentRepository,
  StatisticRepository,
  type Database,
  type ReadTotal,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { readRolledUp, type ActorMembership } from './rollup.js';

export interface RollupQuery {
  readonly organizationId: string;
  readonly collectorCode: string;
  readonly measure: CollectorMeasure;
  /** The collector's own declared (finest) granularity — where the rows are actually stored. */
  readonly storedGranularity: {
    readonly actor: ActorGranularity;
    readonly competition: CompetitionGranularity;
  };
  /** What the caller wants to read at; a granularity omitted here keeps the stored one. */
  readonly to: { readonly actor?: ActorGranularity; readonly competition?: CompetitionGranularity };
  readonly competitionId?: string;
  readonly actorId?: string;
}

/**
 * Reads a total above a collector's stored grain: loads the
 * finest-grain rows and rolls them up with `aggregateTo`, resolved by real
 * `EnrollmentRepository` membership — application-code aggregation over a
 * small, membership-bounded row set, not a second SQL join.
 */
export async function readRolledUpTotals(
  db: Kysely<Database>,
  query: RollupQuery,
): Promise<readonly ReadTotal[]> {
  const statistics = new StatisticRepository(db);
  const enrollment = new EnrollmentRepository(db);

  const figures = await statistics.rawFigures({
    organizationId: query.organizationId,
    collectorCode: query.collectorCode,
    actorGranularity: query.storedGranularity.actor,
    competitionGranularity: query.storedGranularity.competition,
    ...(query.competitionId === undefined ? {} : { competitionId: query.competitionId }),
    ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
  });

  const membership = await buildMembership(enrollment, query.organizationId, figures);
  return readRolledUp(figures, query.measure, query.to, membership);
}

async function buildMembership(
  enrollment: EnrollmentRepository,
  organizationId: string,
  figures: readonly { actorGranularity: ActorGranularity; actorId: string }[],
): Promise<ActorMembership> {
  const personIds = [
    ...new Set(
      figures
        .filter((figure) => figure.actorGranularity === 'person')
        .map((figure) => figure.actorId),
    ),
  ];
  const playerIds = [
    ...new Set(
      figures
        .filter((figure) => figure.actorGranularity === 'player')
        .map((figure) => figure.actorId),
    ),
  ];
  const directTeamIds = [
    ...new Set(
      figures
        .filter((figure) => figure.actorGranularity === 'team')
        .map((figure) => figure.actorId),
    ),
  ];

  const [teamOfPersonEntries, teamOfPlayer] = await Promise.all([
    Promise.all(
      personIds.map(async (personId): Promise<readonly [string, string] | undefined> => {
        // Several team memberships are a real possibility one stored figure
        // cannot disambiguate on its own; the first, ordered by team name, is
        // a documented limitation (design.md's Decisions section), not a
        // claim of correctness for a person who changed teams mid-season.
        const memberships = await enrollment.listParticipantTeamMemberships(
          organizationId,
          personId,
        );
        const first = memberships[0];
        return first ? ([personId, first.teamId] as const) : undefined;
      }),
    ),
    enrollment.teamsOfPlayers(playerIds),
  ]);
  const teamOfPerson = new Map(
    teamOfPersonEntries.filter((entry): entry is readonly [string, string] => entry !== undefined),
  );

  const teamIds = [
    ...new Set([...teamOfPerson.values(), ...teamOfPlayer.values(), ...directTeamIds]),
  ];
  const clubOfTeam = await enrollment.clubsOfTeams(teamIds);

  return { teamOfPerson, teamOfPlayer, clubOfTeam };
}
