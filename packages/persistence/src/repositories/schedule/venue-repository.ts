import { validateVenue, type Venue } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../../errors.js';
import { newId } from '../../ids.js';
import { toVenue } from '../../mapping.js';
import { lockRowsForMutation } from '../../row-lock.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';
import { assertVenueAlias } from './schedule-support.js';

/** Venue reads and writes. */
export class VenueRepository {
  constructor(private readonly db: Kysely<Database>) {}

  // ---------------------------------------------------------------------------
  // Venues
  // ---------------------------------------------------------------------------

  async createVenue(uow: UnitOfWork, input: Omit<Venue, 'venueId'> & AuditContext): Promise<Venue> {
    assertVenueAlias(input.alias);
    const venueId = newId();
    const venue: Venue = {
      venueId,
      organizationId: input.organizationId,
      alias: input.alias,
      name: input.name,
      concurrentCapacity: input.concurrentCapacity,
      ...(input.address === undefined ? {} : { address: input.address }),
      ...(input.details === undefined ? {} : { details: input.details }),
    };

    const valid = validateVenue(venue);
    if (!valid.ok) throw valid.error;

    const row = await uow.tx
      .insertInto('venues')
      .values({
        venue_id: venueId,
        organization_id: input.organizationId,
        alias: input.alias,
        name: input.name,
        concurrent_capacity: input.concurrentCapacity,
        address: input.address ?? null,
        details: input.details === undefined ? null : JSON.stringify(input.details),
        created_at: new Date(),
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'venue',
      entityId: venueId,
      action: 'venue.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...toVenue(row) },
    });
    return toVenue(row);
  }

  async listVenues(organizationId: string): Promise<readonly Venue[]> {
    const rows = await this.db
      .selectFrom('venues')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('name')
      .execute();
    return rows.map(toVenue);
  }

  async findVenue(venueId: string): Promise<Venue | undefined> {
    const row = await this.db
      .selectFrom('venues')
      .selectAll()
      .where('venue_id', '=', venueId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return row ? toVenue(row) : undefined;
  }

  async deleteVenue(
    uow: UnitOfWork,
    input: { readonly venueId: string; readonly organizationId: string } & Omit<
      AuditContext,
      'organizationId'
    >,
  ): Promise<Venue> {
    const locked = await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('venues')
        .selectAll()
        .where('venue_id', '=', input.venueId)
        .where('organization_id', '=', input.organizationId)
        .orderBy('venue_id'),
    )
      .execute()
      .then((rows) => rows[0]);
    if (!locked || locked.deleted_at !== null) {
      throw new NotFoundError(`Venue ${input.venueId} does not exist`, { venueId: input.venueId });
    }

    const scheduleUse = await uow.tx
      .selectFrom('schedule_venues')
      .select('schedule_id')
      .where('venue_id', '=', input.venueId)
      .executeTakeFirst();
    if (scheduleUse) {
      throw new InvariantViolationError('Cannot remove a venue used by a schedule', {
        venueId: input.venueId,
      });
    }

    const deletedAt = new Date();
    const row = await uow.tx
      .updateTable('venues')
      .set({ deleted_at: deletedAt })
      .where('venue_id', '=', input.venueId)
      .where('organization_id', '=', input.organizationId)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirstOrThrow();
    const venue = toVenue(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'venue',
      entityId: input.venueId,
      action: 'venue.deleted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...venue },
      resultingState: { deletedAt: deletedAt.toISOString() },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `organization:${input.organizationId}`,
      entityId: input.venueId,
      eventType: 'venue.deleted',
      projectionVersion: 1,
      payload: { venueId: input.venueId, deletedAt: deletedAt.toISOString(), actor: input.actor },
    });
    return venue;
  }

  async restoreVenue(
    uow: UnitOfWork,
    input: { readonly venueId: string; readonly organizationId: string } & Omit<
      AuditContext,
      'organizationId'
    >,
  ): Promise<Venue> {
    const undoDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const row = await uow.tx
      .updateTable('venues')
      .set({ deleted_at: null })
      .where('venue_id', '=', input.venueId)
      .where('organization_id', '=', input.organizationId)
      .where('deleted_at', '>', undoDeadline)
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      throw new NotFoundError(`Venue ${input.venueId} is no longer available to restore`, {
        venueId: input.venueId,
      });
    }
    const venue = toVenue(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'venue',
      entityId: input.venueId,
      action: 'venue.restored',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...venue },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `organization:${input.organizationId}`,
      entityId: input.venueId,
      eventType: 'venue.restored',
      projectionVersion: 1,
      payload: { venueId: input.venueId, actor: input.actor },
    });
    return venue;
  }

  async updateVenue(
    uow: UnitOfWork,
    input: {
      readonly venueId: string;
      readonly organizationId: string;
      readonly name?: string;
      readonly concurrentCapacity?: number;
      readonly address?: string;
      readonly details?: Readonly<Record<string, string>>;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Venue> {
    const previous = await this.findVenue(input.venueId);
    const row = await uow.tx
      .updateTable('venues')
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.concurrentCapacity === undefined
          ? {}
          : { concurrent_capacity: input.concurrentCapacity }),
        ...(input.address === undefined ? {} : { address: input.address }),
        ...(input.details === undefined ? {} : { details: JSON.stringify(input.details) }),
      })
      .where('venue_id', '=', input.venueId)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirstOrThrow();

    const venue = toVenue(row);
    const valid = validateVenue(venue);
    if (!valid.ok) throw valid.error;

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'venue',
      entityId: input.venueId,
      action: 'venue.updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      ...(previous === undefined ? {} : { previousState: { ...previous } }),
      resultingState: { ...venue },
    });
    return venue;
  }
}
