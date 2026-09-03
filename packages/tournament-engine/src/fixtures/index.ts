import type { TournamentFormat } from '@copalibre/domain';
import {
  err,
  ok,
  type Result,
  validateSeriesDeclaration,
  SeriesConfigurationError,
  isPlacementFormat,
} from '@copalibre/domain';
import {
  InvalidCustomBracketError,
  InvalidEntrantsError,
  UnsupportedFormatError,
} from '../errors.js';
import { assertNoPlacementEdges } from '../advancement/index.js';
import { assertSupportedFormat } from '../formats.js';
import type { FixtureGraph, GenerateFixturesInput, GeneratedMatch } from '../types.js';
import { buildDoubleElimination } from './double-elimination.js';
import { buildPlacementStage } from './placement.js';
import { buildRoundRobin } from './round-robin.js';
import { buildEliminationTree } from './single-elimination.js';
import { generateBracketGroups } from './bracket-groups.js';
import { generateGauntlet } from './gauntlet.js';
import { generateSwissRound1 } from './swiss.js';
import { generateCustomBracketFixtures } from './custom-bracket.js';
import { generateFFABracketFixtures } from './ffa-bracket.js';
import { generateFFALeagueFixtures } from './ffa-league.js';

export { buildEliminationTree, seedSlotOrder, nextPowerOfTwo } from './single-elimination.js';
export { buildDoubleElimination } from './double-elimination.js';
export { buildRoundRobin } from './round-robin.js';
export { buildPlacementStage, roundSeed, type PlacementOptions } from './placement.js';
export {
  generateBracketGroups,
  resolveBracketGroupAdvancement,
  type BracketGroupQualification,
} from './bracket-groups.js';
export {
  generateGauntlet,
  projectGauntletStandings,
  computeGauntletStandings,
  type GauntletStandingRank,
  type GauntletStandingsResult,
} from './gauntlet.js';
export {
  generateSwissRound1,
  generateNextSwissRoundFixtures,
  type GenerateNextSwissRoundInput,
} from './swiss.js';
export { generateCustomBracketFixtures, validateCustomBracket } from './custom-bracket.js';
export { generateFFABracketFixtures, type FFABracketOptions } from './ffa-bracket.js';
export {
  generateFFALeagueFixtures,
  type FFALeagueOptions,
  type FFALeagueDivision,
} from './ffa-league.js';
export { pruneEmptyMatches } from './prune.js';
export {
  generateGroupedFixtures,
  type FixtureGroupInput,
  type GenerateGroupedFixturesInput,
  type ScopedGeneratedFixture,
} from './grouped.js';

/**
 * The single generation entry point. Pure: entrants + seeds + format in, fixture
 * graph out, no database access — which is what makes "repeated generation is
 * identical" assertable without Postgres.
 */
export function generateFixtures(
  input: GenerateFixturesInput,
): Result<FixtureGraph, UnsupportedFormatError | InvalidEntrantsError | SeriesConfigurationError> {
  const format = assertSupportedFormat(input.format);
  if (!format.ok) return err(format.error);

  if (input.series !== undefined) {
    if (isPlacementFormat(input.format)) {
      return err(
        new UnsupportedFormatError('Series configuration is not supported for placement formats', {
          format: input.format,
        }),
      );
    }
    const seriesValidation = validateSeriesDeclaration(input.series);
    if (!seriesValidation.ok) {
      return err(seriesValidation.error);
    }
  }

  const entrantsToValidate =
    input.entrants.length === 0 &&
    input.ffaLeague?.divisions &&
    input.ffaLeague.divisions.length > 0
      ? input.ffaLeague.divisions.flatMap((d) => d.entrants)
      : input.entrants;

  const invalid = validateEntrants(entrantsToValidate);
  if (invalid) return err(invalid);

  const matches = buildFor(format.value, input);
  // Generation-time counterpart of the resolution-time check: a placement match
  // must never be another match's slot source, and the cheapest place to prove
  // that is where the graph is built.
  assertNoPlacementEdges({
    format: format.value,
    entrantCount: entrantsToValidate.length,
    matches,
    rounds: [],
  });
  return ok({
    format: format.value,
    entrantCount: entrantsToValidate.length,
    matches,
    rounds: summariseRounds(matches),
  });
}

