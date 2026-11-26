import type { SupportedLanguage } from '@copalibre/domain';
import type { LiveMatch } from '../../../../lib/live-state.js';
import { matchCounterView, type MatchCounterTexts } from '../../../../lib/match-counters.js';

/**
 * The declared match counters of a match, per side: the scorebug and the spotlight use the compact
 * text ("F 4", "TM 1/1"), the wide surfaces the full one ("Team fouls 4"). Each counter carries its
 * full words for assistive technology, and a counter in warning also carries a text cue, never
 * colour alone. Renders nothing when the discipline declares no counters.
 */
export function TvMatchCounters({
  match,
  language,
  texts,
  density,
}: {
  readonly match?: LiveMatch;
  readonly language: SupportedLanguage;
  readonly texts: MatchCounterTexts;
  readonly density: 'compact' | 'full';
}): React.JSX.Element | null {
  const views = matchCounterView(match?.counters, match?.sides ?? [], language, texts);
  if (views.length === 0) return null;
  return (
    <div className={`tv-match-counters tv-match-counters--${density}`} data-testid="tv-match-counters">
      {views.map((view) => (
        <div className="tv-match-counter-group" key={view.code}>
          {view.sides.map((side) => (
            <span
              className={`tv-match-counter cl-chamfer${side.warning ? ' tv-match-counter--warning' : ''}`}
              key={side.entrantId}
            >
              <span aria-hidden="true">{density === 'compact' ? side.compactText : side.fullText}</span>
              {side.warning && (
                <span aria-hidden="true" className="tv-match-counter__cue">
                  !
                </span>
              )}
              <span className="cl-visually-hidden">{side.accessibleName}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
