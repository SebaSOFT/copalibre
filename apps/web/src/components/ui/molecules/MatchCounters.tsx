import type { MatchCounterView, MatchCounterSideView } from '../../../lib/match-counters.js';
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
 * The declared counters of a match, laid out over the scoreboard: the home side's value under the home
 * side, the counter's label between them (on a phone, above them), the away side's value under the away
 * side. A timed penalty sits under the side it belongs to. A counter in warning carries a "!" tight
 * against its value and its full words for assistive technology. Renders nothing when there are neither
 * counters nor penalties.
 */
export function MatchCounters({
  views,
  sides,
  penalties,
  penaltyTemplate,
}: {
  readonly views: readonly MatchCounterView[];
  /** In scoreboard order: the first side is home, the second away. */
  readonly sides: readonly { readonly entrantId: string; readonly name: string }[];
  readonly penalties: readonly MatchPenaltyView[];
  /** "{side}: {time} suspension", with the side's name and the remaining "MM:SS". */
  readonly penaltyTemplate: string;
}): React.JSX.Element | null {
  if (views.length === 0 && penalties.length === 0) return null;
  const homeId = sides[0]?.entrantId;
  const placeOf = (entrantId: string): 'home' | 'away' => (entrantId === homeId ? 'home' : 'away');
  const nameOf = (entrantId: string): string =>
    sides.find((side) => side.entrantId === entrantId)?.name ?? '';
  return (
    <div className="cl-match-counters" data-testid="match-counters">
      {views.length > 0 && (
        <ul className="cl-match-counters__grid">
          {views.map((view) => (
            <li className="cl-match-counter-row" key={view.code}>
              <span className="cl-match-counter-row__label">{view.label}</span>
              {view.sides.map((side) => (
                <CounterValue
                  key={side.entrantId}
                  name={nameOf(side.entrantId)}
                  place={placeOf(side.entrantId)}
                  side={side}
                />
              ))}
            </li>
          ))}
        </ul>
      )}
      <PenaltyCountdownGrid
        key={penaltySnapshotKey(penalties)}
        penalties={penalties}
        placeOf={placeOf}
        template={penaltyTemplate}
      />
    </div>
  );
}

function CounterValue({
  name,
  place,
  side,
}: {
  readonly name: string;
  readonly place: 'home' | 'away';
  readonly side: MatchCounterSideView;
}): React.JSX.Element {
  return (
    <span
      className={`cl-match-counter cl-match-counter--${place}${side.warning ? ' cl-match-counter--warning' : ''}`}
    >
      <span aria-hidden="true">
        {`${name} ${side.valueText}`}
        {side.warning && <span className="cl-match-counter__cue">!</span>}
      </span>
      <span className="cl-visually-hidden">{`${name}, ${side.accessibleName}`}</span>
    </span>
  );
}

function PenaltyCountdownGrid({
  penalties,
  placeOf,
  template,
}: {
  readonly penalties: readonly MatchPenaltyView[];
  readonly placeOf: (entrantId: string) => 'home' | 'away';
  readonly template: string;
}): React.JSX.Element | null {
  const countdown = usePenaltyCountdown(penalties);
  if (countdown.length === 0) return null;
  return (
    <ul className="cl-match-penalties cl-match-counters__grid">
      {countdown.map((penalty) => (
        <li
          className={`cl-match-penalty cl-match-penalty--${placeOf(penalty.entrantId)}`}
          key={penalty.timerId}
        >
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
