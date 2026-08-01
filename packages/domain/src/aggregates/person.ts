import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * A person and their memberships (0015-competition-identity-and-seasons).
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
