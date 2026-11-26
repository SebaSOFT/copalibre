import type { MatchCounterView, MatchCounterSideView } from '../../../lib/match-counters.js';
import { applyTemplate } from '../../../lib/matches-view.js';
import {
  formatPenaltyClock,
  penaltySnapshotKey,
  usePenaltyCountdown,
} from '../../../lib/penalty-countdown.js';

/** One side of the scoreboard, with the place it sits in: the home side on the left, the away side on the right. */
export interface MatchCounterSide {
  readonly entrantId: string;
  readonly name: string;
  readonly place: 'home' | 'away';
}

export interface MatchPenaltyView {
  readonly timerId: string;
  readonly entrantId: string;
  readonly remainingSeconds: number;
  /** The side's name, as the page shows it. */
  readonly sideName: string;
}

/**
 * The declared counters of a match, laid out over the scoreboard: each counter's label centred above its
 * two values, the home side's value under the home side and the away side's under the away side. A timed
 * penalty sits under the side it belongs to. The visible value is the number alone; the side's name and
 * the warning are in the accessible text, and a counter in warning carries a "!" tight against its value.
 * Renders nothing when there are neither counters nor penalties.
 */
export function MatchCounters({
  views,
  sides,
  penalties,
  penaltyTemplate,
}: {
  readonly views: readonly MatchCounterView[];
  readonly sides: readonly MatchCounterSide[];
  readonly penalties: readonly MatchPenaltyView[];
  /** "{side}: {time} suspension", with the side's name and the remaining "MM:SS". */
  readonly penaltyTemplate: string;
}): React.JSX.Element | null {
  if (views.length === 0 && penalties.length === 0) return null;
  const sideOf = (entrantId: string): MatchCounterSide | undefined =>
    sides.find((side) => side.entrantId === entrantId);
  return (
    <div className="cl-match-counters" data-testid="match-counters">
      {views.length > 0 && (
        <ul className="cl-match-counters__list">
          {views.map((view) => (
            <li className="cl-match-counter-row" key={view.code}>
              <span className="cl-match-counter-row__label">{view.label}</span>
              {view.sides.map((side) => {
                const placed = sideOf(side.entrantId);
                if (placed === undefined) return null;
                return (
                  <CounterValue
                    key={side.entrantId}
                    name={placed.name}
                    place={placed.place}
                    side={side}
                  />
                );
              })}
            </li>
          ))}
        </ul>
      )}
      <PenaltyCountdownList
        key={penaltySnapshotKey(penalties)}
        penalties={penalties}
        placeOf={(entrantId) => sideOf(entrantId)?.place ?? 'away'}
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
        {side.valueText}
        {side.warning && <span className="cl-match-counter__cue">!</span>}
      </span>
      <span className="cl-visually-hidden">{`${name}, ${side.accessibleName}`}</span>
    </span>
  );
}

function PenaltyCountdownList({
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
    <ul className="cl-match-penalties">
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
