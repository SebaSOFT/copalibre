import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import { isValidCountryCode } from '../countries.js';

/**
 * A person and their memberships.
 *
 * `Participant` was both: the human, and the human as a member of a team. That
 * made "the same person plays for two teams" inexpressible — they entered
 * twice, their numbers never added up, and nothing detected the duplicate,
 * which is also how a CSV import quietly creates two of somebody.
 *
 * So the human is a **person**, carrying a natural key that identifies them
 * across teams and competitions, and their membership in a team is a
 * **player**. One person holds as many players as they have teams.
 */

/**
 * What a federation actually identifies someone by: a national identity number,
 * an association membership number, a licence.
 *
 * `kind` is open-vocabulary because the document differs by country and by
 * sport, and a core list would be wrong for the first association outside it.
 */
export interface NaturalKey {
  readonly kind: string;
  /** Stored normalised; the form somebody typed is not the identity. */
  readonly value: string;
}

export interface Person {
  readonly personId: string;
  readonly organizationId: string;
  /** Optional public alias (Alias, scope 'person'), unique within its organization. */
  readonly alias?: string;
  readonly displayName: string;
  /**
   * Absent until somebody supplies it. A minor without a document and a walk-in
   * at a small club must be registerable, and a model that demands the key at
   * creation is a model whose operators invent fake ones.
   */
  readonly naturalKey?: NaturalKey;
  /** ISO 3166-1 alpha-2 country code. Absent until an operator records one. */
  readonly nationality?: string;
  /** ISO 8601 calendar date (YYYY-MM-DD); absent until supplied. */
  readonly birthDate?: string;
  /** Object-storage reference; absent until a photo is uploaded. */
  readonly photoObjectId?: string;
}

export type PlayerRole = 'player' | 'substitute' | 'coach' | 'staff';

/**
 * One person's membership in one team.
 *
 * Several may be held at once — a club's football side and its futsal side, or
 * two clubs in two competitions — which is exactly what the split exists for.
 */
export interface Player {
  readonly playerId: string;
  readonly personId: string;
  readonly teamId: string;
  readonly role: PlayerRole;
}

export class PersonError extends DomainError {
  readonly code = 'PERSON_INVALID';
}

/**
 * The comparable form of a natural key.
 *
 * `12.345.678` and `12345678` are one document, and a system that says
 * otherwise creates the duplicate it exists to prevent. Punctuation, spacing
 * and case are presentation; what identifies is the sequence underneath.
 */
export function normaliseNaturalKey(value: string): string {
  return value.replace(/[^0-9a-z]/gi, '').toUpperCase();
}

export function sameNaturalKey(left: NaturalKey, right: NaturalKey): boolean {
  return (
    left.kind === right.kind && normaliseNaturalKey(left.value) === normaliseNaturalKey(right.value)
  );
}

/**
 * Calculates completed full years of age as of a reference date (defaults to UTC today).
 */
export function ageAt(birthDate: string, asOf: string | Date = new Date()): number {
  const birth = new Date(`${birthDate.slice(0, 10)}T00:00:00.000Z`);
  const target = typeof asOf === 'string' ? new Date(asOf) : asOf;
  let age = target.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = target.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && target.getUTCDate() < birth.getUTCDate())) {
    age--;
  }
  return Math.max(0, age);
}

export function validatePerson(person: Person): Result<Person, PersonError> {
  if (person.displayName.trim() === '') {
    return err(new PersonError('A person needs a name', { personId: person.personId }));
  }

  if (person.naturalKey) {
    if (person.naturalKey.kind.trim() === '') {
      return err(
        new PersonError('A natural key states what kind of document it is', {
          personId: person.personId,
        }),
      );
    }
    if (normaliseNaturalKey(person.naturalKey.value) === '') {
      return err(
        new PersonError('A natural key with no identifying characters identifies nobody', {
          personId: person.personId,
        }),
      );
    }
  }

  if (person.nationality !== undefined && !isValidCountryCode(person.nationality)) {
    return err(
      new PersonError(`"${person.nationality}" is not a valid ISO 3166-1 alpha-2 country code`, {
        personId: person.personId,
      }),
    );
  }

  if (person.birthDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(person.birthDate)) {
      return err(
        new PersonError(`"${person.birthDate}" is not a valid ISO date (YYYY-MM-DD)`, {
          personId: person.personId,
        }),
      );
    }
    const parsed = new Date(`${person.birthDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return err(
        new PersonError(`"${person.birthDate}" is not a valid date`, {
          personId: person.personId,
        }),
      );
    }
    const now = new Date();
    if (parsed.getTime() > now.getTime()) {
      return err(
        new PersonError('A birth date cannot be in the future', {
          personId: person.personId,
        }),
      );
    }
    const oldestAllowed = new Date();
    oldestAllowed.setUTCFullYear(oldestAllowed.getUTCFullYear() - 130);
    if (parsed.getTime() < oldestAllowed.getTime()) {
      return err(
        new PersonError('A birth date cannot be more than 130 years in the past', {
          personId: person.personId,
        }),
      );
    }
  }

  return ok(person);
}

/**
 * Whether two memberships describe the same person in the same team.
 *
 * Holding several players is the point; holding two for one team is a
 * duplicate, and it is the only case the split has to refuse.
 */
export function isDuplicateMembership(left: Player, right: Player): boolean {
  return left.personId === right.personId && left.teamId === right.teamId;
}

/**
 * The squad a discipline's constraint applies to.
 *
 * A club fielding a football and a futsal side has two teams, and "between five
 * and eleven players" is a claim about one of them. Selecting by discipline is
 * what stops a constraint being checked against the wrong squad — which, before
 * teams named their discipline, was not even expressible as a mistake.
 */
export function squadOfDiscipline(
  players: readonly Player[],
  teams: readonly { readonly teamId: string; readonly disciplineId?: string }[],
  disciplineId: string,
): readonly Player[] {
  const ofDiscipline = new Set(
    teams.filter((team) => team.disciplineId === disciplineId).map((team) => team.teamId),
  );
  return players.filter((player) => ofDiscipline.has(player.teamId));
}
