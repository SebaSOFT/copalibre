/**
 * Owns the public tournament completion summary.
 *
 * Answers "how much of this tournament is done" with a labeled figure and an
 * accessible, non-colour-alone state cue (glyph and written label).
 *
 * Rendered statically by Astro — zero client JavaScript shipped.
 */
import { Card } from '../atoms/Card.tsx';
import { Badge } from '../atoms/Badge.tsx';
import type { CompletionFigureLabels } from '../../../lib/i18n/public-intl.ts';

export interface StageCompletionItem {
  readonly stageId: string;
  readonly stageNumber: number;
  readonly stageName: string;
  readonly totalMatches: number;
  readonly resolvedMatches: number;
}

export interface CompletionFigureProps {
  readonly totalMatches: number;
  readonly resolvedMatches: number;
  readonly stages?: readonly StageCompletionItem[];
  readonly labels: CompletionFigureLabels;
  readonly className?: string;
}

export function CompletionFigure({
  totalMatches,
  resolvedMatches,
  stages = [],
  labels,
  className = '',
}: CompletionFigureProps): React.JSX.Element {
  const isUnmeasured = totalMatches === 0;
  const isComplete = totalMatches > 0 && resolvedMatches === totalMatches;
  const badgeModifier = isUnmeasured ? 'unmeasured' : isComplete ? 'complete' : 'progress';

  return (
    <Card
      as="section"
      className={`cl-completion-figure ${className}`.trim()}
      aria-label={labels.heading}
    >
      <div className="cl-completion-figure__header">
        <h3 className="cl-completion-figure__heading">{labels.heading}</h3>
        <Badge
          className={`cl-completion-figure__badge cl-completion-figure__badge--${badgeModifier}`}
        >
          <span aria-hidden="true">{labels.stateGlyph}</span>
          <span>{labels.stateLabel}</span>
        </Badge>
      </div>
      <div className="cl-completion-figure__body">
        <div className="cl-stat-tile__value">
          {isUnmeasured ? labels.unmeasuredLabel : labels.summary}
        </div>
        {stages.length > 1 && (
          <ol className="cl-completion-figure__stages">
            {stages.map((stage) => (
              <li key={stage.stageId} className="cl-completion-figure__stage-item">
                <span className="cl-completion-figure__stage-name">{stage.stageName}</span>
                <span className="cl-completion-figure__stage-counts">
                  {stage.totalMatches === 0
                    ? '—'
                    : `${stage.resolvedMatches} / ${stage.totalMatches}`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
