import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * The short label a constrained surface shows.
 *
 * A bracket cell has room for four characters, a scoreboard for six, a
 * broadcast lower third for whatever the score left over. None of them fits
 * "Club Sportivo Casa de Italia", and without a short label each one invents
 * its own: truncate at N, take the first word, drop the vowels. The club then
 * recognises none of them.
 *
 * ## Why this is not an Alias
 *
 * They look alike — both are short, both stand in for a name — and they answer
 * different questions. An alias is a **path segment**: lowercase, kebab-case,
 * unique, and read by a URL bar. An abbreviation is a **label**: uppercase,
 * spaced, chosen for a human squinting at a screen from the stands. One type
 * doing both would be lowercase for the URL's sake and wrong on the board.
 *
 * ## Why it is never derived
 *
 * "Casa de Italia" abbreviates to "C I" because the organizer said so. Getting
 * there mechanically requires knowing that "de" does not count — a fact about
 * Spanish, not about the club — and the moment the heuristic ships, every club
 * whose name it mishandles has an abbreviation nobody chose and cannot explain.
 */

const ABBREVIATION_PATTERN = /^[A-Z0-9]+( [A-Z0-9]+)*$/;

/**
 * Ten characters (owner, 2026-08-01). Long enough for a club prefix and a side
 * marker with room to spare, short enough that a "short label" cannot quietly
 * become a second name — which is what a generous limit turns it into, leaving
 * the surface that had no room still with no room.
 */
export const MAX_ABBREVIATION_LENGTH = 10;

export class InvalidAbbreviationError extends DomainError {
  readonly code = 'ABBREVIATION_INVALID';
}

export class Abbreviation {
  private constructor(readonly value: string) {}

  static create(value: string): Result<Abbreviation, InvalidAbbreviationError> {
    if (value.length === 0) {
      return err(
        new InvalidAbbreviationError('An abbreviation is at least one character', { value }),
      );
    }
    if (value.length > MAX_ABBREVIATION_LENGTH) {
      return err(
        new InvalidAbbreviationError(
          `An abbreviation is at most ${MAX_ABBREVIATION_LENGTH} characters, or it is a second name: "${value}"`,
          { value },
        ),
      );
    }
    if (!ABBREVIATION_PATTERN.test(value)) {
      return err(
        new InvalidAbbreviationError(
          'An abbreviation is uppercase letters and digits, separated by single spaces ' +
            `(no punctuation, no leading or double spaces): "${value}"`,
          { value },
        ),
      );
    }
    return ok(new Abbreviation(value));
  }

  toString(): string {
    return this.value;
  }
}

/** Whether a string would be accepted, for a caller that has no value object to hold. */
export function isAbbreviation(value: string): boolean {
  return Abbreviation.create(value).ok;
}
