import type { CollectedFigure } from '@copalibre/tournament-engine';
import type { StoredFigure } from '@copalibre/persistence';

/**
 * Adds a live fold's marginal figures on top of what a match already stored
 * (live cadence). `StatisticRepository.projectMatch` replaces a
 * match's whole row set rather than upserting — a live-cadence write folds
 * only the single newly-recorded event (`foldStatistics({ events: [appended] })`),
 * so this is what turns that marginal contribution into the full,
 * accumulated total `projectMatch` needs, the same way `foldStatistics`'s own
 * `add()` accumulates a repeated key within one call.
 */
export function mergeFigures(
  existing: readonly StoredFigure[],
  marginal: readonly CollectedFigure[],
): readonly StoredFigure[] {
  const byKey = new Map<string, StoredFigure>();
  for (const figure of existing) {
    byKey.set(keyOf(figure), figure);
  }
  for (const figure of marginal) {
    const key = keyOf(figure);
    const current = byKey.get(key);
    byKey.set(key, {
      collectorCode: figure.collectorCode,
      actorGranularity: figure.actorGranularity,
      actorId: figure.actorId,
      competitionGranularity: figure.competitionGranularity,
      competitionId: figure.competitionId,
      value: (current?.value ?? 0) + figure.value,
      samples: (current?.samples ?? 0) + figure.samples,
    });
  }
  return [...byKey.values()];
}

function keyOf(
  figure: Pick<
    StoredFigure,
    'collectorCode' | 'actorGranularity' | 'actorId' | 'competitionGranularity' | 'competitionId'
  >,
): string {
  return [
    figure.collectorCode,
    figure.actorGranularity,
    figure.actorId,
    figure.competitionGranularity,
    figure.competitionId,
  ].join(' ');
}
