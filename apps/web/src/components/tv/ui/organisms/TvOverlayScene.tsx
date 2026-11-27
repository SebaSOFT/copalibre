import type { ReactNode } from 'react';
import type { SupportedLanguage } from '@copalibre/domain';
import type { LiveMatch } from '../../../../lib/live-state.js';
import type { tvMatchProgress } from '../../../../lib/tv-match-progress.js';
import { presentState } from '../../../../lib/result-state.js';
import type { TvClubItem, TvDashboardLabels } from '../../tv-types.js';
import type { TvPresentation } from '../../tv-dashboard-types.js';
import type { TvStatusTone } from '../atoms/tv-status-tone.js';
import { TvLowerThird } from './TvLowerThird.js';
import { TvOverlayBug } from './TvOverlayBug.js';

/** A corner overlay's inputs: the one match it composites over footage, and its state words. */
export interface TvOverlaySceneProps {
  readonly presentation: TvPresentation;
  readonly hydrated: boolean;
  readonly dashboardLabels: TvDashboardLabels;
  readonly language: SupportedLanguage;
  readonly clubs: readonly TvClubItem[] | undefined;
  readonly timeZone: string | undefined;
  readonly effectiveNow: number;
  readonly spotlightMatch: LiveMatch | undefined;
  readonly spotlightClock: LiveMatch['clock'];
  readonly clockLabels: { readonly clockStopped: string; readonly clockAriaLabel: string };
  readonly progress: ReturnType<typeof tvMatchProgress>;
  readonly noMatchMessage: string;
  readonly showStaleMark: boolean;
  readonly broadcastAlertBanner: ReactNode;
  /** The scope the match list gives the spotlight match, when it has one. */
  readonly scope: string | undefined;
  readonly venueOf: (match: LiveMatch) => string | undefined;
  readonly isMatchDelayed: (match: LiveMatch) => boolean;
}

/** A corner overlay: the lower third or the score bug over footage, or nothing when there is no match. */
export function TvOverlayScene(props: TvOverlaySceneProps): React.JSX.Element {
  const {
    presentation,
    hydrated,
    dashboardLabels,
    language,
    clubs,
    timeZone,
    effectiveNow,
    spotlightMatch,
    spotlightClock,
    clockLabels,
    progress,
    noMatchMessage,
    showStaleMark,
    broadcastAlertBanner,
    scope,
    venueOf,
    isMatchDelayed,
  } = props;
  const overlayRootClass = `tv-root-container tv-overlay-root tv-overlay-root--${presentation}`;
  // An overlay names the state of the match it shows, not the tournament's: a delayed match is not live.
  // Each state keeps its own word and tone, from the shared state labels; a delayed match is the one
  // upcoming match that carries its delayed word.
  const matchStatus = (match: LiveMatch): { tone: TvStatusTone; label: string } => {
    if (
      match.state === 'upcoming' &&
      isMatchDelayed(match) &&
      dashboardLabels.delayed !== undefined
    )
      return { tone: 'delayed', label: dashboardLabels.delayed };
    return {
      tone: match.state,
      label: presentState(match.state, dashboardLabels.resultState).label,
    };
  };
  if (spotlightMatch === undefined) {
    // Nothing to show paints nothing on air. The state reaches assistive tech and tests through one line.
    return (
      <div
        className={overlayRootClass}
        data-hydrated={hydrated ? '' : undefined}
        data-state="no-match"
      >
        <p className="cl-visually-hidden" role="status">
          {noMatchMessage}
        </p>
      </div>
    );
  }
  return (
    <div
      className={overlayRootClass}
      data-hydrated={hydrated ? '' : undefined}
      data-state={spotlightMatch.state}
    >
      {showStaleMark && dashboardLabels.stale && (
        <p className="cl-inline-alert cl-inline-alert--warning tv-stale-mark" role="status">
          {dashboardLabels.stale}
        </p>
      )}
      {broadcastAlertBanner}
      {presentation === 'lower' ? (
        <TvLowerThird
          clockLabels={clockLabels}
          {...(spotlightClock === undefined ? {} : { clock: spotlightClock })}
          {...(clubs === undefined ? {} : { clubs })}
          labels={dashboardLabels}
          locale={language}
          match={spotlightMatch}
          progress={progress}
          statusLabel={matchStatus(spotlightMatch).label}
          statusTone={matchStatus(spotlightMatch).tone}
          {...(scope === undefined ? {} : { scope })}
          {...(venueOf(spotlightMatch) === undefined ? {} : { venueName: venueOf(spotlightMatch) })}
          {...(timeZone === undefined ? {} : { timeZone })}
          referenceDate={effectiveNow}
        />
      ) : (
        <TvOverlayBug
          clockLabels={clockLabels}
          language={language}
          {...(spotlightClock === undefined ? {} : { clock: spotlightClock })}
          labels={dashboardLabels}
          match={spotlightMatch}
          progress={progress}
          statusLabel={matchStatus(spotlightMatch).label}
          statusTone={matchStatus(spotlightMatch).tone}
        />
      )}
    </div>
  );
}
