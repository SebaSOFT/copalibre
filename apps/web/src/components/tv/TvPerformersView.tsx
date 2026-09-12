import type { TopPerformer } from '../../lib/tv-statistics.js';

/**
 * Extracted from `TvDashboard.tsx` (openspec 0225 task 7.1) — the rotating
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
            {p.clubEmblemObjectId ? (
              <img
                alt=""
                className="tv-table-club-emblem"
                src={`/api/objects/${p.clubEmblemObjectId}`}
              />
            ) : null}
            <div className="tv-performer-card__info">
              <span className="tv-performer-card__name">{p.name}</span>
              {p.clubName && <span className="tv-performer-card__club">{p.clubName}</span>}
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
