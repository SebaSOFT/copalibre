import { tagsAt, type TagDeclaration, type TagFact } from '@copalibre/domain';
import type { FoldInput } from '@copalibre/tournament-engine';

/**
 * Resolves every `requiresTag` a discipline's collectors declare into
 * `foldStatistics`'s `filter` seam — checking tag state as of each
 * candidate fact's own `occurredAt`, per `declared-tagging`'s "what was true
 * last April is still answerable" guarantee, not the fold's own run time.
 *
 * Pure: takes already-fetched facts rather than querying for them, so it is
 * unit-testable without a database — `refold.ts`'s `requiresTagFilter` is the
 * thin wrapper that fetches `facts` via `TagRepository` and calls this.
 */
export function buildRequiresTagFilter(
  declarations: readonly TagDeclaration[],
  facts: readonly TagFact[],
): FoldInput['filter'] {
  return (fact, actorId, collector) => {
    const requiresTag = collector.requiresTag;
    if (!requiresTag) return true;
    // Validation (validateCollectors) already refuses requiresTag on a
    // participation-/collector-sourced collector, so this branch is only
    // ever reached with a RecordedEvent in practice — defensive, not a
    // silent pass, if that invariant is ever violated.
    if (!('occurredAt' in fact)) return false;

    const instant = new Date(fact.occurredAt).getTime();
    const factsUpToInstant = facts.filter((one) => new Date(one.at).getTime() <= instant);
    const applied = tagsAt(declarations, factsUpToInstant);
    return applied.some(
      (tag) =>
        tag.code === requiresTag.code &&
        tag.actorId === actorId &&
        (requiresTag.competition === undefined ||
          tag.competitionGranularity === requiresTag.competition),
    );
  };
}
