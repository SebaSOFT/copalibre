import type { SupportedLanguage } from '@copalibre/domain';
import type { LiveMatch } from '../../../../lib/live-state.js';
import {
  matchCounterView,
  type MatchCounterSideView,
  type MatchCounterTexts,
  type MatchCounterView,
} from '../../../../lib/match-counters.js';

/**
 * The declared match counters of a match, one cluster per side: the side's abbreviation once, then each
 * counter's value for that side. The home cluster comes first, the away cluster second, so a cluster
 * reads as one side. `side` narrows the output to one cluster (a lower third puts each under its name),
 * and `sideLabel={false}` drops the abbreviation where the name already sits above the cluster.
 * A counter in warning carries a "!" tight against its value, and its full words for assistive
 * technology. Renders nothing when the discipline declares no counters.
 */
export function TvMatchCounters({
  match,
  language,
  texts,
  density,
  side,
  sideLabel = true,
}: {
  readonly match?: LiveMatch;
  readonly language: SupportedLanguage;
  readonly texts: MatchCounterTexts;
  readonly density: 'compact' | 'full';
  readonly side?: 'home' | 'away';
  readonly sideLabel?: boolean;
}): React.JSX.Element | null {
  const sides = match?.sides ?? [];
  const views = matchCounterView(match?.counters, sides, language, texts);
  if (views.length === 0) return null;
  const indices = side === undefined ? [0, 1] : [side === 'home' ? 0 : 1];
  return (
    <div
      className={`tv-match-counters tv-match-counters--${density}`}
      data-testid="tv-match-counters"
    >
      {indices.map((index) => {
        const entry = sides[index];
        if (entry === undefined) return null;
        return (
          <div className="tv-match-counter-cluster" key={entry.entrantId}>
            {sideLabel && (
              <span className="tv-match-counter-cluster__side">
                {entry.abbreviation ?? entry.name}
              </span>
            )}
            {views.map((view) => {
              const value = sideValue(view, entry.entrantId);
              if (value === undefined) return null;
              return (
                <span
                  className={`tv-match-counter cl-chamfer${value.warning ? ' tv-match-counter--warning' : ''}`}
                  key={view.code}
                >
                  <span aria-hidden="true">
                    {density === 'compact' ? value.compactText : value.fullText}
                    {value.warning && <span className="tv-match-counter__cue">!</span>}
                  </span>
                  <span className="cl-visually-hidden">
                    {`${entry.name}, ${value.accessibleName}`}
                  </span>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function sideValue(view: MatchCounterView, entrantId: string): MatchCounterSideView | undefined {
  return view.sides.find((side) => side.entrantId === entrantId);
}
