import { type Tournament } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { toTournament } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';

/** Tournament listings and lookups. */
export class TournamentQueryRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Every non-archived tournament in an organization — the shared
   * "active only" filter every listing method is meant to go through. No
   * other listing method exists in this repository yet, so this is the
   * first one built with the filter in place, not a retrofit.
   */
  async listActiveByOrganization(organizationId: string): Promise<readonly Tournament[]> {
    const rows = await this.db
      .selectFrom('tournaments')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('status', '!=', 'archived')
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toTournament);
  }

  /**
   * Published, started, finished, or archived tournaments in an organization
   * (public read surface).
   */
  async listPublishedByOrganization(organizationId: string): Promise<readonly Tournament[]> {
    const rows = await this.db
      .selectFrom('tournaments')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('status', 'in', ['published', 'started', 'finished', 'archived'])
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toTournament);
  }

  /** Reads inside the caller's transaction, so a tournament created in it is found. */
  async findInTransaction(uow: UnitOfWork, tournamentId: string): Promise<Tournament | undefined> {
    const row = await uow.tx
      .selectFrom('tournaments')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .executeTakeFirst();
    return row ? toTournament(row) : undefined;
  }

  async findById(tournamentId: string): Promise<Tournament | undefined> {
    const row = await this.db
      .selectFrom('tournaments')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .executeTakeFirst();
    return row ? toTournament(row) : undefined;
  }

  /** Organization-scoped alias lookup: the URL contract's resolution path. */
  async findByScopedAlias(
    organizationAlias: string,
    tournamentAlias: string,
  ): Promise<Tournament | undefined> {
    const row = await this.db
      .selectFrom('tournaments')
      .innerJoin('organizations', 'organizations.organization_id', 'tournaments.organization_id')
      .selectAll('tournaments')
      .where('organizations.alias', '=', organizationAlias)
      .where('tournaments.alias', '=', tournamentAlias)
      .executeTakeFirst();
    return row ? toTournament(row) : undefined;
  }
}
