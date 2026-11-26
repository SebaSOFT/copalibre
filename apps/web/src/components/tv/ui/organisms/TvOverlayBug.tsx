import type { LiveMatch } from '../../../../lib/live-state.js';
import type { TvMatchProgress } from '../../../../lib/tv-match-progress.js';
import { LiveMatchClock, type LiveMatchClockLabels } from '../../../ui/atoms/LiveMatchClock.js';
import { ValueFlash } from '../../../ui/atoms/ValueFlash.js';
import { stateHasScore } from '../../../../lib/result-state.js';
import type { TvDashboardLabels } from '../../tv-types.js';
import { TvStatusBadge } from '../atoms/TvStatusBadge.js';
import type { TvStatusTone } from '../atoms/tv-status-tone.js';
import { TvMatchIndicators } from './TvMatchIndicators.js';
import { TvSeriesAndSets } from './TvSeriesAndSets.js';

export interface TvOverlayBugProps {
  readonly match: LiveMatch;
  readonly statusTone: TvStatusTone;
  readonly statusLabel: string;
  readonly labels: TvDashboardLabels;
  readonly progress: TvMatchProgress;
  readonly clock?: LiveMatch['clock'];
  readonly clockLabels: LiveMatchClockLabels;
}

/**
 * The corner bug of a `scorebug` overlay: the status, the two abbreviations and the score on one
 * strip, with the clock, series, sets and indicators beside them. It is the picture a browser source
 * on `mode=overlay` has always shown, moved inside the graphics-safe area by the layout.
 *
 * Not the kiosk header: `TvScorebug` is the venue screen's header organism and is not reused here.
 */
export function TvOverlayBug({
  match,
  statusTone,
  statusLabel,
  labels,
  progress,
  clock,
  clockLabels,
}: TvOverlayBugProps): React.JSX.Element {
  const [home, away] = match.sides;
  const showsScore = stateHasScore(match.state);
  return (
    <div className="tv-overlay-bug cl-chamfer" data-testid="tv-overlay-bug">
      <TvStatusBadge label={statusLabel} tone={statusTone} />
      <span className="tv-overlay-bug__side">
        {home?.abbreviation ?? home?.name ?? labels.homeSide}
      </span>
      <span className="tv-overlay-bug__score">
        {showsScore ? (
          <>
            <ValueFlash value={home?.score ?? 0} />
            <span className="tv-overlay-bug__score-sep">:</span>
            <ValueFlash value={away?.score ?? 0} />
          </>
        ) : (
          '–'
        )}
      </span>
      <span className="tv-overlay-bug__side">
        {away?.abbreviation ?? away?.name ?? labels.awaySide}
      </span>
      {clock !== undefined && (
        <LiveMatchClock
          className="tv-overlay-clock"
          clock={clock}
          labels={clockLabels}
          segmentLabel={progress.segmentLabel}
          variant="tv"
        />
      )}
      <TvSeriesAndSets
        labels={labels}
        progress={clock ? { ...progress, segmentLabel: undefined } : progress}
      />
      <TvMatchIndicators
        match={match}
        possessionLabel={labels.possession}
        penaltyLabel={labels.penalty}
      />
    </div>
  );
}
