import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * A season is one running of a tournament (0015-competition-identity-and-seasons).
 *
 * The tournament names the recurring competition — "Torneo Apertura Nacional A"
 * — and the season names the edition: 2026. Other systems collapse the two and
 * the year ends up inside the name, which makes every question spanning
 * editions answerable only by comparing strings. A club's record, a person's
 * career and a suspension carried over all need the relation to be data.
 */

export interface Season {
  readonly seasonId: string;
  readonly tournamentId: string;
  /** What this edition is called: "2026", "Clausura 2026", "XXIV". */
  readonly name: string;
  /** 1-based, in the order the tournament was run. */
  readonly ordinal: number;
}

export class SeasonError extends DomainError {
  readonly code = 'SEASON_INVALID';
}

export function validateSeason(season: Season): Result<Season, SeasonError> {
  if (season.name.trim() === '') {
    return err(
      new SeasonError('A season needs a name; it is half of what a competition is called', {
        seasonId: season.seasonId,
      }),
    );
  }
  if (!Number.isInteger(season.ordinal) || season.ordinal < 1) {
    return err(
      new SeasonError(`A season's ordinal is 1-based; got ${season.ordinal}`, {
        seasonId: season.seasonId,
        ordinal: season.ordinal,
      }),
    );
  }
  return ok(season);
}

/**
 * The name a surface shows, composed from the two halves.
 *
 * **Never stored assembled.** Storing "Torneo Apertura Nacional A 2026" is
 * exactly what makes the relation between editions unrecoverable: two runnings
 * become two strings that happen to share a prefix, and no query can add them
 * up without parsing text.
 */
export function competitionName(
  tournament: { readonly name: string },
  season: Pick<Season, 'name'>,
): string {
  return `${tournament.name} ${season.name}`.trim();
}

/** The edition every tournament gets, including the ones run only once. */
export const IMPLICIT_SEASON_NAME = 'Edición única';

/**
 * Whether a season is the tournament's only, implicit edition.
 *
 * A model where some stages have a season and others do not forces every later
 * reader to handle both shapes, and the phase that forgets is the one that
 * ships wrong. One implicit edition costs a row and removes the branch.
 */
export function isImplicitSeason(season: Pick<Season, 'name' | 'ordinal'>): boolean {
  return season.ordinal === 1 && season.name === IMPLICIT_SEASON_NAME;
}
