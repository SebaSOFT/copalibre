import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * The things a fixture needs besides two entrants: somewhere to play and
 * someone to officiate.
 *
 * Both are *referenceable entities* rather than free text on the fixture,
 * because the whole point of this phase is detecting that two fixtures want the
 * same one at the same time. A venue named by a string cannot be double-booked;
 * it can only be spelled two ways.
 *
 * A venue is a place with a capacity for concurrent matches — a club with three
 * courts is one venue that can host three fixtures at once, not three venues.
 * An official is a person, and a person is somewhere or is not: capacity one,
 * always, which is why it is not a field.
 */

export interface Venue {
  readonly venueId: string;
  readonly organizationId: string;
  /** URL-safe identifier, unique within its organization. */
  readonly alias: string;
  readonly name: string;
  /**
   * Fixtures this venue can host simultaneously — courts, tables, pitches.
   * One unless stated, which is the common case and the safe default.
   */
  readonly concurrentCapacity: number;
  /** Free-form, for an operator to read; never parsed. */
  readonly address?: string;
  /**
   * Free-form, operator-entered key/value details describing what kind of
   * resource this is — physical (address, playing surface) or virtual (server
   * address, region, current map). Never parsed, validated, or acted on;
   * accommodates both without a `kind` discriminant forcing a shape neither
   * this catalogue's disciplines nor a future one is committed to.
   */
  readonly details?: Readonly<Record<string, string>>;
}

export type OfficialRole = 'referee' | 'assistant' | 'table-official' | 'observer';

export interface Official {
  readonly officialId: string;
  readonly organizationId: string;
  readonly displayName: string;
  /** Roles this person may be assigned to. Never inferred from a name. */
  readonly roles: readonly OfficialRole[];
}

/**
 * When a fixture is played, as an epoch instant and a duration.
 *
 * A window rather than a start time, because a conflict is an overlap and an
 * overlap needs two ends. The duration is the *scheduled* one — how long the
 * resource is reserved — and has nothing to do with how long the match takes,
 * which nobody knows in advance.
 */
export interface TimeWindow {
  /** Epoch milliseconds. */
  readonly startsAt: number;
  readonly durationMinutes: number;
}

export interface ResourceAssignment {
  readonly matchId: string;
  readonly slotId: string;
  readonly officialIds?: readonly string[];
}

export class ResourceError extends DomainError {
  readonly code = 'RESOURCE_INVALID';
}

export function endsAt(window: TimeWindow): number {
  return window.startsAt + window.durationMinutes * 60_000;
}

/**
 * Whether two windows overlap. Touching is not overlapping: a fixture ending at
 * 18:00 and one starting at 18:00 share a boundary and no time, which is how an
 * operator scheduling back-to-back matches expects it to read.
 */
export function overlaps(left: TimeWindow, right: TimeWindow): boolean {
  return left.startsAt < endsAt(right) && right.startsAt < endsAt(left);
}

/** Minutes between the end of one window and the start of the next, or 0 if they overlap. */
export function gapMinutes(left: TimeWindow, right: TimeWindow): number {
  const [first, second] = left.startsAt <= right.startsAt ? [left, right] : [right, left];
  return Math.max(0, (second.startsAt - endsAt(first)) / 60_000);
}

export function validateWindow(window: TimeWindow): Result<TimeWindow, ResourceError> {
  if (!Number.isFinite(window.startsAt) || !Number.isInteger(window.startsAt)) {
    return err(
      new ResourceError('A schedule window starts at an epoch in milliseconds', {
        startsAt: window.startsAt,
      }),
    );
  }
  if (!Number.isFinite(window.durationMinutes) || window.durationMinutes <= 0) {
    return err(
      new ResourceError(
        `A schedule window lasts a positive number of minutes, not ${window.durationMinutes}`,
        { durationMinutes: window.durationMinutes },
      ),
    );
  }
  return ok(window);
}

export function validateVenue(venue: Venue): Result<Venue, ResourceError> {
  if (venue.name.trim() === '') {
    return err(new ResourceError('A venue needs a name', { venueId: venue.venueId }));
  }
  if (!Number.isInteger(venue.concurrentCapacity) || venue.concurrentCapacity < 1) {
    return err(
      new ResourceError(
        `A venue hosts at least one fixture at a time, not ${venue.concurrentCapacity}`,
        { venueId: venue.venueId, concurrentCapacity: venue.concurrentCapacity },
      ),
    );
  }
  return ok(venue);
}

export function validateOfficial(official: Official): Result<Official, ResourceError> {
  if (official.displayName.trim() === '') {
    return err(new ResourceError('An official needs a name', { officialId: official.officialId }));
  }
  if (official.roles.length === 0) {
    return err(
      new ResourceError('An official with no role can be assigned to nothing', {
        officialId: official.officialId,
      }),
    );
  }
  return ok(official);
}
