import type { RecordedOutcome, ResultReason, TournamentFormat } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

/**
 * The read side of a stage: what standings and the bracket canvas need.
 *
 * Separate from `CompetitionRepository` because nothing here writes. The write
 * repository guards invariants on every path — a result may not be overwritten,
 * the event log may not be updated — and a read that has to travel through
 * those guards to answer "what happened in this stage" pays for a promise it is
 * not making.
 */

export interface StageRecord {
  readonly stageId: string;
  readonly format: TournamentFormat;
  /**
   * Entrants in fixture order, which is the order they were seeded into round
   * one. The engine never invents seeds and neither does this: the order is the
   * one the draw persisted.
   */
  readonly entrantIds: readonly string[];
  /** Finalized results only. A match in progress has nothing to account for. */
  readonly outcomes: readonly RecordedOutcome[];
  readonly hasGeneratedFixtures: boolean;
  readonly hasRecordedResults: boolean;
  /** The stage configuration's overrides, empty when the stage has none. */
  readonly overrides: Readonly<Record<string, unknown>>;
}

/** A persisted match, positioned so a generated graph can be overlaid on it. */
/** One game of a fixture, in play order. A fixture has more than one only in a series. */
export interface StageSeriesMatchRecord {
  readonly matchId: string;
  /** 1-based play order within the fixture. */
  readonly number: number;
  readonly status: string;
  readonly scores?: readonly (number | undefined)[];
  readonly resultReasons?: readonly (ResultReason | undefined)[];
}

export interface StageMatchRecord {
  /** The fixture's first match — its only one unless the fixture declares a series. */
  readonly matchId: string;
  readonly fixtureId: string;
  readonly round: number;
  /** 1-based position within the round, in fixture order. */
  readonly position: number;
  readonly status: string;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
  readonly scores?: readonly (number | undefined)[];
  readonly resultReasons?: readonly (ResultReason | undefined)[];
  /**
   * Every game of this fixture in play order — one entry for an ordinary fixture, one per game
   * for a series. Present always, so a reader never has to decide whether absence means "not a
   * series" or "not loaded".
   */
  readonly games: readonly StageSeriesMatchRecord[];
}

export class StageReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async stageRecord(stageId: string, groupId?: string): Promise<StageRecord | undefined> {
    const stage = await this.db
      .selectFrom('stages')
      .leftJoin(
        'stage_configurations',
        'stage_configurations.stage_configuration_id',
        'stages.stage_configuration_id',
      )
      .select(['stages.stage_id', 'stages.format', 'stage_configurations.overrides'])
      .where('stages.stage_id', '=', stageId)
      .executeTakeFirst();
    if (!stage) return undefined;

    const matches = await this.matches(stageId, groupId);
    const entrantIds: string[] = [];
    for (const match of matches) {
      for (const entrantId of [match.homeEntrantId, match.awayEntrantId]) {
        if (entrantId !== undefined && !entrantIds.includes(entrantId)) entrantIds.push(entrantId);
      }
    }

