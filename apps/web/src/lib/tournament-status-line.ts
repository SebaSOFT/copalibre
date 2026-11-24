import type { StageCompletionItem } from '../components/ui/molecules/CompletionFigure.js';

export interface TournamentStatusLineLabels {
  readonly statusLine: string;
  readonly stageFinished: string;
  readonly stageInPlay: string;
}

function applyTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * Summarizes tournament stage progress for the overview hero:
 * finished stages before the current stage, then the current stage with any
 * segments still in play. Returns `undefined` when the tournament is finished
 * or has no stage in play.
 */
export function buildTournamentStatusLine(
  input: {
    readonly status?: 'upcoming' | 'live' | 'finished';
    readonly stages: readonly StageCompletionItem[];
  },
  labels: TournamentStatusLineLabels,
): string | undefined {
  if (input.status === 'finished' || input.stages.length === 0) return undefined;

  const ordered = [...input.stages].sort((left, right) => left.stageNumber - right.stageNumber);
  const currentIndex = ordered.findIndex(
    (stage) => stage.totalMatches > 0 && stage.resolvedMatches < stage.totalMatches,
  );
  if (currentIndex < 0) return undefined;

  const parts: string[] = [];
  for (let index = 0; index < currentIndex; index += 1) {
    const finished = ordered[index];
    if (
      finished &&
      finished.totalMatches > 0 &&
      finished.resolvedMatches >= finished.totalMatches
    ) {
      parts.push(applyTemplate(labels.stageFinished, { stage: finished.stageName }));
    }
  }

  const current = ordered[currentIndex];
  if (!current) return undefined;

  parts.push(
    applyTemplate(labels.stageInPlay, {
      stage: current.stageName,
      resolved: current.resolvedMatches,
      total: current.totalMatches,
    }),
  );

  for (const segment of current.segments ?? []) {
    if (segment.totalMatches > 0 && segment.resolvedMatches < segment.totalMatches) {
      parts.push(`${segment.name} ${segment.resolvedMatches}/${segment.totalMatches}`);
    }
  }

  return applyTemplate(labels.statusLine, { stages: parts.join(' · ') });
}
