import {
  validateAttributes,
  type Entrant,
  type EntrantAttribute,
  type SeedPlacement,
  type StageAllocation,
  type Team,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';
import { toEntrant, toEntrantAttribute, toTeam } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

export interface AuditContext {
  readonly organizationId: string;
  readonly actor: string;
  readonly authorizationContext: string;
}

export class EnrollmentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async createTeam(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly clubId?: string;
      readonly name: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Team> {
    const teamId = newId();
    const row = await uow.tx
      .insertInto('teams')
      .values({
        team_id: teamId,
        organization_id: input.organizationId,
        club_id: input.clubId ?? null,
        name: input.name,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const team = toTeam(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'team',
      entityId: teamId,
      action: 'team.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...team },
    });
    return team;
  }

  /** Registration intake. Status transitions are audited individually. */
  async registerEntrant(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly entrantRef: Entrant['entrantRef'];
      readonly seed?: number;
    } & AuditContext,
  ): Promise<Entrant> {
    const entrantId = newId();
    const row = await uow.tx
      .insertInto('entrants')
      .values({
        entrant_id: entrantId,
        tournament_id: input.tournamentId,
        entrant_kind: input.entrantRef.kind,
        person_id: input.entrantRef.kind === 'person' ? input.entrantRef.personId : null,
        team_id: input.entrantRef.kind === 'team' ? input.entrantRef.teamId : null,
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
      payload: { entrantId, tournamentId: input.tournamentId, status: entrant.status },
    });
    return entrant;
  }

  async setEntrantStatus(
    uow: UnitOfWork,
    input: {
      readonly entrantId: string;
      readonly status: Entrant['status'];
      readonly reason?: string;
    } & AuditContext,
  ): Promise<Entrant> {
    const before = await this.findEntrant(input.entrantId);
    if (!before) {
      throw new InvariantViolationError(`Entrant ${input.entrantId} does not exist`, {
        entrantId: input.entrantId,
      });
    }

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
}
