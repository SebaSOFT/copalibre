import type { LiveMatch, LiveSide } from '../../../../lib/live-state.js';
import {
  formatPenaltyClock,
  penaltySnapshotKey,
  usePenaltyCountdown,
} from '../../../../lib/penalty-countdown.js';

type ActivePenalty = NonNullable<LiveMatch['activePenalties']>[number];

function PossessionBadge({
  side,
  label,
}: {
  readonly side: LiveSide;
  readonly label: string;
}): React.JSX.Element {
  return (
    <span className="tv-match-indicator tv-match-indicator--possession cl-chamfer">
      <span className="tv-match-indicator__label">{label}</span>
      <span title={side.name}>{side.abbreviation ?? side.name}</span>
    </span>
  );
}

/**
 * Owns the countdown clock and, with it, the container's own presence: once
 * every penalty here expires and there is no possession to show either, the
 * container itself disappears rather than lingering empty. Keyed by the
 * caller on the penalty set's own snapshot, so a new set of timers remounts
 * this component — fresh `useState(0)` on mount instead of an effect
 * resetting state a moment after render — rather than carrying over a
 * countdown that belonged to the timers active a moment ago.
 */
function TickingIndicators({
  possessionSide,
  possessionLabel,
  penalties,
  sides,
  penaltyLabel,
}: {
  readonly possessionSide?: LiveSide;
  readonly possessionLabel: string;
  readonly penalties: readonly ActivePenalty[];
  readonly sides: readonly LiveSide[];
  readonly penaltyLabel: string;
}): React.JSX.Element | null {
  const countdown = usePenaltyCountdown(penalties);
  const activePenalties = countdown
    .map((penalty) => ({
      ...penalty,
      side: sides.find((candidate) => candidate.entrantId === penalty.entrantId),
    }))
    .filter((penalty) => penalty.side !== undefined);

  if (!possessionSide && activePenalties.length === 0) return null;

  return (
    <div className="tv-match-indicators" data-testid="tv-match-indicators">
      {possessionSide && <PossessionBadge label={possessionLabel} side={possessionSide} />}
      {activePenalties.map((penalty) => (
        <span
          className="tv-match-indicator tv-match-indicator--penalty cl-chamfer"
          key={penalty.timerId}
        >
          <span className="tv-match-indicator__label">{penaltyLabel}</span>
          <span title={penalty.side?.name}>{penalty.side?.abbreviation ?? penalty.side?.name}</span>
          <time>{formatPenaltyClock(penalty.remaining)}</time>
        </span>
      ))}
    </div>
  );
}

export function TvMatchIndicators({
  match,
  possessionLabel,
  penaltyLabel,
}: {
  readonly match?: LiveMatch;
  readonly possessionLabel: string;
  readonly penaltyLabel: string;
}): React.JSX.Element | null {
  const penalties = match?.activePenalties ?? [];
  const possessionSide = match?.sides.find((side) => side.entrantId === match.possessionEntrantId);

  if (penalties.length === 0) {
    if (!possessionSide) return null;
    return (
      <div className="tv-match-indicators" data-testid="tv-match-indicators">
        <PossessionBadge label={possessionLabel} side={possessionSide} />
      </div>
    );
  }

  const penaltySnapshot = penaltySnapshotKey(penalties);

  return (
    <TickingIndicators
      key={penaltySnapshot}
      penalties={penalties}
      penaltyLabel={penaltyLabel}
      possessionLabel={possessionLabel}
      possessionSide={possessionSide}
      sides={match?.sides ?? []}
    />
  );
}
