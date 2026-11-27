import {
  Abbreviation,
  deriveEntrantAbbreviation,
  validateAttributes,
  type Entrant,
  type EntrantAttribute,
  type SeedPlacement,
  type StageAllocation,
} from '@copalibre/domain';
import type { Kysely, Transaction } from 'kysely';
import { InvariantViolationError } from '../../errors.js';
import { newId } from '../../ids.js';
import { toEntrant, toEntrantAttribute } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { EventOrigin } from '../../outbox.js';
import type { UnitOfWork } from '../../transaction.js';
import { type AuditContext, assertAbbreviation } from './enrollment-support.js';

/** Entrant registration, abbreviation, status, attributes, seeds and listings. */
export class EntrantRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findEntrantForRef(
    tournamentId: string,
    entrantRef: Entrant['entrantRef'],
  ): Promise<Entrant | undefined> {
    const row = await this.db
      .selectFrom('entrants')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .where(
        entrantRef.kind === 'person' ? 'person_id' : 'team_id',
        '=',
        entrantRef.kind === 'person' ? entrantRef.personId : entrantRef.teamId,
      )
      .executeTakeFirst();
    return row ? toEntrant(row) : undefined;
  }

  /** Registration intake. Status transitions are audited individually. */
  async registerEntrant(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly entrantRef: Entrant['entrantRef'];
      readonly abbreviation?: string;
      readonly seed?: number;
      readonly origin?: EventOrigin;
    } & AuditContext,
  ): Promise<Entrant> {
    const entrantId = newId();
    const abbreviation = await this.resolveRegistrationAbbreviation(uow.tx, input);
    const row = await uow.tx
      .insertInto('entrants')
      .values({
        entrant_id: entrantId,
        tournament_id: input.tournamentId,
        entrant_kind: input.entrantRef.kind,
        person_id: input.entrantRef.kind === 'person' ? input.entrantRef.personId : null,
        team_id: input.entrantRef.kind === 'team' ? input.entrantRef.teamId : null,
        abbreviation: abbreviation ?? null,
        seed: input.seed ?? null,
        status: 'pending',
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const entrant = toEntrant(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'entrant',
      entityId: entrantId,
      action: 'entrant.registered',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...entrant },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${input.tournamentId}`,
      entityId: entrantId,
      eventType: 'entrant.registered',
      projectionVersion: 1,
      payload: {
        entrantId,
        tournamentId: input.tournamentId,
        status: entrant.status,
        entrantKind: input.entrantRef.kind,
        actor: input.actor,
        ...(input.origin === undefined ? {} : { origin: input.origin }),
      },
    });
    return entrant;
  }

  /** Explicit officer override for a tournament-scoped entrant label. */
  async setEntrantAbbreviation(
    uow: UnitOfWork,
    input: {
      readonly entrantId: string;
      readonly abbreviation: string;
    } & AuditContext,
  ): Promise<Entrant> {
    assertAbbreviation(input.abbreviation);
    const beforeRow = await uow.tx
      .selectFrom('entrants')
      .selectAll()
      .where('entrant_id', '=', input.entrantId)
      .executeTakeFirst();
    if (!beforeRow) {
      throw new InvariantViolationError(`Entrant ${input.entrantId} does not exist`, {
        entrantId: input.entrantId,
      });
    }
    const before = toEntrant(beforeRow);
    if (
      !(await this.isEntrantAbbreviationAvailable(
        uow.tx,
        before.tournamentId,
        input.abbreviation,
        input.entrantId,
      ))
    ) {
      throw new InvariantViolationError(
        `Abbreviation "${input.abbreviation}" is already used by another entrant in this tournament`,
        { abbreviation: input.abbreviation, tournamentId: before.tournamentId },
      );
    }

    const row = await uow.tx
      .updateTable('entrants')
      .set({ abbreviation: input.abbreviation })
      .where('entrant_id', '=', input.entrantId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const entrant = toEntrant(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'entrant',
      entityId: input.entrantId,
      action: 'entrant.abbreviation-set',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { abbreviation: before.abbreviation ?? null },
      resultingState: { abbreviation: entrant.abbreviation },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${entrant.tournamentId}`,
      entityId: input.entrantId,
      eventType: 'entrant.abbreviation-set',
      projectionVersion: 1,
      payload: {
        entrantId: input.entrantId,
        tournamentId: entrant.tournamentId,
        abbreviation: entrant.abbreviation,
      },
    });
    return entrant;
  }

  async listEntrantsNeedingAbbreviation(tournamentId: string): Promise<readonly Entrant[]> {
    const rows = await this.db
      .selectFrom('entrants')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .where('abbreviation', 'is', null)
      .orderBy('created_at')
      .execute();
    return rows.map(toEntrant);
  }

  async setEntrantStatus(
    uow: UnitOfWork,
    input: {
      readonly entrantId: string;
      readonly status: Entrant['status'];
      readonly reason?: string;
    } & AuditContext,
  ): Promise<Entrant> {
    const rowBefore = await uow.tx
      .selectFrom('entrants')
      .selectAll()
      .where('entrant_id', '=', input.entrantId)
      .executeTakeFirst();
    if (!rowBefore) {
      throw new InvariantViolationError(`Entrant ${input.entrantId} does not exist`, {
        entrantId: input.entrantId,
      });
    }
    const before = toEntrant(rowBefore);

    const row = await uow.tx
      .updateTable('entrants')
      .set({ status: input.status })
      .where('entrant_id', '=', input.entrantId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const entrant = toEntrant(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'entrant',
      entityId: input.entrantId,
      action: `entrant.${input.status}`,
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { status: before.status },
      resultingState: { status: entrant.status },
      reason: input.reason,
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${entrant.tournamentId}`,
      entityId: input.entrantId,
      eventType: 'entrant.status-changed',
      projectionVersion: 1,
      payload: { entrantId: input.entrantId, status: entrant.status },
    });
    return entrant;
  }

  /**
   * Replaces an entrant's attribute set as one audited write.
   *
   * Replace rather than merge: an operator correcting a region typo should not
   * have to delete the wrong value first, and the audit record then reads as
   * "these were the attributes before, these are the attributes now" instead of
   * a per-key trickle nobody can reconstruct a decision from.
   */
  async setEntrantAttributes(
    uow: UnitOfWork,
    input: {
      readonly entrantId: string;
      readonly attributes: readonly EntrantAttribute[];
    } & AuditContext,
  ): Promise<readonly EntrantAttribute[]> {
    // Read through the caller's transaction, not the pool: an entrant
    // registered earlier in this same unit of work is not visible outside it,
    // and refusing to attribute one would be a lie about what exists.
    const row = await uow.tx
      .selectFrom('entrants')
      .selectAll()
      .where('entrant_id', '=', input.entrantId)
      .executeTakeFirst();
    if (!row) {
      throw new InvariantViolationError(`Entrant ${input.entrantId} does not exist`, {
        entrantId: input.entrantId,
      });
    }
    const entrant = toEntrant(row);

    const validated = validateAttributes({
      entrantId: input.entrantId,
      attributes: input.attributes,
    });
    if (!validated.ok) throw validated.error;

    const previousRows = await uow.tx
      .selectFrom('entrant_attributes')
      .selectAll()
      .where('entrant_id', '=', input.entrantId)
      .orderBy('key')
      .execute();
    const previous = previousRows.map(toEntrantAttribute);

    await uow.tx
      .deleteFrom('entrant_attributes')
      .where('entrant_id', '=', input.entrantId)
      .execute();

    if (input.attributes.length > 0) {
      await uow.tx
        .insertInto('entrant_attributes')
        .values(
          input.attributes.map((attribute) => ({
            entrant_attribute_id: newId(),
            entrant_id: input.entrantId,
            tournament_id: entrant.tournamentId,
            key: attribute.key,
            kind: attribute.kind,
            value_text: attribute.kind === 'categorical' ? String(attribute.value) : null,
            value_numeric: attribute.kind === 'numeric' ? Number(attribute.value) : null,
            created_at: new Date(),
          })),
        )
        .execute();
    }

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'entrant',
      entityId: input.entrantId,
      action: 'entrant.attributes-set',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { attributes: [...previous] },
      resultingState: { attributes: [...input.attributes] },
    });

    return [...input.attributes];
  }

  /**
   * Applies a computed seed order, recording the mode that produced it.
   *
   * The engine decides the order and this writes it, so the audit trail answers
   * "why is this club on seed 3" with the rule that placed it — a manual
   * placement names the operator who chose it, and a weighted one names the
   * attribute it ranked on. A bracket dispute is otherwise unanswerable.
   */
  async setEntrantSeeds(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly placements: readonly SeedPlacement[];
      readonly allocation: StageAllocation;
      /**
       * Seed of the draw that produced this order, when one did. Recorded so
       * the draw can be replayed and audited — a draw nobody can reproduce is a
       * draw nobody can check.
       */
      readonly drawSeed?: number;
    } & AuditContext,
  ): Promise<readonly Entrant[]> {
    const knownRows = await uow.tx
      .selectFrom('entrants')
      .selectAll()
      .where('tournament_id', '=', input.tournamentId)
      .orderBy('created_at')
      .execute();
    const known = knownRows.map(toEntrant);
    const byId = new Map(known.map((entrant) => [entrant.entrantId, entrant]));

    for (const placement of input.placements) {
      if (!byId.has(placement.entrantId)) {
        throw new InvariantViolationError(
          `Entrant ${placement.entrantId} is not registered in tournament ${input.tournamentId}`,
          { entrantId: placement.entrantId, tournamentId: input.tournamentId },
        );
      }
    }

    const updated: Entrant[] = [];
    for (const placement of input.placements) {
      const row = await uow.tx
        .updateTable('entrants')
        .set({ seed: placement.seed })
        .where('entrant_id', '=', placement.entrantId)
        .returningAll()
        .executeTakeFirstOrThrow();
      updated.push(toEntrant(row));
    }

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: input.tournamentId,
      action: 'entrants.seeded',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: {
        seeds: known.map((entrant) => ({
          entrantId: entrant.entrantId,
          seed: entrant.seed ?? null,
        })),
      },
      resultingState: {
        allocation: { ...input.allocation },
        seeds: [...input.placements],
        ...(input.drawSeed === undefined ? {} : { drawSeed: input.drawSeed }),
      },
    });

    return updated;
  }

  async listEntrantAttributes(entrantId: string): Promise<readonly EntrantAttribute[]> {
    const rows = await this.db
      .selectFrom('entrant_attributes')
      .selectAll()
      .where('entrant_id', '=', entrantId)
      .orderBy('key')
      .execute();
    return rows.map(toEntrantAttribute);
  }

  /** Every entrant's attributes in one tournament, keyed by entrant id. */
  async listTournamentAttributes(
    tournamentId: string,
  ): Promise<ReadonlyMap<string, readonly EntrantAttribute[]>> {
    const rows = await this.db
      .selectFrom('entrant_attributes')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .orderBy('entrant_id')
      .orderBy('key')
      .execute();

    const byEntrant = new Map<string, EntrantAttribute[]>();
    for (const row of rows) {
      const list = byEntrant.get(row.entrant_id) ?? [];
      list.push(toEntrantAttribute(row));
      byEntrant.set(row.entrant_id, list);
    }
    return byEntrant;
  }

  async findEntrant(entrantId: string): Promise<Entrant | undefined> {
    const row = await this.db
      .selectFrom('entrants')
      .selectAll()
      .where('entrant_id', '=', entrantId)
      .executeTakeFirst();
    return row ? toEntrant(row) : undefined;
  }

  async listEntrants(tournamentId: string): Promise<readonly Entrant[]> {
    const rows = await this.db
      .selectFrom('entrants')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .orderBy('created_at')
      .execute();
    return rows.map(toEntrant);
  }

  async resolveRegistrationAbbreviation(
    executor: Kysely<Database> | Transaction<Database>,
    input: {
      readonly tournamentId: string;
      readonly entrantRef: Entrant['entrantRef'];
      readonly abbreviation?: string;
    },
  ): Promise<string | undefined> {
    if (input.abbreviation !== undefined) {
      const explicit = Abbreviation.create(input.abbreviation);
      if (
        explicit.ok &&
        (await this.isEntrantAbbreviationAvailable(
          executor,
          input.tournamentId,
          explicit.value.toString(),
        ))
      ) {
        return explicit.value.toString();
      }
    }

    const candidate = await this.derivedEntrantAbbreviation(executor, input.entrantRef);
    if (candidate === undefined) return undefined;
    return (await this.isEntrantAbbreviationAvailable(executor, input.tournamentId, candidate))
      ? candidate
      : undefined;
  }

  async derivedEntrantAbbreviation(
    executor: Kysely<Database> | Transaction<Database>,
    entrantRef: Entrant['entrantRef'],
  ): Promise<string | undefined> {
    if (entrantRef.kind === 'person') {
      const person = await executor
        .selectFrom('persons')
        .select('display_name')
        .where('person_id', '=', entrantRef.personId)
        .executeTakeFirst();
      return person ? deriveEntrantAbbreviation(person.display_name) : undefined;
    }

    const team = await executor
      .selectFrom('teams')
      .leftJoin('clubs', 'clubs.club_id', 'teams.club_id')
      .select([
        'teams.name as name',
        'teams.abbreviation as team_abbreviation',
        'clubs.abbreviation as club_abbreviation',
      ])
      .where('teams.team_id', '=', entrantRef.teamId)
      .executeTakeFirst();
    return team
      ? deriveEntrantAbbreviation(
          team.name,
          team.team_abbreviation ?? undefined,
          team.club_abbreviation ?? undefined,
        )
      : undefined;
  }

  async isEntrantAbbreviationAvailable(
    executor: Kysely<Database> | Transaction<Database>,
    tournamentId: string,
    abbreviation: string,
    excludingEntrantId?: string,
  ): Promise<boolean> {
    let query = executor
      .selectFrom('entrants')
      .select('entrant_id')
      .where('tournament_id', '=', tournamentId)
      .where('abbreviation', '=', abbreviation);
    if (excludingEntrantId !== undefined) {
      query = query.where('entrant_id', '!=', excludingEntrantId);
    }
    return (await query.executeTakeFirst()) === undefined;
  }
}
