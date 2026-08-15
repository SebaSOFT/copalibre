import type { StatisticRepository, StoredFigure } from '../repositories/statistic-repository.js';
import type { UnitOfWork } from '../transaction.js';

/**
 * The projection that keeps folded figures current.
 *
 * It consumes exactly two events and treats them identically: **recompute the
 * match**. Applying a delta on `match.finalized` and a compensating delta on
 * `result.superseded` would be the obvious implementation and would drift the
 * first time a compensation was missed, replayed twice, or applied out of
 * order. Recomputation cannot drift — the totals are whatever the facts say,
 * every time, and a projection that is rebuildable from the log is one nobody
 * has to reconcile by hand.
 *
 * The fold itself lives in `@copalibre/tournament-engine`; this package never
 * imports it. The caller supplies `refold`, which is also what lets a rebuild
 * job, an API handler and a test drive one projection.
 */

export const PROJECTED_EVENT_TYPES = ['match.finalized', 'result.superseded'] as const;

export type ProjectedEventType = (typeof PROJECTED_EVENT_TYPES)[number];

export interface ProjectionEvent {
  readonly eventType: string;
  readonly organizationId: string;
  /** The match the event is about. */
  readonly entityId: string;
  readonly projectionVersion: number;
}

/**
 * Produces the figures a match currently supports, or nothing when it supports
 * none — a result superseded and not yet replaced has no figures, and leaving
 * the previous ones standing would be a total outliving its facts.
 */
export type Refold = (matchId: string) => Promise<readonly StoredFigure[] | undefined>;

export interface ProjectionOutcome {
  readonly applied: boolean;
  readonly matchId: string;
  readonly figures: number;
}

export class StatisticProjection {
  constructor(
    private readonly statistics: StatisticRepository,
    private readonly refold: Refold,
  ) {}

  static handles(eventType: string): eventType is ProjectedEventType {
    return (PROJECTED_EVENT_TYPES as readonly string[]).includes(eventType);
  }

  async apply(uow: UnitOfWork, event: ProjectionEvent): Promise<ProjectionOutcome> {
    if (!StatisticProjection.handles(event.eventType)) {
      return { applied: false, matchId: event.entityId, figures: 0 };
    }

    const figures = (await this.refold(event.entityId)) ?? [];
    const written = await this.statistics.projectMatch(uow, {
      organizationId: event.organizationId,
      matchId: event.entityId,
      figures,
      projectionVersion: event.projectionVersion,
    });

    return { applied: true, matchId: event.entityId, figures: written };
  }
}
