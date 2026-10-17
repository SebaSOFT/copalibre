import type { StageMatchRecord, Database, FixtureGraphSlotSource } from '@copalibre/persistence';
import { CompetitionRepository, StageReadModel } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type {
  FixtureSideSourceDto,
  FixtureSourcesResponse,
  QualifierLabelDto,
} from '../dto/fixture-side-source.dto.js';
import { qualifierLabelsOf } from './stage-qualifiers.js';

/** Sources keep their node identity after resolving, so a result never erases the bracket edge. */
export function fixtureSourcesOf(
  record: StageMatchRecord,
  records: readonly StageMatchRecord[],
  qualifierLabels: ReadonlyMap<string, readonly QualifierLabelDto[]> = new Map(),
): FixtureSourcesResponse {
  if (!record.node) return {};
  const sourceOf = (source: FixtureGraphSlotSource): FixtureSideSourceDto | undefined => {
    if (source.kind === 'entrant') return { kind: 'entrant', entrantId: source.entrantId };
    if (source.kind === 'qualifier') {
      const qualifierLabel = qualifierLabels.get(source.promotionPlanId)?.[source.position - 1];
      return {
        kind: 'qualifier',
        promotionPlanId: source.promotionPlanId,
        position: source.position,
        ...(qualifierLabel === undefined ? {} : { qualifierLabel }),
      };
    }
    if (source.kind !== 'winner-of' && source.kind !== 'loser-of') return undefined;
    const previous = records.find((candidate) => candidate.node?.nodeKey === source.matchId);
    if (!previous) throw new Error(`Missing persisted source node ${source.matchId}`);
    return {
      kind: source.kind,
      nodeKey: source.matchId,
      matchId: previous.matchId,
      round: previous.round,
      position: previous.position,
      ...(previous.node?.label === undefined ? {} : { label: previous.node.label }),
    };
  };
  return {
    nodeKey: record.node.nodeKey,
    ...(record.node.branch === undefined ? {} : { branch: record.node.branch }),
    ...(record.node.label === undefined ? {} : { label: record.node.label }),
    homeSource: sourceOf(record.node.sources[0]),
    awaySource: sourceOf(record.node.sources[1]),
  };
}

/** One stage read, indexed by every game so series and single-match projections share the source. */
export async function readFixtureSources(
  db: Kysely<Database>,
  stageId: string,
): Promise<ReadonlyMap<string, FixtureSourcesResponse>> {
  const records = await new StageReadModel(db).matches(stageId);
  const byFixture = await db
    .selectFrom('fixtures')
    .select(['fixture_id', 'zone_id'])
    .where('stage_id', '=', stageId)
    .execute();
  const zoneByFixture = new Map(byFixture.map((row) => [row.fixture_id, row.zone_id]));
  const labels = await qualifierLabelsForRecords(db, records);
  return new Map(
    records.flatMap((record) => {
      const scope = records.filter(
        (candidate) =>
          zoneByFixture.get(candidate.fixtureId) === zoneByFixture.get(record.fixtureId),
      );
      const source = fixtureSourcesOf(record, scope, labels);
      return record.games.map((game) => [game.matchId, source] as const);
    }),
  );
}

export async function readTournamentFixtureSources(
  db: Kysely<Database>,
  tournamentId: string,
): Promise<ReadonlyMap<string, FixtureSourcesResponse>> {
  const stages = await new CompetitionRepository(db).listStagesOfTournament(tournamentId);
  const sources = await Promise.all(stages.map((stage) => readFixtureSources(db, stage.stageId)));
  return new Map(sources.flatMap((source) => [...source]));
}

/** Labels for every promotion plan a qualifier side of the records names. */
export function qualifierLabelsForRecords(
  db: Kysely<Database>,
  records: readonly StageMatchRecord[],
): Promise<ReadonlyMap<string, readonly QualifierLabelDto[]>> {
  return qualifierLabelsOf(
    db,
    records.flatMap((record) =>
      (record.node?.sources ?? []).flatMap((source) =>
        source.kind === 'qualifier' ? [source.promotionPlanId] : [],
      ),
    ),
  );
}
