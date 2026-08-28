import {
  resolveSeries,
  validateSeriesDeclaration,
  type SeriesDeclaration,
  type SeriesResolutionResult,
} from '@copalibre/domain';
import { CompetitionRepository, TournamentRepository, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { ConflictException } from '../http/error-contract.js';

/**
 * Reads a stage's effective series declaration out of the dot-path `OverrideSet` it is
 * stored in.
 *
 * There is no `series` table and no `seriesId`: a series is a fixture carrying more than
 * one match, and its declaration is `series.span` / `series.resolutionClass` /
 * `series.neutralGround` entries in the same override set every other configurable field
 * uses (see `0159`'s authoring step). A stage's own `StageConfiguration.overrides` wins;
 * a stage that declares nothing inherits the tournament ruleset's, which is where the
 * authoring wizard writes a series declared at tournament creation.
 *
 * Returns `undefined` when neither declares one — the overwhelmingly common case, and the
 * one every caller here must leave completely unchanged.
 */
export async function readStageSeries(
  db: Kysely<Database>,
  input: { readonly tournamentId: string; readonly stageId: string },
): Promise<SeriesDeclaration | undefined> {
  const tournaments = new TournamentRepository(db);
  const [stageConfiguration, ruleset] = await Promise.all([
    tournaments.findLatestStageConfiguration(input.stageId),
    tournaments.findLatestRuleset(input.tournamentId),
  ]);

  const overrides =
    seriesOverridesOf(stageConfiguration?.overrides) ?? seriesOverridesOf(ruleset?.overrides);
  if (overrides === undefined) return undefined;

  const validated = validateSeriesDeclaration(overrides);
  return validated.ok ? validated.value : undefined;
}

/**
 * Collapses `series.*` dot-paths back into the declaration shape the domain validates.
 * An override set with no `series.span` declares no series at all — a set carrying only
 * `series.neutralGround` is not half a series, it is none.
 */
function seriesOverridesOf(
  overrides: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (overrides === undefined) return undefined;
  if (overrides['series.span'] === undefined) return undefined;
  return {
    span: overrides['series.span'],
    ...(overrides['series.resolutionClass'] === undefined
      ? {}
      : { resolutionClass: overrides['series.resolutionClass'] }),
    ...(overrides['series.neutralGround'] === undefined
      ? {}
      : { neutralGround: overrides['series.neutralGround'] }),
    ...(overrides['series.standingsAccounting'] === undefined
      ? {}
      : { standingsAccounting: overrides['series.standingsAccounting'] }),
  };
}

/**
 * How many of a series' matches will certainly be played whatever the results are.
 *
 * A best-of-five cannot end before its third game, so games one to three are certain and
 * four and five are contingent on the series still being alive when they come round. Every
 * other class plays its full span — an aggregate tie's second leg is played whatever the
 * first leg did — so nothing is contingent there.
 */
export function guaranteedMatchCount(declaration: SeriesDeclaration): number {
  if (declaration.resolutionClass !== 'best-of') return declaration.span;
  return Math.ceil((declaration.span + 1) / 2);
}

/**
 * Resolves a fixture's series from the matches that fixture holds, so a caller reporting
 * on a series never re-derives what `0158`'s evaluator already decides.
 *
 * Returns `undefined` for a fixture whose two sides are not both known yet: a series
 * between an entrant and a placeholder has nothing to resolve, and reporting it as
 * `undecided` would read as a live 0–0 rather than as a cross nobody has reached.
 */
export function resolveFixtureSeries(input: {
  readonly declaration: SeriesDeclaration;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
  readonly matches: readonly {
    readonly number: number;
    readonly status: string;
    readonly result?: unknown;
  }[];
}): SeriesResolutionResult | undefined {
  const { homeEntrantId, awayEntrantId } = input;
  if (homeEntrantId === undefined || awayEntrantId === undefined) return undefined;
  return resolveSeries({
    declaration: input.declaration,
    sides: [homeEntrantId, awayEntrantId],
    matches: input.matches as Parameters<typeof resolveSeries>[0]['matches'],
  });
}

/**
 * Refuses a console command whose target match a decided series has already anulled, naming
 * the series result that did it.
 *
 * The refusal itself is not new — the engine has always refused a lifecycle command against a
 * `not-required` match, and this changes none of that. What it adds is the *reason*: an
 * operator who spent an outage recording a result for game five, and comes back to a flat
 * "match is not-required", has been told what happened to their work but not why. Naming the
 * series ("Alfa won the best-of-five three–nil at game three") is the difference between a
 * refusal they can act on — perhaps as a correction to an earlier game — and one they can only
 * be baffled by.
 *
 * A conflict rather than a bad request, and deliberately so: nothing about the command is
 * malformed. It is a correct command that lost a race with a result recorded elsewhere, which
 * is exactly what 409 means, and it is what keeps the queued item marked refused-and-retained
 * rather than discarded.
 */
export async function refuseIfAnulledBySeries(
  db: Kysely<Database>,
  input: {
    readonly match: {
      readonly matchId: string;
      readonly fixtureId: string;
      readonly status: string;
    };
    readonly tournamentId: string;
    readonly stageId: string;
  },
): Promise<void> {
  if (input.match.status !== 'not-required') return;

  const declaration = await readStageSeries(db, {
    tournamentId: input.tournamentId,
    stageId: input.stageId,
  });
  const competition = new CompetitionRepository(db);
  const [fixtures, matches] = await Promise.all([
    competition.listFixturesOfStage(input.stageId),
    competition.listMatchesForStage(input.stageId),
  ]);
  const fixture = fixtures.find((candidate) => candidate.fixtureId === input.match.fixtureId);
  const own = matches
    .filter((candidate) => candidate.fixtureId === input.match.fixtureId)
    .sort((a, b) => a.number - b.number);
  const number = own.find((candidate) => candidate.matchId === input.match.matchId)?.number;

  const resolution =
    declaration === undefined || fixture === undefined
      ? undefined
      : resolveFixtureSeries({
          declaration,
          homeEntrantId: fixture.homeEntrantId,
          awayEntrantId: fixture.awayEntrantId,
          matches: own,
        });

  // A match anulled with no series to point at is still refused — it is still a match the
  // record says was never played. It just cannot say more than that.
  const because =
    resolution === undefined
      ? 'because its series was already settled'
      : `because ${resolution.explanation}`;
  const which = number === undefined ? 'This match' : `Game ${number} of the series`;

  throw new ConflictException(
    `${which} will not be played ${because}. Nothing recorded against it can be applied; ` +
      'if the result belongs to an earlier game of the series, raise it as a correction there.',
    { errorCode: 'match-control-conflict' },
  );
}

export interface SeriesCorrectionOutlook {
  readonly before: string;
  readonly after: string;
  readonly decidedAtMatchNumber?: number;
  readonly decidedAtMatchNumberAfter?: number;
  readonly decisionPointMoves: boolean;
  readonly unchanged: boolean;
  readonly becomingNotRequired: readonly number[];
  readonly becomingScheduled: readonly number[];
}

/**
 * What correcting one game would do to its series, resolved twice through the engine's own
 * evaluator: once as the record stands, once with the proposed result substituted in.
 *
 * Two resolutions rather than a rule about which corrections matter, because "does this change
 * the series?" is a question only the resolver can answer — a corrected 2–1 that becomes 3–1
 * changes nothing, and a corrected 2–1 that becomes 1–2 changes everything, and no amount of
 * inspecting the diff of two scorelines tells them apart.
 *
 * Returns `undefined` for a match belonging to no series. Everything else — including a
 * correction that changes nothing at all — comes back populated, because an operator needs to
 * be told the result holds, not left to infer it from silence.
 */
export function previewSeriesCorrection(input: {
  readonly declaration: SeriesDeclaration;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
  readonly matches: readonly {
    readonly matchId: string;
    readonly number: number;
    readonly status: string;
    readonly result?: unknown;
  }[];
  readonly correctedMatchId: string;
  readonly replacement: unknown;
}): SeriesCorrectionOutlook | undefined {
  const before = resolveFixtureSeries(input);
  if (before === undefined) return undefined;

  const after = resolveFixtureSeries({
    ...input,
    matches: input.matches.map((match) =>
      match.matchId === input.correctedMatchId
        ? { ...match, status: 'finalized', result: input.replacement }
        : match,
    ),
  });
  if (after === undefined) return undefined;

  const beforeAnulled = new Set(before.anulledMatchNumbers);
  const afterAnulled = new Set(after.anulledMatchNumbers);
  const becomingNotRequired = [...afterAnulled].filter((n) => !beforeAnulled.has(n)).sort();
  const becomingScheduled = [...beforeAnulled].filter((n) => !afterAnulled.has(n)).sort();

  const decidedBefore = decisionPointOf(before);
  const decidedAfter = decisionPointOf(after);
  const decisionPointMoves = decidedBefore !== decidedAfter;

  return {
    before: before.explanation,
    after: after.explanation,
    ...(decidedBefore === undefined ? {} : { decidedAtMatchNumber: decidedBefore }),
    ...(decidedAfter === undefined ? {} : { decidedAtMatchNumberAfter: decidedAfter }),
    decisionPointMoves,
    unchanged:
      !decisionPointMoves &&
      before.status === after.status &&
      before.winnerEntrantId === after.winnerEntrantId &&
      becomingNotRequired.length === 0 &&
      becomingScheduled.length === 0,
    becomingNotRequired,
    becomingScheduled,
  };
}

/**
 * The game at which a decided series became decided: everything after it is surplus, so the
 * count of surplus games subtracted from the span names it. An undecided series has no such
 * point, which is not the same as its point being game one.
 */
function decisionPointOf(resolution: SeriesResolutionResult): number | undefined {
  if (resolution.status !== 'decided') return undefined;
  return resolution.span - resolution.anulledMatchNumbers.length;
}

export interface PublicSeriesGame {
  readonly number: number;
  readonly status: string;
  readonly winnerEntrantId?: string;
  /** Which side of the cross won, so a renderer never has to match entrant ids itself. */
  readonly winner?: 'home' | 'away';
  readonly scores?: readonly number[];
}

export interface PublicSeriesState {
  readonly span: number;
  readonly resolutionClass?: string;
  readonly games: readonly PublicSeriesGame[];
  readonly homeGamesWon: number;
  readonly awayGamesWon: number;
  readonly aggregateScores?: readonly number[];
  readonly status: string;
  readonly winnerEntrantId?: string;
  readonly winner?: 'home' | 'away';
  readonly explanation: string;
}

/**
 * A cross's series state as a public surface renders it.
 *
 * Games come back in play order — by game number, not by when they were finalized. A game
 * played late still occupies its own position, because a spectator reading "game three" means
 * the third game of the series, not the third one somebody got round to entering.
 *
 * The aggregate is reported for every class but only *means* something for `aggregate`, where
 * a two-legged tie has no notion of games won and the summed score is the entire answer. A
 * best-of's spectator is asking "how many left?", which `homeGamesWon` and `span` answer.
 */
export function publicSeriesState(input: {
  readonly declaration: SeriesDeclaration;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
  readonly games: readonly {
    readonly number: number;
    readonly status: string;
    readonly result?: {
      readonly sides: readonly {
        readonly entrantId: string;
        readonly statistics?: Record<string, number>;
      }[];
      readonly winnerEntrantId?: string;
    };
  }[];
}): PublicSeriesState | undefined {
  const resolution = resolveFixtureSeries({ ...input, matches: input.games });
  if (resolution === undefined) return undefined;
  const home = input.homeEntrantId;
  const away = input.awayEntrantId;

  const ordered = [...input.games].sort((a, b) => a.number - b.number);
  const games = ordered.map((game) => {
    const scores =
      game.result === undefined
        ? undefined
        : ([scoreOf(game.result, home), scoreOf(game.result, away)] as const);
    const winnerEntrantId = game.result?.winnerEntrantId;
    return {
      number: game.number,
      status: game.status,
      ...(winnerEntrantId === undefined ? {} : { winnerEntrantId }),
      ...(sideOf(winnerEntrantId, home, away) === undefined
        ? {}
        : { winner: sideOf(winnerEntrantId, home, away) }),
      ...(scores === undefined ? {} : { scores: [...scores] }),
    };
  });

  const aggregate = games.reduce<[number, number]>(
    (running, game) => [running[0] + (game.scores?.[0] ?? 0), running[1] + (game.scores?.[1] ?? 0)],
    [0, 0],
  );
  const anyScore = games.some((game) => game.scores !== undefined);

  return {
    span: input.declaration.span,
    ...(input.declaration.resolutionClass === undefined
      ? {}
      : { resolutionClass: input.declaration.resolutionClass }),
    games,
    homeGamesWon: games.filter((game) => game.winnerEntrantId === home).length,
    awayGamesWon: games.filter((game) => game.winnerEntrantId === away).length,
    ...(anyScore ? { aggregateScores: aggregate } : {}),
    status: resolution.status,
    ...(resolution.winnerEntrantId === undefined
      ? {}
      : { winnerEntrantId: resolution.winnerEntrantId }),
    ...(sideOf(resolution.winnerEntrantId, home, away) === undefined
      ? {}
      : { winner: sideOf(resolution.winnerEntrantId, home, away) }),
    explanation: resolution.explanation,
  };
}

/** Which side of the cross an entrant is, or neither — a draw names no side. */
function sideOf(
  entrantId: string | undefined,
  home: string | undefined,
  away: string | undefined,
): 'home' | 'away' | undefined {
  if (entrantId === undefined) return undefined;
  if (entrantId === home) return 'home';
  if (entrantId === away) return 'away';
  return undefined;
}

/**
 * One side's score in one game, read the same way the engine's own aggregate resolver reads it
 * — the first of `score`, `goals` or `points` the discipline recorded. A discipline that names
 * its scoring statistic something else contributes nothing to the aggregate here, exactly as it
 * contributes nothing there; the two must agree, and agreeing wrongly is still better than a
 * public surface and an engine disagreeing about who advanced.
 */
function scoreOf(
  result: {
    readonly sides: readonly {
      readonly entrantId: string;
      readonly statistics?: Record<string, number>;
    }[];
  },
  entrantId: string | undefined,
): number {
  const side = result.sides.find((candidate) => candidate.entrantId === entrantId);
  return side?.statistics?.score ?? side?.statistics?.goals ?? side?.statistics?.points ?? 0;
}
