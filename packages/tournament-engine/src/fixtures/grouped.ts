import { err, ok, type Result, type SeriesConfigurationError } from '@copalibre/domain';
import type { InvalidEntrantsError, UnsupportedFormatError } from '../errors.js';
import type { GenerateFixturesInput, GeneratedMatch } from '../types.js';
import { generateFixtures } from './index.js';

export interface FixtureGroupInput {
  readonly zoneId: string;
  readonly groupId: string;
  readonly entrants: GenerateFixturesInput['entrants'];
}

export interface GenerateGroupedFixturesInput {
  readonly stageId: string;
  readonly format: GenerateFixturesInput['format'];
  readonly groups: readonly FixtureGroupInput[];
  readonly homeAndAway?: boolean;
  readonly placement?: GenerateFixturesInput['placement'];
  readonly ffaBracket?: GenerateFixturesInput['ffaBracket'];
  readonly ffaLeague?: GenerateFixturesInput['ffaLeague'];
}

/** A generator match plus the stage/zone/group scope required to persist it. */
export interface ScopedGeneratedFixture {
  readonly stageId: string;
  readonly zoneId: string;
  readonly groupId: string;
  /** Deliberately unchanged output from the per-format generator. */
  readonly match: GeneratedMatch;
}

/**
 * Runs the existing fixture generator once for each independently drawn group.
 * A single implicit group therefore returns the generator's same matches, only
 * with their persisted scope made explicit.
 */
export function generateGroupedFixtures(
  input: GenerateGroupedFixturesInput,
): Result<
  readonly ScopedGeneratedFixture[],
  UnsupportedFormatError | InvalidEntrantsError | SeriesConfigurationError
> {
  const fixtures: ScopedGeneratedFixture[] = [];
  for (const group of input.groups) {
    const generated = generateFixtures({
      format: input.format,
      entrants: group.entrants,
      homeAndAway: input.homeAndAway,
      placement: input.placement,
      ffaBracket: input.ffaBracket,
      ffaLeague: input.ffaLeague,
    });
    if (!generated.ok) return err(generated.error);
    fixtures.push(
      ...generated.value.matches.map((match) => ({
        stageId: input.stageId,
        zoneId: group.zoneId,
        groupId: group.groupId,
        match,
      })),
    );
  }
  return ok(fixtures);
}
