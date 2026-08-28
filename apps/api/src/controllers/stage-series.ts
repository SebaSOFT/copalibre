import {
  resolveSeries,
  validateSeriesDeclaration,
  type SeriesDeclaration,
  type SeriesResolutionResult,
} from '@copalibre/domain';
import { TournamentRepository, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';

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
