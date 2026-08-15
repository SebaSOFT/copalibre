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
export interface StageMatchRecord {
  readonly matchId: string;
  readonly round: number;
  /** 1-based position within the round, in fixture order. */
  readonly position: number;
  readonly status: string;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
  readonly scores?: readonly (number | undefined)[];
  readonly resultReasons?: readonly (ResultReason | undefined)[];
}

export class StageReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async stageRecord(stageId: string): Promise<StageRecord | undefined> {
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

    const matches = await this.matches(stageId);
    const entrantIds: string[] = [];
    for (const match of matches) {
      for (const entrantId of [match.homeEntrantId, match.awayEntrantId]) {
        if (entrantId !== undefined && !entrantIds.includes(entrantId)) entrantIds.push(entrantId);
      }
    }

    const outcomes = await this.outcomes(stageId);
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
   * The stage's matches, numbered by position within their round.
   *
   * The position is derived from fixture order rather than stored: a stage's
   * fixtures are inserted in one statement, in generation order, so their order
   * *is* the generated bracket's order.
   */
  async matches(stageId: string): Promise<readonly StageMatchRecord[]> {
    const rows = await this.db
      .selectFrom('fixtures')
      .leftJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
      .select([
        'fixtures.fixture_id',
        'fixtures.round',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
        'fixtures.created_at',
        'matches.match_id',
        'matches.status',
        'matches.result',
      ])
      .where('fixtures.stage_id', '=', stageId)
      .orderBy('fixtures.round')
      .orderBy('fixtures.created_at')
      .orderBy('fixtures.fixture_id')
      .execute();

    const positions = new Map<number, number>();
    return rows.map((row) => {
      const position = (positions.get(row.round) ?? 0) + 1;
      positions.set(row.round, position);
      const result = row.result as unknown as {
        readonly sides?: readonly {
          readonly statistics?: Record<string, number>;
          readonly resultReason?: ResultReason;
        }[];
      } | null;

      return {
        matchId: row.match_id ?? row.fixture_id,
        round: row.round,
        position,
        status: row.status ?? 'scheduled',
        ...(row.home_entrant_id === null ? {} : { homeEntrantId: row.home_entrant_id }),
        ...(row.away_entrant_id === null ? {} : { awayEntrantId: row.away_entrant_id }),
        ...(result?.sides === undefined ? {} : { scores: scoresOf(result.sides) }),
        ...(result?.sides === undefined ? {} : { resultReasons: resultReasonsOf(result.sides) }),
      };
    });
  }

  /** Finalized results as the accounting engine reads them. */
  async outcomes(stageId: string): Promise<readonly RecordedOutcome[]> {
    const rows = await this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['matches.match_id', 'matches.result'])
      .where('fixtures.stage_id', '=', stageId)
      .where('matches.result', 'is not', null)
      .orderBy('matches.number')
      .execute();

    return rows.flatMap((row) => {
      const result = row.result as unknown as RecordedOutcome | null;
      if (!result?.sides) return [];
      return [
        {
          matchId: row.match_id,
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

/** Parallel to `scoresOf` — why a side's result is what it is. */
function resultReasonsOf(
  sides: readonly { readonly resultReason?: ResultReason }[],
): readonly (ResultReason | undefined)[] {
  return sides.map((side) => side.resultReason);
}
