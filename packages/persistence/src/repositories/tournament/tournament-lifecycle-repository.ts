import { Alias, transitionTournament, type Tournament } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../../errors.js';
import { newId } from '../../ids.js';
import { toTournament } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import { TournamentQueryRepository } from './tournament-queries.js';
import { type CreateTournamentInput } from './tournament-support.js';

/** Tournament creation, settings, publication, archival and presentation writes. */
export class TournamentLifecycleRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly queries: TournamentQueryRepository,
  ) {}

  async create(uow: UnitOfWork, input: CreateTournamentInput): Promise<Tournament> {
    if (input.showYouthProfiles && !input.includesMinors) {
      throw new InvariantViolationError(
        'Youth profiles can only be enabled when participants include minors',
        { alias: input.alias },
      );
    }
    const alias = Alias.create('tournament', input.alias);
    if (!alias.ok) {
      throw new InvariantViolationError(alias.error.message, { alias: input.alias });
    }

    const tournamentId = newId();
    const row = await uow.tx
      .insertInto('tournaments')
      .values({
        tournament_id: tournamentId,
        organization_id: input.organizationId,
        alias: alias.value.value,
        name: input.name,
        descriptor_id: input.descriptor.descriptorId,
        descriptor_version: input.descriptor.version,
        profile_id: input.profile?.profileId ?? null,
        profile_version: input.profile?.version ?? null,
        includes_minors: input.includesMinors ?? false,
        show_youth_profiles: input.showYouthProfiles ?? false,
        ruleset_id: null,
        status: 'draft',
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const tournament = toTournament(row);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: tournamentId,
      action: 'tournament.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...tournament },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${tournamentId}`,
      entityId: tournamentId,
      eventType: 'tournament.created',
      projectionVersion: 1,
      payload: {
        tournamentId,
        alias: tournament.alias,
        status: tournament.status,
        name: tournament.name,
        includesMinors: tournament.includesMinors ?? false,
        showYouthProfiles: tournament.showYouthProfiles ?? false,
        actor: input.actor,
        ...(input.origin === undefined ? {} : { origin: input.origin }),
      },
    });

    return tournament;
  }

  /**
   * Whether a tournament has any recorded match result, and how many
   * entrants it currently has accepted — the two facts a tournament-settings
   * edit's mutation classification needs, computed together since both are
   * cheap single-table reads.
   */
  async settingsMutationContext(
    tournamentId: string,
  ): Promise<{ readonly hasRecordedResults: boolean; readonly acceptedEntrantCount: number }> {
    const [recordedMatch, acceptedRows] = await Promise.all([
      this.db
        .selectFrom('matches')
        .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
        .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
        .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
        .select('match_id')
        .where('seasons.tournament_id', '=', tournamentId)
        .where('matches.result', 'is not', null)
        .limit(1)
        .executeTakeFirst(),
      this.db
        .selectFrom('entrants')
        .select('entrant_id')
        .where('tournament_id', '=', tournamentId)
        .where('status', '=', 'accepted')
        .execute(),
    ]);
    return {
      hasRecordedResults: recordedMatch !== undefined,
      acceptedEntrantCount: acceptedRows.length,
    };
  }

  /** Renames a tournament — its name carries no structural consequence, so this is always permitted. */
  async renameTournament(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly name: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    const row = await uow.tx
      .updateTable('tournaments')
      .set({ name: input.name })
      .where('tournament_id', '=', input.tournamentId)
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      throw new NotFoundError(`Tournament ${input.tournamentId} does not exist`, {
        tournamentId: input.tournamentId,
      });
    }
    const tournament = toTournament(row);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: input.tournamentId,
      action: 'tournament.renamed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { name: input.name },
    });

    return tournament;
  }

  async publish(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    const current = await this.queries.findById(input.tournamentId);
    if (!current) {
      throw new NotFoundError(`Tournament ${input.tournamentId} does not exist`, {
        tournamentId: input.tournamentId,
      });
    }

    const row = await uow.tx
      .updateTable('tournaments')
      .set({ status: 'published' })
      .where('tournament_id', '=', input.tournamentId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const published = toTournament(row);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: input.tournamentId,
      action: 'tournament.published',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { status: current.status },
      resultingState: { status: published.status },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${input.tournamentId}`,
      entityId: input.tournamentId,
      eventType: 'tournament.published',
      projectionVersion: 1,
      payload: { tournamentId: input.tournamentId },
    });

    return published;
  }

  /**
   * Archives a tournament: `finished` → `archived` only. The state
   * machine itself refuses every other starting state, so this never needs
   * its own separate "is this actually done?" check — `transitionTournament`
   * is the single source of truth `publish` predates and does not yet use.
   */
  async archive(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    const current = await this.queries.findById(input.tournamentId);
    if (!current) {
      throw new NotFoundError(`Tournament ${input.tournamentId} does not exist`, {
        tournamentId: input.tournamentId,
      });
    }

    const transition = transitionTournament(current.status, 'archived');
    if (!transition.ok) {
      throw new InvariantViolationError(transition.error.message, {
        tournamentId: input.tournamentId,
        from: current.status,
      });
    }

    const row = await uow.tx
      .updateTable('tournaments')
      .set({ status: 'archived', archived_at: new Date() })
      .where('tournament_id', '=', input.tournamentId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const archived = toTournament(row);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: input.tournamentId,
      action: 'tournament.archived',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { status: current.status },
      resultingState: { status: archived.status, archivedAt: archived.archivedAt },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${input.tournamentId}`,
      entityId: input.tournamentId,
      eventType: 'tournament.archived',
      projectionVersion: 1,
      payload: { tournamentId: input.tournamentId },
    });

    return archived;
  }

  /**
   * Sets or clears the organizer's featured flag — a presentation choice about
   * the organization's public page, carrying no competition meaning, audited
   * like every other tournament-record change.
   */
  async setFeatured(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly featured: boolean;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    const current = await this.queries.findInTransaction(uow, input.tournamentId);
    if (!current || current.organizationId !== input.organizationId) {
      throw new NotFoundError(`Tournament ${input.tournamentId} does not exist`, {
        tournamentId: input.tournamentId,
      });
    }

    const row = await uow.tx
      .updateTable('tournaments')
      .set({ featured: input.featured })
      .where('tournament_id', '=', input.tournamentId)
      .where('organization_id', '=', input.organizationId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const updated = toTournament(row);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: input.tournamentId,
      action: 'tournament.featured_updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { featured: current.featured },
      resultingState: { featured: updated.featured },
    });

    return updated;
  }

  /**
   * Sets tournament publication privacy. These are presentation controls, so
   * changing them is always `safe`: they do not change entrants, fixtures or
   * recorded results. The audit entry and projection event commit atomically.
   */
  async setPublicationPrivacy(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly includesMinors: boolean;
      readonly showYouthProfiles: boolean;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    if (input.showYouthProfiles && !input.includesMinors) {
      throw new InvariantViolationError(
        'Youth profiles can only be enabled when participants include minors',
        { tournamentId: input.tournamentId },
      );
    }
    const current = await this.queries.findInTransaction(uow, input.tournamentId);
    if (!current || current.organizationId !== input.organizationId) {
      throw new NotFoundError(`Tournament ${input.tournamentId} does not exist`, {
        tournamentId: input.tournamentId,
      });
    }

    const row = await uow.tx
      .updateTable('tournaments')
      .set({
        includes_minors: input.includesMinors,
        show_youth_profiles: input.showYouthProfiles,
      })
      .where('tournament_id', '=', input.tournamentId)
      .where('organization_id', '=', input.organizationId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const updated = toTournament(row);
    const previousState = {
      includesMinors: current.includesMinors ?? false,
      showYouthProfiles: current.showYouthProfiles ?? false,
    };
    const resultingState = {
      includesMinors: updated.includesMinors ?? false,
      showYouthProfiles: updated.showYouthProfiles ?? false,
    };

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: input.tournamentId,
      action: 'tournament.publication-privacy-updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState,
      resultingState,
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${input.tournamentId}`,
      entityId: input.tournamentId,
      eventType: 'tournament.publication-privacy-updated',
      projectionVersion: 1,
      payload: { tournamentId: input.tournamentId, ...resultingState },
    });

    return updated;
  }

  /**
   * Sets or clears the tournament's minimum rest between an entrant's matches. A scheduling
   * rule read at the next preview or publish: it moves no placement, so it is always safe.
   */
  async setMinimumRest(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      /** `null` clears the rule. */
      readonly minimumRestMinutes: number | null;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    const minutes = input.minimumRestMinutes;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0)) {
      throw new InvariantViolationError(
        'A minimum rest is a whole, non-negative number of minutes',
        {
          minimumRestMinutes: minutes,
        },
      );
    }
    const current = await this.queries.findInTransaction(uow, input.tournamentId);
    if (!current || current.organizationId !== input.organizationId) {
      throw new NotFoundError(`Tournament ${input.tournamentId} does not exist`, {
        tournamentId: input.tournamentId,
      });
    }

    const row = await uow.tx
      .updateTable('tournaments')
      .set({ minimum_rest_minutes: minutes })
      .where('tournament_id', '=', input.tournamentId)
      .where('organization_id', '=', input.organizationId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const updated = toTournament(row);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: input.tournamentId,
      action: 'tournament.minimum_rest_updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { minimumRestMinutes: current.minimumRestMinutes ?? null },
      resultingState: { minimumRestMinutes: updated.minimumRestMinutes ?? null },
    });

    return updated;
  }

  /**
   * Sets or clears a tournament's official emblem reference.
   */
  async updateEmblem(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly emblemObjectId: string | null;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    const current = await this.queries.findById(input.tournamentId);
    if (!current || current.organizationId !== input.organizationId) {
      throw new NotFoundError(`Tournament ${input.tournamentId} does not exist`, {
        tournamentId: input.tournamentId,
      });
    }

    const row = await uow.tx
      .updateTable('tournaments')
      .set({ emblem_object_id: input.emblemObjectId })
      .where('tournament_id', '=', input.tournamentId)
      .where('organization_id', '=', input.organizationId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const updated = toTournament(row);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: input.tournamentId,
      action: 'tournament.emblem_updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { emblemObjectId: current.emblemObjectId },
      resultingState: { emblemObjectId: updated.emblemObjectId },
    });

    return updated;
  }
}
