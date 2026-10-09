import { applyTemplate } from '../../../../lib/matches-view.js';
import type { TvMatchProgress } from '../../../../lib/tv-match-progress.js';
import type { TvDashboardLabels } from '../../tv-types.js';

/**
 * What a broadcast shows beside the score besides the score: the segment in play by its place ("2nd
 * Half", "3rd Set"), a series' pips and where it stands, and the sets already played. Each part is
 * present only when the match has it; a plain match renders nothing at all.
 *
 * The strip is read over live video, so nothing in it changes width when a set ends: a set chip has
 * a fixed width and tabular figures, and the pips are a fixed size whatever the series' length.
 */
export function TvSeriesAndSets({
  progress,
  labels,
}: {
  readonly progress: TvMatchProgress;
  readonly labels: TvDashboardLabels;
}): React.JSX.Element | null {
  const { series, sets, segmentLabel } = progress;
  if (series === undefined && sets.length === 0 && segmentLabel === undefined) return null;

  const seriesText =
    series === undefined
      ? undefined
      : applyTemplate(labels.seriesState, {
          home: series.home,
          away: series.away,
          game: series.game ?? series.span,
          span: series.span,
        });

  return (
    <div className="tv-progress" data-testid="tv-match-progress">
      {segmentLabel !== undefined && (
        <span className="tv-progress__segment" data-testid="tv-segment">
          {segmentLabel}
        </span>
      )}
      {(series !== undefined || sets.length > 0) && (
        <div className="tv-progress__row">
          {series !== undefined && (
            <div className="tv-progress__series" data-testid="tv-series" title={seriesText}>
              <span aria-hidden="true" className="tv-progress__pips">
                {series.pips.map((pip, index) => (
                  <span className={`tv-progress__pip tv-progress__pip--${pip}`} key={index} />
                ))}
              </span>
              <span className="tv-progress__series-text">{seriesText}</span>
            </div>
          )}
          {sets.length > 0 && (
            <ol aria-label={labels.setsLabel} className="tv-progress__sets" data-testid="tv-sets">
              {sets.map((chip) => (
                <li
                  aria-current={chip.current ? 'true' : undefined}
                  className={`tv-progress__set${chip.current ? ' tv-progress__set--current' : ''}`}
                  key={chip.number}
                  title={`${chip.label} ${chip.number}`}
                >
                  <span className="tv-progress__set-label">
                    {chip.label} {chip.number}
                  </span>
                  <span className="tv-progress__set-score">
                    {chip.scores === undefined ? '–' : `${chip.scores[0]}–${chip.scores[1]}`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
