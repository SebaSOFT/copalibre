import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import { effectsOf, type RecordedEvent } from './event-log.js';

/**
 * Current scoring is a fold of immutable match facts. Keeping it beside the
 * event log means consoles and replay jobs cannot become independent scorers.
 */
export interface LiveScore {
  readonly entrantId: string;
  readonly score: number;
  readonly statistics: Readonly<Record<string, number>>;
}

export function foldLiveScores(
  descriptor: DisciplineDescriptor,
  events: readonly RecordedEvent[],
  entrantIds: readonly string[],
): readonly LiveScore[] {
  const totals = new Map(
    entrantIds.map((entrantId) => [
      entrantId,
      { score: 0, statistics: {} as Record<string, number> },
    ]),
  );

  for (const event of events) {
    for (const effect of effectsOf(descriptor, event)) {
      if (effect.kind === 'score') {
        for (const entrantId of scoreRecipients(effect.awardTo, event.side, entrantIds)) {
          const total = totals.get(entrantId);
          if (total) total.score += effect.delta;
        }
      }

      if (effect.kind === 'statistic' && event.side) {
        const total = totals.get(event.side);
        if (total) {
          total.statistics[effect.statisticCode] =
            (total.statistics[effect.statisticCode] ?? 0) + effect.delta;
        }
      }
    }
  }

  return entrantIds.map((entrantId) => {
    const total = totals.get(entrantId) ?? { score: 0, statistics: {} };
    return { entrantId, score: total.score, statistics: total.statistics };
  });
}

function scoreRecipients(
  awardTo: 'actor' | 'every-other-side',
  actorEntrantId: string | undefined,
  entrantIds: readonly string[],
): readonly string[] {
  if (!actorEntrantId) return [];
  if (awardTo === 'actor') return entrantIds.includes(actorEntrantId) ? [actorEntrantId] : [];
  return entrantIds.filter((entrantId) => entrantId !== actorEntrantId);
}
