import type { Kysely } from 'kysely';
import {
  normaliseNaturalKey,
  validatePerson,
  type NaturalKey,
  type Person,
  type Player,
  type PlayerRole,
} from '@copalibre/domain';
import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './participant-repository.js';

/**
 * People and their memberships (0015-competition-identity-and-seasons).
 *
 * The one behaviour worth stating: registering somebody who is already known
 * **recognises** them rather than creating a second row. That is what a natural
 * key is for, and an import that skips it is an import that quietly duplicates
 * a roster.
 */
export class PersonRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Registers a person, or returns the one already carrying this key.
   *
   * Recognition is by the *normalised* key, so `12.345.678` and `12345678`
   * resolve to one human. Without a key there is nothing to recognise by, and a
   * new person is created — which is correct: two people can share a name.
   */
  async register(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly displayName: string;
      readonly alias?: string;
      readonly naturalKey?: NaturalKey;
    } & AuditContext,
  ): Promise<{ readonly person: Person; readonly recognised: boolean }> {
    if (input.naturalKey) {
      const existing = await this.findByNaturalKey(input.organizationId, input.naturalKey);
      if (existing) return { person: existing, recognised: true };
    }

    const person: Person = {
      personId: newId(),
      organizationId: input.organizationId,
      displayName: input.displayName,
      ...(input.alias === undefined ? {} : { alias: input.alias }),
      ...(input.naturalKey === undefined ? {} : { naturalKey: input.naturalKey }),
    };

    const valid = validatePerson(person);
    if (!valid.ok) throw new InvariantViolationError(valid.error.message, valid.error.details);

    await uow.tx
      .insertInto('persons')
      .values({
        person_id: person.personId,
        organization_id: person.organizationId,
        alias: person.alias ?? null,
        display_name: person.displayName,
        natural_key_kind: person.naturalKey?.kind ?? null,
        natural_key_value: person.naturalKey?.value ?? null,
        natural_key_normalised: person.naturalKey
          ? normaliseNaturalKey(person.naturalKey.value)
          : null,
        created_at: new Date(),
      })
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'person',
      entityId: person.personId,
      action: 'person.registered',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      // The key itself stays out of the audit row: it is personal data, and an
      // audit trail is read by more people than a registration form.
      resultingState: { personId: person.personId, displayName: person.displayName },
    });

    return { person, recognised: false };
  }

  /**
   * Attaches a key to somebody registered without one.
   *
   * Refuses when another person in the organization already carries it, because
   * that is two records claiming one human and only an operator can say which.
   */
  async attachNaturalKey(
    uow: UnitOfWork,
    input: {
      readonly personId: string;
      readonly organizationId: string;
      readonly naturalKey: NaturalKey;
    } & AuditContext,
  ): Promise<Person> {
    const claimed = await this.findByNaturalKey(input.organizationId, input.naturalKey);
    if (claimed && claimed.personId !== input.personId) {
      throw new InvariantViolationError(
        `Another person already carries this ${input.naturalKey.kind} in this organization`,
        { personId: input.personId, conflictsWith: claimed.personId },
      );
    }

    const row = await uow.tx
      .updateTable('persons')
      .set({
        natural_key_kind: input.naturalKey.kind,
        natural_key_value: input.naturalKey.value,
        natural_key_normalised: normaliseNaturalKey(input.naturalKey.value),
      })
      .where('person_id', '=', input.personId)
      .returningAll()
      .executeTakeFirstOrThrow();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'person',
      entityId: input.personId,
      action: 'person.natural-key-attached',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { personId: input.personId, kind: input.naturalKey.kind },
    });

    return toPerson(row);
  }

  async findByNaturalKey(
    organizationId: string,
    naturalKey: NaturalKey,
  ): Promise<Person | undefined> {
    const row = await this.db
      .selectFrom('persons')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('natural_key_kind', '=', naturalKey.kind)
      .where('natural_key_normalised', '=', normaliseNaturalKey(naturalKey.value))
      .executeTakeFirst();
    return row ? toPerson(row) : undefined;
  }

  async findPerson(personId: string): Promise<Person | undefined> {
    const row = await this.db
      .selectFrom('persons')
      .selectAll()
      .where('person_id', '=', personId)
      .executeTakeFirst();
    return row ? toPerson(row) : undefined;
  }

  /** Adds a membership. A person may hold one per team, and as many teams as they play for. */
  async enlist(
    uow: UnitOfWork,
    input: {
      readonly personId: string;
      readonly teamId: string;
      readonly role: PlayerRole;
      readonly organizationId: string;
    } & AuditContext,
  ): Promise<Player> {
    const player: Player = {
      playerId: newId(),
      personId: input.personId,
      teamId: input.teamId,
      role: input.role,
    };

    await uow.tx
      .insertInto('players')
      .values({
        player_id: player.playerId,
        person_id: player.personId,
        team_id: player.teamId,
        role: player.role,
        created_at: new Date(),
      })
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'player',
      entityId: player.playerId,
      action: 'player.enlisted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...player },
    });

    return player;
  }

  /** Every team this human plays for — the question the split exists to answer. */
  async playersOf(personId: string): Promise<readonly Player[]> {
    const rows = await this.db
      .selectFrom('players')
      .selectAll()
      .where('person_id', '=', personId)
      .execute();
    return rows.map(toPlayer);
  }

  async squadOf(teamId: string): Promise<readonly Player[]> {
    const rows = await this.db
      .selectFrom('players')
      .selectAll()
      .where('team_id', '=', teamId)
      .execute();
    return rows.map(toPlayer);
  }
}

interface PersonRow {
  readonly person_id: string;
  readonly organization_id: string;
  readonly alias: string | null;
  readonly display_name: string;
  readonly natural_key_kind: string | null;
  readonly natural_key_value: string | null;
}

function toPerson(row: PersonRow): Person {
  return {
    personId: row.person_id,
    organizationId: row.organization_id,
    displayName: row.display_name,
    ...(row.alias === null ? {} : { alias: row.alias }),
    ...(row.natural_key_kind === null || row.natural_key_value === null
      ? {}
      : { naturalKey: { kind: row.natural_key_kind, value: row.natural_key_value } }),
  };
}

interface PlayerRow {
  readonly player_id: string;
  readonly person_id: string;
  readonly team_id: string;
  readonly role: string;
}

function toPlayer(row: PlayerRow): Player {
  return {
    playerId: row.player_id,
    personId: row.person_id,
    teamId: row.team_id,
    role: row.role as PlayerRole,
  };
}
