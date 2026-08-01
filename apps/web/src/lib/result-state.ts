/**
 * One place that decides how a result state looks and reads (0021).
 *
 * Colour is never the only cue — the identity doc's accessibility gate — and
 * the reliable way to hold that line is to make the label impossible to omit:
 * a state resolves to a triple, and a template that wants the colour gets the
 * label and the icon with it.
 */

export type ResultState =
  'live' | 'upcoming' | 'final' | 'disputed' | 'winner' | 'loser' | 'tbd' | 'cancelled';

export interface StatePresentation {
  readonly state: ResultState;
  /** Text, always. Spanish is the primary locale (0020). */
  readonly label: string;
  /** A shape, for viewers who distinguish neither the colour nor the word. */
  readonly icon: string;
  /** The token class; `cl-state-*` maps onto 0019's semantic tokens. */
  readonly className: string;
}

const PRESENTATION: Readonly<Record<ResultState, StatePresentation>> = {
  live: { state: 'live', label: 'EN VIVO', icon: '●', className: 'cl-state--live' },
  upcoming: { state: 'upcoming', label: 'PROGRAMADO', icon: '◷', className: 'cl-state--upcoming' },
  final: { state: 'final', label: 'FINAL', icon: '✓', className: 'cl-state--positive' },
  disputed: {
    state: 'disputed',
    label: 'EN DISPUTA',
    icon: '!',
    className: 'cl-state--destructive',
  },
  winner: { state: 'winner', label: 'GANÓ', icon: '▲', className: 'cl-state--positive' },
  loser: { state: 'loser', label: 'PERDIÓ', icon: '▽', className: 'cl-state--muted' },
  tbd: { state: 'tbd', label: 'A DEFINIR', icon: '—', className: 'cl-state--pending' },
  cancelled: {
    state: 'cancelled',
    label: 'CANCELADO',
    icon: '×',
    className: 'cl-state--destructive',
  },
};

export function presentState(state: ResultState): StatePresentation {
  return PRESENTATION[state];
}

/** Every state, for the legend the page shows once. */
export function resultLegend(): readonly StatePresentation[] {
  return Object.values(PRESENTATION);
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
