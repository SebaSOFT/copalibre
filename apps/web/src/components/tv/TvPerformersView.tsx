import type { TopPerformer } from '../../lib/tv-statistics.js';
import { EntrantName } from '../ui/atoms/EntrantName.js';
import { ResponsivePlayerName } from '../ui/atoms/ResponsivePlayerName.js';
import { EntrantEmblem } from '../ui/molecules/EntrantEmblem.js';

/**
 * Extracted from `TvDashboard.tsx` — the rotating
 * rail's top-performers tab.
 */
export function TvPerformersView({
  performers,
  noTopPerformersLabel,
}: {
  readonly performers: readonly TopPerformer[];
  readonly noTopPerformersLabel: string;
}): React.JSX.Element {
  if (performers.length === 0) {
    return (
      <div style={{ padding: '2vmin', color: 'var(--tv-text-secondary)', textAlign: 'center' }}>
        {noTopPerformersLabel}
      </div>
    );
  }

  return (
    <div className="tv-performers-list">
      {performers.map((p) => (
        <article className="tv-performer-card cl-chamfer" key={`${p.rank}-${p.name}`}>
          <div className="tv-performer-card__left">
            <span className="tv-performer-card__rank">#{p.rank}</span>
            {p.clubName !== undefined && (
              <EntrantEmblem
                alt={p.clubName}
                abbreviation={p.clubAbbreviation}
                className="tv-table-club-emblem cl-entrant-emblem--small"
                decorative
                size="3vmin"
                src={p.clubEmblemUrl}
              />
            )}
            <div className="tv-performer-card__info">
              <ResponsivePlayerName
                className="tv-performer-card__name"
                fullName={p.name}
                nationalityCode={p.nationalityCode}
              />
              {p.clubName && (
                <EntrantName
                  abbreviation={p.clubAbbreviation}
                  className="tv-performer-card__club"
                  fullName={p.clubName}
                />
              )}
            </div>
          </div>
          <span className="tv-performer-card__score">
            {p.statValue}{' '}
            <small
              style={{ fontSize: 'var(--cl-font-size-sm)', color: 'var(--tv-text-secondary)' }}
            >
              {p.statLabel}
            </small>
          </span>
        </article>
      ))}
    </div>
  );
}
