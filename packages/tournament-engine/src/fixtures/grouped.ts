import { err, ok, type Result, type SeriesConfigurationError } from '@copalibre/domain';
import type { InvalidEntrantsError, UnsupportedFormatError } from '../errors.js';
import type { GenerateFixturesInput, GeneratedMatch } from '../types.js';
import { generateFixtures } from './index.js';

export interface FixtureGroupInput {
  readonly zoneId: string;
  readonly groupId: string;
  readonly entrants: GenerateFixturesInput['entrants'];
  /**
   * The format this group's zone plays when it differs from the stage's. Absent: the group plays
   * `GenerateGroupedFixturesInput.format`, so a stage whose zones declare nothing generates what
   * it always generated.
   */
  readonly format?: GenerateFixturesInput['format'];
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
 * Runs the existing fixture generator once for each independently drawn group, in the group's own
 * format when its zone declares one. A single implicit group therefore returns the generator's same
 * matches, only with their persisted scope made explicit. Each group's matches are numbered within
 * that group, so a knockout zone and a league zone of one stage keep their own round counts and no
 * match refers to another group's.
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
      format: group.format ?? input.format,
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
