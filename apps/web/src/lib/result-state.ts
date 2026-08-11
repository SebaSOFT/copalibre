/**
 * One place that decides how a result state looks and reads (0021).
 *
 * Colour is never the only cue — the identity doc's accessibility gate — and
 * the reliable way to hold that line is to make the label impossible to omit:
 * a state resolves to a triple, and a template that wants the colour gets the
 * label and the icon with it.
 *
 * The label is resolved from a caller-supplied dictionary rather than an
 * `IntlShape` directly (0055): `LiveMatchHero.tsx`, a hydrated client island,
 * calls this too, and must never import `react-intl`'s formatting machinery
 * into the browser bundle — its parent page resolves the dictionary once at
 * build time via `resultStateLabels()` and passes it down as a plain prop.
 */

export type ResultState =
  'live' | 'upcoming' | 'final' | 'disputed' | 'winner' | 'loser' | 'tbd' | 'cancelled';

export interface StatePresentation {
  readonly state: ResultState;
  readonly label: string;
  /** A shape, for viewers who distinguish neither the colour nor the word. */
  readonly icon: string;
  /** The token class; `cl-state-*` maps onto 0019's semantic tokens. */
  readonly className: string;
}

export type ResultStateLabels = Readonly<Record<ResultState, string>>;

const ICON: Readonly<Record<ResultState, string>> = {
  live: '●',
  upcoming: '◷',
  final: '✓',
  disputed: '!',
  winner: '▲',
  loser: '▽',
  tbd: '—',
  cancelled: '×',
};

const CLASS_NAME: Readonly<Record<ResultState, string>> = {
  live: 'cl-state--live',
  upcoming: 'cl-state--upcoming',
  final: 'cl-state--positive',
  disputed: 'cl-state--destructive',
  winner: 'cl-state--positive',
  loser: 'cl-state--muted',
  tbd: 'cl-state--pending',
  cancelled: 'cl-state--destructive',
};

const ALL_STATES: readonly ResultState[] = [
  'live',
  'upcoming',
  'final',
  'disputed',
  'winner',
  'loser',
  'tbd',
  'cancelled',
];

export function presentState(state: ResultState, labels: ResultStateLabels): StatePresentation {
  return { state, label: labels[state], icon: ICON[state], className: CLASS_NAME[state] };
}

/** Every state, for the legend the page shows once. */
export function resultLegend(labels: ResultStateLabels): readonly StatePresentation[] {
  return ALL_STATES.map((state) => presentState(state, labels));
}

/**
 * The winner/loser pair for a decided match, or nothing while it is undecided.
 *
 * Returned as a pair rather than looked up per row, because a row that decides
 * on its own is a row that can call both sides the winner after a correction.
 */
export function decide(
  home: number | undefined,
  away: number | undefined,
): { readonly home: ResultState; readonly away: ResultState } | undefined {
  if (home === undefined || away === undefined) return undefined;
  if (home === away) return { home: 'final', away: 'final' };
  return home > away ? { home: 'winner', away: 'loser' } : { home: 'loser', away: 'winner' };
}