    const outcomes = await this.outcomes(stageId, groupId);
    return {
      stageId: stage.stage_id,
      format: stage.format as TournamentFormat,
      entrantIds,
      outcomes,
      hasGeneratedFixtures: matches.length > 0,
      hasRecordedResults: outcomes.length > 0,
      overrides: (stage.overrides as unknown as Record<string, unknown> | null) ?? {},
    };
  }

  /**
   * The stage's crosses, numbered by position within their round.
   *
   * The position is derived from fixture order rather than stored: a stage's
   * fixtures are inserted in one statement, in generation order, so their order
   * *is* the generated bracket's order.
   *
   * One record per fixture, never per match. That distinction is invisible until a fixture
   * declares a series, at which point the difference is the whole story: five games of a
   * best-of-five are one cross at one bracket position, not five crosses occupying positions
   * one to five of a round that only has one. The games themselves ride along in `games`, in
   * play order, and the top-level `matchId`/`status`/`scores` describe the first game — which
   * is the only game for every fixture that declares no series, leaving those byte-identical.
   */
  async matches(stageId: string, groupId?: string): Promise<readonly StageMatchRecord[]> {
    let query = this.db
      .selectFrom('fixtures')
      .leftJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
      .select([
        'fixtures.fixture_id',
        'fixtures.round',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
        'fixtures.created_at',
        'matches.match_id',
        'matches.number',
        'matches.status',
        'matches.result',
      ])
      .where('fixtures.stage_id', '=', stageId);
    if (groupId !== undefined) query = query.where('fixtures.group_id', '=', groupId);
    const rows = await query
      .orderBy('fixtures.round')
      .orderBy('fixtures.created_at')
      .orderBy('fixtures.fixture_id')
      .orderBy('matches.number')
      .execute();

    const byFixture = new Map<string, (typeof rows)[number][]>();
    for (const row of rows) {
      byFixture.set(row.fixture_id, [...(byFixture.get(row.fixture_id) ?? []), row]);
    }

    const positions = new Map<number, number>();
    return [...byFixture.values()].map((fixtureRows) => {
      const first = fixtureRows[0] as (typeof rows)[number];
      const position = (positions.get(first.round) ?? 0) + 1;
      positions.set(first.round, position);

      const games = fixtureRows
        .filter((row) => row.match_id !== null)
        .map((row, index) => ({
          matchId: row.match_id as string,
          number: row.number ?? index + 1,
          status: row.status ?? 'scheduled',
          ...resultFieldsOf(row.result),
        }));

      return {
        matchId: first.match_id ?? first.fixture_id,
        fixtureId: first.fixture_id,
        round: first.round,
        position,
        status: first.status ?? 'scheduled',
        ...(first.home_entrant_id === null ? {} : { homeEntrantId: first.home_entrant_id }),
        ...(first.away_entrant_id === null ? {} : { awayEntrantId: first.away_entrant_id }),
        ...resultFieldsOf(first.result),
        games,
      };
    });
  }

  /** Finalized results as the accounting engine reads them. */
  async outcomes(stageId: string, groupId?: string): Promise<readonly RecordedOutcome[]> {
    let query = this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['matches.match_id', 'matches.result', 'fixtures.fixture_id'])
      .where('fixtures.stage_id', '=', stageId)
      .where('matches.result', 'is not', null);
    if (groupId !== undefined) query = query.where('fixtures.group_id', '=', groupId);
    const rows = await query.orderBy('matches.number').execute();

    return rows.flatMap((row) => {
      const result = row.result as unknown as RecordedOutcome | null;
      if (!result?.sides) return [];
      return [
        {
          matchId: row.match_id,
          fixtureId: row.fixture_id,
          sides: result.sides,
          ...(result.winnerEntrantId === undefined
            ? {}
            : { winnerEntrantId: result.winnerEntrantId }),
        },
      ];
    });
  }
}

/**
 * A side's headline number, for the bracket node.
 *
 * The first declared statistic is the score by convention of the recorder, not
 * by a rule this layer gets to invent — so an absent one reads as absent and
 * the node renders a dash rather than a zero somebody could mistake for a
 * played nil.
 */
function scoresOf(
  sides: readonly { readonly statistics?: Record<string, number> }[],
): readonly (number | undefined)[] {
  return sides.map((side) => {
    const values = Object.values(side.statistics ?? {});
    return values.length === 0 ? undefined : values[0];
  });
}

/**
 * The scoreline fields a persisted result contributes, or nothing at all when there is no
 * result. Written once because every game of a series needs it as much as the cross does.
 */
function resultFieldsOf(raw: unknown): {
  readonly scores?: readonly (number | undefined)[];
  readonly resultReasons?: readonly (ResultReason | undefined)[];
} {
  const result = raw as {
    readonly sides?: readonly {
      readonly statistics?: Record<string, number>;
      readonly resultReason?: ResultReason;
    }[];
  } | null;
  if (result?.sides === undefined) return {};
  return { scores: scoresOf(result.sides), resultReasons: resultReasonsOf(result.sides) };
}

/** Parallel to `scoresOf` — why a side's result is what it is. */
function resultReasonsOf(
  sides: readonly { readonly resultReason?: ResultReason }[],
): readonly (ResultReason | undefined)[] {
  return sides.map((side) => side.resultReason);
}
