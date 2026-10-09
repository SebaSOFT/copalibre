import { applyTemplate } from '../../../../lib/matches-view.js';
import type { TvMatchEntry } from '../../../../lib/tv-match-list.js';
import type { TvDashboardLabels } from '../../tv-types.js';

/**
 * The matches of the stage as a compact list, two to a row, one page at a time: seventy-two
 * matches do not fit a screen one to a row, so the dashboard pages through them with its rotation.
 * Each entry is abbreviations and a score; the full names are the entry's accessible name.
 */
export function TvMatchList({
  pages,
  page,
  labels,
}: {
  readonly pages: readonly (readonly (readonly TvMatchEntry[])[])[];
  /** The zero-based page shown; clamped to the pages that exist. */
  readonly page: number;
  readonly labels: TvDashboardLabels;
}): React.JSX.Element {
  const shown = pages[Math.min(Math.max(page, 0), Math.max(pages.length - 1, 0))] ?? [];
  const entries = shown.flat();
  return (
    <section aria-label={labels.fixturesTab} className="tv-match-list" data-testid="tv-match-list">
      <ul className="tv-match-list__entries">
        {entries.map((entry) => {
          const score = (value: number | undefined): string =>
            value === undefined ? '–' : String(value);
          return (
            <li
              aria-label={`${entry.scope}: ${entry.home.name} ${score(entry.home.score)} – ${score(entry.away.score)} ${entry.away.name} (${entry.stateLabel})`}
              className="tv-match-list__entry"
              key={entry.key}
              title={`${entry.home.name} – ${entry.away.name}`}
            >
              <span aria-hidden="true" className="tv-match-list__round">
                {entry.scope}
              </span>
              <span aria-hidden="true" className="tv-match-list__side tv-match-list__side--home">
                {entry.home.label}
              </span>
              <span aria-hidden="true" className="tv-match-list__score">
                {score(entry.home.score)} : {score(entry.away.score)}
              </span>
              <span aria-hidden="true" className="tv-match-list__side tv-match-list__side--away">
                {entry.away.label}
              </span>
            </li>
          );
        })}
      </ul>
      {pages.length > 1 && (
        <p className="tv-match-list__pager">
          {applyTemplate(labels.pageOf, {
            page: Math.min(Math.max(page, 0), pages.length - 1) + 1,
            total: pages.length,
          })}
        </p>
      )}
    </section>
  );
}
