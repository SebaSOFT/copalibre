/**
 * Owns the public tournament completion summary.
 *
 * Answers "how much of this tournament is done" with a labeled figure, one bar
 * for the whole tournament, one per stage and one per declared zone or group of
 * a stage. Every bar is a native `<progress>` named by its own counts, and the
 * counts are printed beside it, so the figure never leans on colour alone.
 *
 * Rendered statically by Astro — zero client JavaScript shipped.
 */
import { Card } from '../atoms/Card.tsx';
import { Badge } from '../atoms/Badge.tsx';
import type { CompletionFigureLabels } from '../../../lib/i18n/public-intl.ts';

export interface SegmentCompletionItem {
  readonly segmentId: string;
  readonly name: string;
  /** The zone a named group belongs to. */
  readonly zoneName?: string;
  readonly totalMatches: number;
  readonly resolvedMatches: number;
}

export interface StageCompletionItem {
  readonly stageId: string;
  readonly stageNumber: number;
  readonly stageName: string;
  readonly totalMatches: number;
  readonly resolvedMatches: number;
  readonly segments?: readonly SegmentCompletionItem[];
}

export interface CompletionFigureProps {
  readonly totalMatches: number;
  readonly resolvedMatches: number;
  readonly stages?: readonly StageCompletionItem[];
  readonly labels: CompletionFigureLabels;
  readonly className?: string;
}

function Bar({
  name,
  resolved,
  total,
}: {
  readonly name: string;
  readonly resolved: number;
  readonly total: number;
}): React.JSX.Element {
  return (
    <div className="cl-completion-figure__row">
      <span className="cl-completion-figure__row-name">{name}</span>
      <span className="cl-completion-figure__stage-counts">
        {total === 0 ? '—' : `${resolved} / ${total}`}
      </span>
      {total > 0 && (
        <progress
          aria-label={`${name}: ${resolved} / ${total}`}
          className="cl-progress"
          max={total}
          value={resolved}
        />
      )}
    </div>
  );
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
  const hasBreakdown =
    stages.length > 1 || stages.some((stage) => (stage.segments ?? []).length > 0);

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
        {!isUnmeasured && (
          <progress
            aria-label={labels.summary}
            className="cl-progress cl-progress--overall"
            max={totalMatches}
            value={resolvedMatches}
          />
        )}
        {hasBreakdown && (
          <ol className="cl-completion-figure__stages">
            {stages.map((stage) => (
              <li key={stage.stageId} className="cl-completion-figure__stage-item">
                <Bar
                  name={stage.stageName}
                  resolved={stage.resolvedMatches}
                  total={stage.totalMatches}
                />
                {(stage.segments ?? []).length > 0 && (
                  <ul className="cl-completion-figure__segments">
                    {(stage.segments ?? []).map((segment) => (
                      <li key={segment.segmentId} className="cl-completion-figure__segment">
                        <Bar
                          name={
                            segment.zoneName === undefined
                              ? segment.name
                              : `${segment.zoneName} · ${segment.name}`
                          }
                          resolved={segment.resolvedMatches}
                          total={segment.totalMatches}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
