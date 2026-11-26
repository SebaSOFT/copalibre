import type { MatchCounterView } from '../../../lib/match-counters.js';
import { applyTemplate } from '../../../lib/matches-view.js';
import {
  formatPenaltyClock,
  penaltySnapshotKey,
  usePenaltyCountdown,
} from '../../../lib/penalty-countdown.js';

export interface MatchPenaltyView {
  readonly timerId: string;
  readonly entrantId: string;
  readonly remainingSeconds: number;
  /** The side's name, as the page shows it. */
  readonly sideName: string;
}

/**
 * The declared counters of a match, one row per counter with a value per side, and the timed
 * penalties in force while the match is live. A side's value names the side and a counter in warning
 * carries a "!" the eye reads and its full words for assistive technology. Renders nothing when there
 * are no counters and no penalties.
 */
export function MatchCounters({
  views,
  sides,
  penalties,
  penaltyTemplate,
}: {
  readonly views: readonly MatchCounterView[];
  readonly sides: readonly { readonly entrantId: string; readonly name: string }[];
  readonly penalties: readonly MatchPenaltyView[];
  /** "{side}: {time} suspension", with the side's name and the remaining "MM:SS". */
  readonly penaltyTemplate: string;
}): React.JSX.Element | null {
  if (views.length === 0 && penalties.length === 0) return null;
  const nameOf = (entrantId: string): string =>
    sides.find((side) => side.entrantId === entrantId)?.name ?? '';
  return (
    <div className="cl-match-counters" data-testid="match-counters">
      {views.length > 0 && (
        <ul className="cl-match-counters__list">
          {views.map((view) => (
            <li className="cl-match-counter-row" key={view.code}>
              <span className="cl-match-counter-row__label">{view.label}</span>
              <ul className="cl-match-counter-row__sides">
                {view.sides.map((side) => (
                  <li
                    className={`cl-match-counter${side.warning ? ' cl-match-counter--warning' : ''}`}
                    key={side.entrantId}
                  >
                    <span aria-hidden="true">
                      {`${nameOf(side.entrantId)} ${side.valueText}${side.warning ? ' !' : ''}`}
                    </span>
                    <span className="cl-visually-hidden">
                      {`${nameOf(side.entrantId)}, ${side.accessibleName}`}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <PenaltyCountdownList
        key={penaltySnapshotKey(penalties)}
        penalties={penalties}
        template={penaltyTemplate}
      />
    </div>
  );
}

function PenaltyCountdownList({
  penalties,
  template,
}: {
  readonly penalties: readonly MatchPenaltyView[];
  readonly template: string;
}): React.JSX.Element | null {
  const countdown = usePenaltyCountdown(penalties);
  if (countdown.length === 0) return null;
  return (
    <ul className="cl-match-penalties">
      {countdown.map((penalty) => (
        <li className="cl-match-penalty" key={penalty.timerId}>
          <time>
            {applyTemplate(template, {
              side: penalty.sideName,
              time: formatPenaltyClock(penalty.remaining),
            })}
          </time>
        </li>
      ))}
    </ul>
  );
}
