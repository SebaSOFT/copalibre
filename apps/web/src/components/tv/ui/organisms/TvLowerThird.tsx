import type { LiveMatch } from '../../../../lib/live-state.js';
import type { TvMatchProgress } from '../../../../lib/tv-match-progress.js';
import { EntrantEmblem } from '../../../ui/molecules/EntrantEmblem.js';
import { EntrantName } from '../../../ui/atoms/EntrantName.js';
import { LiveMatchClock, type LiveMatchClockLabels } from '../../../ui/atoms/LiveMatchClock.js';
import { ValueFlash } from '../../../ui/atoms/ValueFlash.js';
import type { TvClubItem, TvDashboardLabels } from '../../tv-types.js';
import { TvStartTime } from '../atoms/TvStartTime.js';
import { TvStatusBadge } from '../atoms/TvStatusBadge.js';
import type { TvStatusTone } from '../atoms/tv-status-tone.js';
import { TvMatchIndicators } from './TvMatchIndicators.js';
import { TvSeriesAndSets } from './TvSeriesAndSets.js';

export interface TvLowerThirdProps {
  readonly match: LiveMatch;
  /** The competition and round, as the matches view names them: "Copa Oro · Semifinal". */
  readonly scope?: string;
  readonly venueName?: string;
  readonly statusTone: TvStatusTone;
  readonly statusLabel: string;
  readonly labels: TvDashboardLabels;
  readonly progress: TvMatchProgress;
  readonly clock?: LiveMatch['clock'];
  readonly clockLabels: LiveMatchClockLabels;
  readonly clubs?: readonly TvClubItem[];
  readonly locale: string;
  readonly timeZone?: string;
  readonly referenceDate?: number;
}

/**
 * A lower third: the two crests, full names and score on the first row; the competition and round,
 * the court, the state, the clock or kickoff, the series and sets, and the indicators on the second.
 * An upcoming match shows its kickoff where the clock would be, and never a score. It owns no
 * layout around itself: the overlay root places the band in the graphics-safe area.
 */
function LowerThirdSide({
  name,
  abbreviation,
  emblemUrl,
  fallbackName,
  away = false,
}: {
  readonly name?: string;
  readonly abbreviation?: string;
  readonly emblemUrl?: string;
  readonly fallbackName: string;
  readonly away?: boolean;
}): React.JSX.Element {
  const fullName = name ?? fallbackName;
  const crest = (
    <EntrantEmblem
      alt={fullName}
      className="tv-lower-third__emblem"
      {...(abbreviation === undefined ? {} : { abbreviation })}
      decorative
      eager
      size="100%"
      {...(emblemUrl === undefined ? {} : { src: emblemUrl })}
    />
  );
  const label = (
    <span className="tv-lower-third__name">
      <EntrantName fullName={fullName} {...(abbreviation === undefined ? {} : { abbreviation })} />
    </span>
  );
  return (
    <div className={`tv-lower-third__side${away ? ' tv-lower-third__side--away' : ''}`}>
      {away ? (
        <>
          {label}
          {crest}
        </>
      ) : (
        <>
          {crest}
          {label}
        </>
      )}
    </div>
  );
}

export function TvLowerThird({
  match,
  scope,
  venueName,
  statusTone,
  statusLabel,
  labels,
  progress,
  clock,
  clockLabels,
  clubs,
  locale,
  timeZone,
  referenceDate,
}: TvLowerThirdProps): React.JSX.Element {
  const [home, away] = match.sides;
  const upcoming = match.state === 'upcoming';
  const emblemOf = (side: LiveMatch['sides'][number] | undefined): string | undefined =>
    side?.clubId === undefined
      ? undefined
      : clubs?.find((club) => club.clubId === side.clubId)?.emblemUrl;
  return (
    <div className="tv-lower-third cl-chamfer" data-testid="tv-lower-third">
      <div className="tv-lower-third__teams">
        <LowerThirdSide
          fallbackName={labels.homeSide}
          {...(home?.name === undefined ? {} : { name: home.name })}
          {...(home?.abbreviation === undefined ? {} : { abbreviation: home.abbreviation })}
          {...(emblemOf(home) === undefined ? {} : { emblemUrl: emblemOf(home) })}
        />
        <span className="tv-lower-third__score">
          {upcoming ? (
            '–'
          ) : (
            <>
              <ValueFlash value={home?.score ?? 0} />
              <span className="tv-lower-third__score-sep">:</span>
              <ValueFlash value={away?.score ?? 0} />
            </>
          )}
        </span>
        <LowerThirdSide
          away
          fallbackName={labels.awaySide}
          {...(away?.name === undefined ? {} : { name: away.name })}
          {...(away?.abbreviation === undefined ? {} : { abbreviation: away.abbreviation })}
          {...(emblemOf(away) === undefined ? {} : { emblemUrl: emblemOf(away) })}
        />
      </div>
      <div className="tv-lower-third__meta">
        {scope !== undefined && <span className="tv-lower-third__scope">{scope}</span>}
        {venueName !== undefined && <span className="tv-lower-third__venue">{venueName}</span>}
        <TvStatusBadge label={statusLabel} tone={statusTone} />
        {clock !== undefined && (
          <LiveMatchClock
            className="tv-overlay-clock"
            clock={clock}
            labels={clockLabels}
            segmentLabel={progress.segmentLabel}
            variant="tv"
          />
        )}
        {upcoming && match.scheduledAt !== undefined && (
          <TvStartTime
            scheduledAt={match.scheduledAt}
            locale={locale}
            {...(timeZone === undefined ? {} : { timeZone })}
            {...(referenceDate === undefined ? {} : { referenceDate })}
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
    </div>
  );
}
