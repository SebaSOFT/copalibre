import { resolveAlias, type AliasRedirect, type AliasResolution } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { newId } from '../ids.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';

/**
 * Alias resolution for page handlers.
 *
 * The decision itself is `@copalibre/routing`'s and pure; this supplies the two
 * facts it needs — which aliases are current and which were renamed — both
 * scoped to one organization.
 */

export type AliasScopeName = 'organization' | 'tournament';

export class AliasRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** Records a rename, so the old URL keeps working. */
  async recordRename(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly scope: AliasScopeName;
      readonly oldAlias: string;
      readonly newAlias: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<void> {
    await uow.tx
      .insertInto('alias_redirects')
      .values({
        redirect_id: newId(),
        organization_id: input.organizationId,
        scope: input.scope,
        old_alias: input.oldAlias,
        new_alias: input.newAlias,
        created_at: new Date(),
      })
      .onConflict((conflict) =>
        conflict
          .columns(['organization_id', 'scope', 'old_alias'])
          .doUpdateSet({ new_alias: input.newAlias }),
      )
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'alias-redirect',
      entityId: input.organizationId,
      action: 'alias.renamed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { scope: input.scope, from: input.oldAlias, to: input.newAlias },
    });
  }

  /**
   * Whether this alias is current, renamed, or nothing at all.
   *
   * Unknown is unknown: a page handler turns it into a 404 rather than guessing
   * at a near match, because "did you mean" on a URL is how one organization's
   * spectator lands on another's tournament.
   */
  async resolveTournamentAlias(organizationId: string, alias: string): Promise<AliasResolution> {
    const [current, redirects] = await Promise.all([
      this.db
        .selectFrom('tournaments')
        .select('alias')
        .where('organization_id', '=', organizationId)
        .execute(),
      this.redirectsFor(organizationId, 'tournament'),
    ]);

    return resolveAlias(organizationId, alias, new Set(current.map((row) => row.alias)), redirects);
  }

  async redirectsFor(
    organizationId: string,
    scope: AliasScopeName,
  ): Promise<readonly AliasRedirect[]> {
    const rows = await this.db
      .selectFrom('alias_redirects')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('scope', '=', scope)
      .execute();

    return rows.map((row) => ({
      organizationId: row.organization_id,
      oldAlias: row.old_alias,
      newAlias: row.new_alias,
    }));
  }
}