function buildFor(
  format: TournamentFormat,
  input: GenerateFixturesInput,
): readonly GeneratedMatch[] {
  switch (format) {
    case 'single-elimination':
      return buildEliminationTree(input.entrants, 'SE', 'winners', input.series).matches;
    case 'double-elimination':
      return buildDoubleElimination(input.entrants, input.series).matches;
    case 'round-robin':
    case 'round-robin-single-leg':
      return buildRoundRobin(input.entrants, { series: input.series });
    case 'league':
      // A league is a round robin whose points/tiebreak configuration differs;
      // the fixture shape is identical, so the difference lives in the ruleset,
      // not here (tournament-engine decision record).
      return buildRoundRobin(input.entrants, { idPrefix: 'LG', series: input.series });
    case 'round-robin-home-away':
      return buildRoundRobin(input.entrants, { homeAndAway: true, series: input.series });
    case 'bracket-groups':
      return generateBracketGroups(input.entrants, {
        series: input.series,
        bracketGroups: input.bracketGroups,
      });
    case 'gauntlet':
      return generateGauntlet(input.entrants, {
        series: input.series,
      });
    case 'swiss':
      return generateSwissRound1(input.entrants, {
        series: input.series,
      });
    case 'custom-bracket':
      if (!input.customBracket) {
        throw new InvalidCustomBracketError(
          'A custom-bracket format requires a customBracket definition',
        );
      }
      return generateCustomBracketFixtures(input.entrants, input.customBracket, {
        series: input.series,
      });
    case 'ffa-bracket':
    case 'ffa-bracket-groups':
      return generateFFABracketFixtures(format, input.entrants, {
        lobbySize: input.ffaBracket?.lobbySize ?? input.placement?.lobbySize,
        advancingCount: input.ffaBracket?.advancingCount,
        idPrefix: input.ffaBracket?.idPrefix,
        groupCount: input.ffaBracket?.groupCount,
        thresholdFinalists: input.ffaBracket?.thresholdFinalists,
      });
    case 'ffa-league':
      return generateFFALeagueFixtures(format, input.entrants, {
        rounds: input.ffaLeague?.rounds ?? input.placement?.rounds,
        lobbySize: input.ffaLeague?.lobbySize ?? input.placement?.lobbySize,
        divisions: input.ffaLeague?.divisions,
        divisionCount: input.ffaLeague?.divisionCount,
        idPrefix: input.ffaLeague?.idPrefix,
      });
    case 'free-for-all':
    case 'heats':
      // Placement stages carry no advancement edges, so nothing downstream
      // reads them as a slot source — see assertNoPlacementEdges.
      return buildPlacementStage(format, input.entrants, input.placement);
  }
}

function validateEntrants(
  entrants: readonly GenerateFixturesInput['entrants'][number][],
): InvalidEntrantsError | undefined {
  if (entrants.length < 2) {
    return new InvalidEntrantsError('A tournament needs at least 2 entrants', {
      entrantCount: entrants.length,
    });
  }
  const seeds = new Set(entrants.map((entrant) => entrant.seed));
  if (seeds.size !== entrants.length) {
    return new InvalidEntrantsError('Seeds must be unique', {
      entrantCount: entrants.length,
      distinctSeeds: seeds.size,
    });
  }
  const ids = new Set(entrants.map((entrant) => entrant.entrantId));
  if (ids.size !== entrants.length) {
    return new InvalidEntrantsError('Entrant ids must be unique', {
      entrantCount: entrants.length,
      distinctIds: ids.size,
    });
  }
  if (entrants.some((entrant) => !Number.isInteger(entrant.seed) || entrant.seed < 1)) {
    return new InvalidEntrantsError('Seeds must be positive integers starting at 1');
  }
  return undefined;
}

function summariseRounds(matches: readonly GeneratedMatch[]): FixtureGraph['rounds'] {
  const keyed = new Map<
    string,
    { bracket: GeneratedMatch['bracket']; round: number; matchIds: string[] }
  >();
  for (const match of matches) {
    const key = `${match.bracket}:${match.round}`;
    const existing = keyed.get(key);
    if (existing) existing.matchIds.push(match.id);
    else keyed.set(key, { bracket: match.bracket, round: match.round, matchIds: [match.id] });
  }
  return [...keyed.values()];
}
