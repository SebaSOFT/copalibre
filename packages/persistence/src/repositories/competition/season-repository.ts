import { IMPLICIT_SEASON_NAME, validateSeason } from '@copalibre/domain';
import type { Season } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError } from '../../errors.js';
import { newId } from '../../ids.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';

/** Season (one running of a tournament) reads and writes. */
export class SeasonRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * One running of a tournament. Every tournament has at least one, so
   * no reader ever meets a stage without an edition.
   */
  async createSeason(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly name: string;
      readonly ordinal: number;
    } & AuditContext,
  ): Promise<Season> {
    const season: Season = {
      seasonId: newId(),
      tournamentId: input.tournamentId,
      name: input.name,
      ordinal: input.ordinal,
    };
    const valid = validateSeason(season);
    if (!valid.ok) throw new InvariantViolationError(valid.error.message, valid.error.details);

    await uow.tx
      .insertInto('seasons')
      .values({
        season_id: season.seasonId,
        tournament_id: season.tournamentId,
        name: season.name,
        ordinal: season.ordinal,
        created_at: new Date(),
      })
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'season',
      entityId: season.seasonId,
      action: 'season.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...season },
    });
    return season;
  }

  /** The edition a tournament is on, creating the implicit first one if needed. */
  async currentSeason(
    uow: UnitOfWork,
    input: { readonly tournamentId: string } & AuditContext,
  ): Promise<Season> {
    const row = await uow.tx
      .selectFrom('seasons')
      .selectAll()
      .where('tournament_id', '=', input.tournamentId)
      .orderBy('ordinal', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (row) {
      return {
        seasonId: row.season_id,
        tournamentId: row.tournament_id,
        name: row.name,
        ordinal: row.ordinal,
      };
    }

    return this.createSeason(uow, {
      ...input,
      name: IMPLICIT_SEASON_NAME,
      ordinal: 1,
    });
  }

  async listSeasons(tournamentId: string): Promise<readonly Season[]> {
    const rows = await this.db
      .selectFrom('seasons')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .orderBy('ordinal')
      .execute();
    return rows.map((row) => ({
      seasonId: row.season_id,
      tournamentId: row.tournament_id,
      name: row.name,
      ordinal: row.ordinal,
    }));
  }
}
