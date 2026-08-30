import type { Kysely } from 'kysely';
import {
  Alias,
  isValidCountryCode,
  normaliseNaturalKey,
  suggestAvailableAlias,
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
import type { AuditContext } from './enrollment-repository.js';

/**
 * People and their memberships.
 *
 * The one behaviour worth stating: registering somebody who is already known
 * **recognises** them rather than creating a second row. That is what a natural
 * key is for, and an import that skips it is an import that quietly duplicates
 * team membership.
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
      readonly birthDate?: string;
    } & AuditContext,
  ): Promise<{ readonly person: Person; readonly recognised: boolean }> {
    if (input.naturalKey) {
      const existing = await this.findByNaturalKey(input.organizationId, input.naturalKey);
      if (existing) return { person: existing, recognised: true };
    }

    const alias =
      input.alias ?? (await this.suggestPersonAlias(input.organizationId, input.displayName));
    const validatedAlias = Alias.create('entrant', alias);
    if (!validatedAlias.ok) {
      throw new InvariantViolationError(validatedAlias.error.message, { alias });
    }
    // Only reachable with an explicit alias: a suggested one is already
    // disambiguated against every alias this organization holds.
    if (input.alias !== undefined) {
      const claimed = await this.findByAlias(input.organizationId, alias);
      if (claimed) {
        throw new InvariantViolationError('Another person already uses this alias', {
          alias,
          conflictsWith: claimed.personId,
        });
      }
    }

    const person: Person = {
      personId: newId(),
      organizationId: input.organizationId,
      displayName: input.displayName,
      alias,
      ...(input.naturalKey === undefined ? {} : { naturalKey: input.naturalKey }),
      ...(input.birthDate === undefined ? {} : { birthDate: input.birthDate }),
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
        nationality: null,
        birth_date: person.birthDate ?? null,
        photo_object_id: null,
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
   * Corrects a person's own display name and/or alias — a misspelling caught
   * after registration, not a new person. Neither field is required: an
   * absent one is left as it was.
   */
  async updateIdentity(
    uow: UnitOfWork,
    input: {
      readonly personId: string;
      readonly organizationId: string;
      readonly displayName?: string;
      readonly alias?: string;
    } & AuditContext,
  ): Promise<Person> {
    const previous = await this.findPerson(input.personId);
    if (input.alias !== undefined) {
      const validatedAlias = Alias.create('entrant', input.alias);
      if (!validatedAlias.ok) {
        throw new InvariantViolationError(validatedAlias.error.message, { alias: input.alias });
      }
      const claimed = await this.findByAlias(input.organizationId, input.alias);
      if (claimed && claimed.personId !== input.personId) {
        throw new InvariantViolationError('Another person already uses this alias', {
          alias: input.alias,
          conflictsWith: claimed.personId,
        });
      }
    }

    const row = await uow.tx
      .updateTable('persons')
      .set({
        ...(input.displayName === undefined ? {} : { display_name: input.displayName }),
        ...(input.alias === undefined ? {} : { alias: input.alias }),
      })
      .where('person_id', '=', input.personId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const person = toPerson(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'person',
      entityId: input.personId,
      action: 'person.identity-updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      ...(previous === undefined
        ? {}
        : { previousState: { displayName: previous.displayName, alias: previous.alias ?? null } }),
      resultingState: { displayName: person.displayName, alias: person.alias ?? null },
    });
    return person;
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

  /** Sets or clears a person's nationality — an operator correcting or removing it. */
  async setNationality(
    uow: UnitOfWork,
    input: {
      readonly personId: string;
      readonly organizationId: string;
      readonly nationality: string | null;
    } & AuditContext,
  ): Promise<Person> {
    if (input.nationality !== null && !isValidCountryCode(input.nationality)) {
      throw new InvariantViolationError(
        `"${input.nationality}" is not a valid ISO 3166-1 alpha-2 country code`,
        { personId: input.personId },
      );
    }

    const previous = await this.findPerson(input.personId);
    const row = await uow.tx
      .updateTable('persons')
      .set({ nationality: input.nationality })
      .where('person_id', '=', input.personId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const person = toPerson(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'person',
      entityId: input.personId,
      action: 'person.nationality-set',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      ...(previous === undefined
        ? {}
        : { previousState: { nationality: previous.nationality ?? null } }),
      resultingState: { nationality: person.nationality ?? null },
    });
    return person;
  }

  /**
   * Attaches an uploaded photo's object-storage reference, in the same
   * transaction as the `object_metadata` insert.
   */
  async setPhoto(
    uow: UnitOfWork,
    input: {
      readonly personId: string;
      readonly organizationId: string;
      readonly photoObjectId: string;
    } & AuditContext,
  ): Promise<Person> {
    const row = await uow.tx
      .updateTable('persons')
      .set({ photo_object_id: input.photoObjectId })
      .where('person_id', '=', input.personId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const person = toPerson(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'person',
      entityId: input.personId,
      action: 'person.photo-set',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { photoObjectId: person.photoObjectId },
    });
    return person;
  }

  /** Sets or clears a person's birth date (ISO date YYYY-MM-DD). */
  async setBirthDate(
    uow: UnitOfWork,
    input: {
      readonly personId: string;
      readonly organizationId: string;
      readonly birthDate: string | null;
    } & AuditContext,
  ): Promise<Person> {
    const previous = await this.findPerson(input.personId);
    if (!previous) {
      throw new InvariantViolationError(`No person "${input.personId}" exists`, {
        personId: input.personId,
      });
    }

    if (input.birthDate !== null) {
      const candidate: Person = {
        ...previous,
        birthDate: input.birthDate,
      };
      const validation = validatePerson(candidate);
      if (!validation.ok) {
        throw new InvariantViolationError(validation.error.message, validation.error.details);
      }
    }

    const row = await uow.tx
      .updateTable('persons')
      .set({ birth_date: input.birthDate })
      .where('person_id', '=', input.personId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const person = toPerson(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'person',
      entityId: input.personId,
      action: 'person.birth-date-set',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      ...(previous === undefined
        ? {}
        : { previousState: { birthDate: previous.birthDate ?? null } }),
      resultingState: { birthDate: person.birthDate ?? null },
    });
    return person;
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

  async findByAlias(organizationId: string, alias: string): Promise<Person | undefined> {
    const row = await this.db
      .selectFrom('persons')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('alias', '=', alias)
      .executeTakeFirst();
    return row ? toPerson(row) : undefined;
  }

  async replaceByAlias(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly alias: string;
      readonly displayName: string;
      readonly naturalKey?: NaturalKey;
    } & AuditContext,
  ): Promise<{ readonly person: Person; readonly created: boolean }> {
    const existing = await this.findByAlias(input.organizationId, input.alias);
    if (!existing) {
      const registered = await this.register(uow, input);
      return { person: registered.person, created: true };
    }
    if (input.naturalKey) {
      const claimed = await this.findByNaturalKey(input.organizationId, input.naturalKey);
      if (claimed && claimed.personId !== existing.personId) {
        throw new InvariantViolationError('Another person already carries this natural key', {
          alias: input.alias,
          conflictsWith: claimed.personId,
        });
      }
    }
    const row = await uow.tx
      .updateTable('persons')
      .set({
        display_name: input.displayName,
        ...(input.naturalKey === undefined
          ? {}
          : {
              natural_key_kind: input.naturalKey.kind,
              natural_key_value: input.naturalKey.value,
              natural_key_normalised: normaliseNaturalKey(input.naturalKey.value),
            }),
      })
      .where('person_id', '=', existing.personId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const person = toPerson(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'person',
      entityId: person.personId,
      action: 'person.replaced',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: {
        personId: existing.personId,
        alias: existing.alias,
        displayName: existing.displayName,
      },
      resultingState: {
        personId: person.personId,
        alias: person.alias,
        displayName: person.displayName,
      },
    });
    return { person, created: false };
  }

  private async suggestPersonAlias(organizationId: string, displayName: string): Promise<string> {
    const rows = await this.db
      .selectFrom('persons')
      .select('alias')
      .where('organization_id', '=', organizationId)
      .where('alias', 'is not', null)
      .execute();
    const aliases = rows.flatMap((row) => (row.alias === null ? [] : [row.alias]));
    return suggestAvailableAlias(displayName, aliases) ?? nextAlias('participant', aliases);
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

  /**
   * Removes a membership.
   *
   * Hard delete, not a `deleted_at` flag: `players` carries none, and its
   * `players_person_team_unique(person_id, team_id)` constraint already
   * assumes removal means gone — a soft-deleted row would collide with that
   * constraint the moment the same person rejoins the same team. The audit
   * log, not the row, is this table's history — the same shape
   * `MatchAssignmentRepository.revoke` already uses for `match_assignments`.
   * A no-op (unknown `playerId`) is silently accepted, matching `revoke`.
   */
  async dismiss(
    uow: UnitOfWork,
    input: { readonly playerId: string; readonly organizationId: string } & AuditContext,
  ): Promise<void> {
    const existing = await uow.tx
      .selectFrom('players')
      .selectAll()
      .where('player_id', '=', input.playerId)
      .executeTakeFirst();
    if (!existing) return;

    await uow.tx.deleteFrom('players').where('player_id', '=', input.playerId).execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'player',
      entityId: input.playerId,
      action: 'player.dismissed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toPlayer(existing) },
    });
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

  /** Bulk lookup, for resolving a submitted set of person ids in one query. */
  async findPersons(personIds: readonly string[]): Promise<readonly Person[]> {
    if (personIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('persons')
      .selectAll()
      .where('person_id', 'in', personIds)
      .execute();
    return rows.map(toPerson);
  }

  /**
   * Chronological list of tournaments and teams a person has been entered under
   * within an organization.
   */
  async competitionHistory(
    organizationId: string,
    personId: string,
  ): Promise<readonly PersonCompetitionHistoryItem[]> {
    const rows = await this.db
      .selectFrom('players')
      .innerJoin('teams', 'teams.team_id', 'players.team_id')
      .innerJoin('entrants', 'entrants.team_id', 'teams.team_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'entrants.tournament_id')
      .select([
        'tournaments.tournament_id as tournamentId',
        'tournaments.name as tournamentName',
        'tournaments.alias as tournamentAlias',
        'tournaments.descriptor_id as descriptorId',
        'tournaments.descriptor_version as descriptorVersion',
        'tournaments.created_at as tournamentCreatedAt',
        'teams.team_id as teamId',
        'teams.name as teamName',
        'players.role as role',
        'entrants.entrant_id as entrantId',
        'entrants.abbreviation as entrantAbbreviation',
      ])
      .where('players.person_id', '=', personId)
      .where('tournaments.organization_id', '=', organizationId)
      .where('tournaments.status', '!=', 'draft')
      .orderBy('tournaments.created_at', 'asc')
      .execute();

    return rows.map((r) => ({
      tournamentId: r.tournamentId,
      tournamentName: r.tournamentName,
      tournamentAlias: r.tournamentAlias,
      disciplineRef: { descriptorId: r.descriptorId, version: r.descriptorVersion },
      teamId: r.teamId,
      teamName: r.teamName,
      role: r.role as PlayerRole,
      entrantId: r.entrantId,
      entrantName: r.teamName,
      entrantAbbreviation: r.entrantAbbreviation ?? undefined,
      createdAt: new Date(r.tournamentCreatedAt),
    }));
  }

  /**
   * Organization-wide collector totals for a person, grouped by discipline.
   */
  async careerTotals(
    organizationId: string,
    personId: string,
  ): Promise<readonly PersonCareerDisciplineTotals[]> {
    const rows = await this.db
      .selectFrom('statistic_totals')
      .select(['collector_code'])
      .select((eb) => eb.fn.sum<number>('value').as('value'))
      .select((eb) => eb.fn.sum<number>('samples').as('samples'))
      .where('organization_id', '=', organizationId)
      .where('actor_id', '=', personId)
      .where('actor_granularity', '=', 'person')
      .where('competition_granularity', '=', 'organization')
      .groupBy('collector_code')
      .execute();

    if (rows.length === 0) return [];

    const valueByCollector = new Map<string, { value: number; samples: number }>();
    for (const r of rows) {
      valueByCollector.set(r.collector_code, {
        value: Number(r.value ?? 0),
        samples: Number(r.samples ?? 0),
      });
    }

    const descriptorRows = await this.db
      .selectFrom('discipline_descriptors')
      .select(['descriptor_id as descriptorId', 'name', 'document'])
      .execute();

    const result: PersonCareerDisciplineTotals[] = [];
    const claimedCollectors = new Set<string>();

    for (const descRow of descriptorRows) {
      const descriptor =
        typeof descRow.document === 'string' ? JSON.parse(descRow.document) : descRow.document;
      const orgCollectors: Array<{ code: string }> = (descriptor.collectors ?? []).filter(
        (c: { granularity?: { actor: string; competition: string } }) =>
          c.granularity?.actor === 'person' && c.granularity?.competition === 'organization',
      );
      if (orgCollectors.length > 0) {
        const disciplineTotals: PersonCareerStatisticTotal[] = [];
        for (const c of orgCollectors) {
          const stats = valueByCollector.get(c.code);
          if (stats) {
            disciplineTotals.push({
              collectorCode: c.code,
              value: stats.value,
              samples: stats.samples,
            });
            claimedCollectors.add(c.code);
          }
        }
        if (disciplineTotals.length > 0) {
          result.push({
            descriptorId: descRow.descriptorId,
            disciplineName: descRow.name,
            totals: disciplineTotals,
          });
        }
      }
    }

    const unclaimed: PersonCareerStatisticTotal[] = [];
    for (const [code, stats] of valueByCollector.entries()) {
      if (!claimedCollectors.has(code)) {
        unclaimed.push({
          collectorCode: code,
          value: stats.value,
          samples: stats.samples,
        });
      }
    }
    if (unclaimed.length > 0) {
      result.push({
        descriptorId: 'default',
        totals: unclaimed,
      });
    }

    return result;
  }
}

export interface PersonCompetitionHistoryItem {
  readonly tournamentId: string;
  readonly tournamentName: string;
  readonly tournamentAlias: string;
  readonly disciplineRef: { readonly descriptorId: string; readonly version: string };
  readonly teamId: string;
  readonly teamName: string;
  readonly role: PlayerRole;
  readonly entrantId?: string;
  readonly entrantName?: string;
  readonly entrantAbbreviation?: string;
  readonly createdAt: Date;
}

export interface PersonCareerStatisticTotal {
  readonly collectorCode: string;
  readonly value: number;
  readonly samples: number;
}

export interface PersonCareerDisciplineTotals {
  readonly descriptorId: string;
  readonly disciplineName?: string;
  readonly totals: readonly PersonCareerStatisticTotal[];
}

function nextAlias(prefix: string, aliases: readonly string[]): string {
  let ordinal = 1;
  while (aliases.includes(`${prefix}-${ordinal}`)) ordinal += 1;
  return `${prefix}-${ordinal}`;
}

interface PersonRow {
  readonly person_id: string;
  readonly organization_id: string;
  readonly alias: string | null;
  readonly display_name: string;
  readonly natural_key_kind: string | null;
  readonly natural_key_value: string | null;
  readonly nationality?: string | null;
  readonly birth_date?: string | Date | null;
  readonly photo_object_id?: string | null;
}

function toPerson(row: PersonRow): Person {
  let birthDate: string | undefined = undefined;
  if (row.birth_date !== null && row.birth_date !== undefined) {
    if (typeof row.birth_date === 'string') {
      birthDate = row.birth_date.slice(0, 10);
    } else if (row.birth_date instanceof Date) {
      birthDate = row.birth_date.toISOString().slice(0, 10);
    }
  }
  return {
    personId: row.person_id,
    organizationId: row.organization_id,
    displayName: row.display_name,
    ...(row.alias === null ? {} : { alias: row.alias }),
    ...(row.natural_key_kind === null || row.natural_key_value === null
      ? {}
      : { naturalKey: { kind: row.natural_key_kind, value: row.natural_key_value } }),
    ...(row.nationality === null || row.nationality === undefined
      ? {}
      : { nationality: row.nationality }),
    ...(birthDate === undefined ? {} : { birthDate }),
    ...(row.photo_object_id === null || row.photo_object_id === undefined
      ? {}
      : { photoObjectId: row.photo_object_id }),
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
