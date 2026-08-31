import type { ActorGranularity, CompetitionGranularity, TagFact } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { newId } from '../ids.js';
import { toIsoString } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';

/**
 * Tag facts.
 *
 * The repository writes and reads; it does not decide. **There is no update and
 * no delete** — lifting a tag is a second fact, not the removal of the first —
 * and there is no method that refuses anything on account of a tag. Whether a
 * tag applies is `tagsAt` in the domain, over the facts this returns.
 */

export interface TagQuery {
  readonly organizationId: string;
  readonly code?: string;
  readonly actorGranularity?: ActorGranularity;
  readonly actorId?: string;
  readonly competitionGranularity?: CompetitionGranularity;
  readonly competitionId?: string;
}

export class TagRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** Records an application or a lifting. Both are facts; neither is a delete. */
  async record(
    uow: UnitOfWork,
    input: { readonly organizationId: string; readonly fact: TagFact } & AuditContext,
  ): Promise<string> {
    const factId = newId();
    const { fact } = input;

    await uow.tx
      .insertInto('tag_facts')
      .values({
        fact_id: factId,
        organization_id: input.organizationId,
        code: fact.code,
        action: fact.action,
        actor_granularity: fact.actorGranularity,
        actor_id: fact.actorId,
        competition_granularity: fact.competitionGranularity,
        competition_id: fact.competitionId,
        actor: fact.actor,
        reason: fact.reason,
        occurred_at: new Date(fact.at),
        created_at: new Date(),
      })
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tag',
      entityId: factId,
      action: `tag.${fact.action}`,
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      reason: fact.reason,
      resultingState: { ...fact },
    });

    return factId;
  }

  /**
   * Every fact matching the query, oldest first — the history a console shows
   * next to a standing tag, so "why is he suspended" is answerable without a
   * second query.
   */
  async factsFor(query: TagQuery): Promise<readonly TagFact[]> {
    let statement = this.db
      .selectFrom('tag_facts')
      .selectAll()
      .where('organization_id', '=', query.organizationId);

    if (query.code !== undefined) statement = statement.where('code', '=', query.code);
    if (query.actorGranularity !== undefined) {
      statement = statement.where('actor_granularity', '=', query.actorGranularity);
    }
    if (query.actorId !== undefined) statement = statement.where('actor_id', '=', query.actorId);
    if (query.competitionGranularity !== undefined) {
      statement = statement.where('competition_granularity', '=', query.competitionGranularity);
    }
    if (query.competitionId !== undefined) {
      statement = statement.where('competition_id', '=', query.competitionId);
    }

    const rows = await statement.orderBy('occurred_at').orderBy('fact_id').execute();

    return rows.map((row) => ({
      code: row.code,
      action: row.action === 'lifted' ? 'lifted' : 'applied',
      actorGranularity: row.actor_granularity as ActorGranularity,
      actorId: row.actor_id,
      competitionGranularity: row.competition_granularity as CompetitionGranularity,
      competitionId: row.competition_id,
      actor: row.actor,
      reason: row.reason,
      at: toIsoString(row.occurred_at),
    }));
  }
}
