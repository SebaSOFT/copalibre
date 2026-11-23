import { isSupportedLanguage, type SupportedLanguage } from '@copalibre/domain';
import { formatTimestamp } from '../../../lib/format-timestamp.js';
import { useHydrated } from '../../../lib/island-browser-state.js';
import { useLiveScoreboardPatch, useLiveStreamStatus } from '../../../lib/live-scoreboard-store.js';
import type { LiveMatchClock as LiveMatchClockState } from '../../../lib/live-state.js';
import { applyTemplate } from '../../../lib/matches-view.js';
import { activeSegmentLabel, type SegmentLabelInput } from '../../../lib/segment-label.js';
import { LiveMatchClock } from '../atoms/LiveMatchClock.js';

export interface LiveMatchScoreboardLabels {
  readonly clockStopped: string;
  readonly clockAriaLabel: string;
  readonly lastUpdated: string;
}

export interface LiveMatchScoreboardProps {
  readonly matchId?: string;
  readonly clock?: LiveMatchClockState;
  readonly segments?: readonly SegmentLabelInput[];
  readonly segmentLabel?: string;
  readonly locale: string;
  readonly timeZone?: string;
  readonly labels: LiveMatchScoreboardLabels;
  readonly usingLastKnown?: boolean;
  readonly lastUpdatedAt?: string;
  readonly showLastUpdated?: boolean;
  readonly className?: string;
}

function resolveLanguageTag(locale: string): SupportedLanguage {
  const base = locale.split('-')[0] ?? 'en';
  return isSupportedLanguage(base) ? base : 'en';
}

/**
 * Shared public live scoreboard molecule.
 *
 * Composes `LiveMatchClock` with the live segment label and the disconnected
 * `"Last updated at {time}"` notice when the stream drops. Subscribes after
 * hydration to the page-tier scoreboard store so SSE updates reach every island
 * without introducing network calls below the page tier.
 */
export function LiveMatchScoreboard({
  matchId,
  clock,
  segments,
  segmentLabel,
  locale,
  timeZone,
  labels,
  usingLastKnown = false,
  lastUpdatedAt,
  showLastUpdated = true,
  className = '',
}: LiveMatchScoreboardProps): React.JSX.Element | null {
  const hydrated = useHydrated();
  const patch = useLiveScoreboardPatch(matchId);
  const streamStatus = useLiveStreamStatus();

  const usePatch = hydrated && patch !== undefined;
  const effectiveClock = usePatch ? patch.clock : clock;
  const effectiveSegments = (usePatch ? patch.segments : undefined) ?? segments;
  const language = resolveLanguageTag(locale);
  const computedSegment = activeSegmentLabel(effectiveSegments, effectiveClock, language);
  const effectiveSegmentLabel = usePatch
    ? (computedSegment ?? (effectiveClock || patch.state === 'live' ? segmentLabel : undefined))
    : (segmentLabel ?? computedSegment);

  const effectiveUsingLastKnown = usingLastKnown || (hydrated && streamStatus.usingLastKnown);
  const effectiveLastUpdatedAt =
    (hydrated ? streamStatus.lastUpdatedAt : undefined) ?? lastUpdatedAt ?? effectiveClock?.asOf;

  const formattedUpdatedAt =
    showLastUpdated && effectiveUsingLastKnown && effectiveLastUpdatedAt
      ? formatTimestamp(effectiveLastUpdatedAt, {
          locale,
          format: 'time-only',
          ...(timeZone === undefined ? {} : { timeZone }),
        })
      : undefined;

  if (!effectiveClock && !effectiveSegmentLabel && !formattedUpdatedAt) {
    return null;
  }

  const classes = ['cl-live-scoreboard', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <LiveMatchClock
        clock={effectiveClock}
        labels={{
          clockStopped: labels.clockStopped,
          clockAriaLabel: labels.clockAriaLabel,
        }}
        segmentLabel={effectiveSegmentLabel}
        variant="public"
      />
      {formattedUpdatedAt && (
        <p className="cl-live-scoreboard__updated">
          {applyTemplate(labels.lastUpdated, { time: formattedUpdatedAt })}
        </p>
      )}
    </div>
  );
}
