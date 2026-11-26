import { formatTimestamp } from '../../../../lib/format-timestamp.js';
import type { LiveMatch } from '../../../../lib/live-state.js';

export interface TvRecentResultsGroup {
  readonly name: string;
  readonly matches: readonly LiveMatch[];
}

/**
 * Each side's latest finished results in the tournament, one group per side. Abbreviations and the
 * score; the full names are each row's accessible name.
 */
export function TvRecentResults({
  groups,
  emptyLabel,
  locale,
  timeZone,
}: {
  readonly groups: readonly TvRecentResultsGroup[];
  readonly emptyLabel: string;
  readonly locale: string;
  readonly timeZone?: string;
}): React.JSX.Element {
  const populated = groups.filter((group) => group.matches.length > 0);
  if (populated.length === 0) {
    return <p className="tv-layout-empty">{emptyLabel}</p>;
  }
  return (
    <section className="tv-recent-results" data-testid="tv-recent-results">
      {populated.map((group) => (
        <div className="tv-recent-results__group" key={group.name}>
          <h3 className="tv-recent-results__team">{group.name}</h3>
          <ul className="tv-recent-results__list">
            {group.matches.map((match) => {
              const [home, away] = match.sides;
              const homeLabel = home?.abbreviation ?? home?.name ?? '';
              const awayLabel = away?.abbreviation ?? away?.name ?? '';
              const when =
                match.scheduledAt === undefined
                  ? ''
                  : formatTimestamp(match.scheduledAt, {
                      locale,
                      format: 'dynamic',
                      ...(timeZone === undefined ? {} : { timeZone }),
                    });
              return (
                <li
                  aria-label={`${when} ${home?.name ?? ''} ${home?.score ?? 0} : ${away?.score ?? 0} ${away?.name ?? ''}`}
                  className="tv-recent-results__match"
                  key={match.matchId}
                >
                  <span className="tv-recent-results__when">{when}</span>
                  <span className="tv-recent-results__score">
                    {homeLabel} {home?.score ?? 0} : {away?.score ?? 0} {awayLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
