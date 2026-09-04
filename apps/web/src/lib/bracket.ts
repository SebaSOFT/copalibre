import type { ResultReason } from '@copalibre/domain';
import { presentState, type ResultState, type ResultStateLabels } from './result-state.js';
import type { PublicSeriesState } from './series.js';

/**
 * The bracket, as a list of rounds rather than a tree.
 *
 * A tree can only describe single elimination. Double elimination has a losers'
 * bracket whose matches take entrants from two different places, and a grand
 * final that may be played twice — none of which is a parent-child relation.
 * So the shape is a flat list of matches, each naming where its entrants come
 * from, and the layout is derived from that.
 */

export type SlotSource =
  | { readonly kind: 'entrant'; readonly name: string; readonly abbreviation?: string }
  | { readonly kind: 'winner-of'; readonly matchNumber?: number; readonly matchId?: string }
  | { readonly kind: 'loser-of'; readonly matchNumber?: number; readonly matchId?: string }
  | { readonly kind: 'seed'; readonly seed: number };

export type StageLayout = 'bracket' | 'grid';

/**
 * Selects whether a stage layout renders as a bracket knockout tree or
 * a compact by-round match grid. Only elimination formats use the bracket tree.
 */
export function selectStageLayout(format?: string): StageLayout {
  if (!format) return 'bracket';
  const eliminationFormats = [
    'single-elimination',
    'double-elimination',
    'gauntlet',
    'bracket-groups',
    'custom-bracket',
    'ffa-bracket',
    'ffa-bracket-groups',
  ];
  return eliminationFormats.includes(format) ? 'bracket' : 'grid';
}

export interface BracketMatch {
  readonly matchNumber: number;
  readonly roundNumber: number;
  /** `winners`, `losers`, `final` — a label, not an enum the engine owns. */
  readonly branch: string;
  readonly slots: readonly SlotSource[];
  readonly scores?: readonly (number | undefined)[];
  /** Parallel to `scores` — why a side's result is what it is. */
  readonly resultReasons?: readonly (ResultReason | undefined)[];
  readonly state: ResultState;
  /**
   * Present only on a cross a series settles. Absent everywhere else, which is what keeps a
   * single-match cross rendering exactly as it did before series existed — no bar, no score,
   * no indication of any kind.
   */
  readonly series?: PublicSeriesState;
}

export interface BracketRound {
  readonly roundNumber: number;
  readonly branch: string;
  readonly matches: readonly BracketMatch[];
}

export interface NodeSlotView {
  readonly label: string;
  /** Entrant labels retain full and compact forms for responsive rendering. */
  readonly fullName?: string;
  readonly abbreviation?: string;
  readonly score?: number;
  /** Absent, or `played`, renders nothing — only an unusual reason is shown. */
  readonly resultReason?: Exclude<ResultReason, 'played'>;
  readonly state: ResultState;
  /** True while the entrant is not known yet: rendered dashed, never blank. */
  readonly pending: boolean;
}

export interface MatchNodeView {
  readonly matchNumber: number;
  readonly state: ResultState;
  readonly badge: ReturnType<typeof presentState>;
  readonly slots: readonly NodeSlotView[];
}

/** Groups matches into rounds per branch, in play order. */
export function toRounds(matches: readonly BracketMatch[]): readonly BracketRound[] {
  const grouped = new Map<string, BracketMatch[]>();
  for (const match of matches) {
    const key = `${match.branch}:${match.roundNumber}`;
    grouped.set(key, [...(grouped.get(key) ?? []), match]);
  }

  return [...grouped.entries()]
    .map(([key, roundMatches]) => ({
      branch: key.slice(0, key.lastIndexOf(':')),
      roundNumber: roundMatches[0]?.roundNumber ?? 0,
      matches: [...roundMatches].sort((a, b) => a.matchNumber - b.matchNumber),
    }))
    .sort((a, b) => a.branch.localeCompare(b.branch) || a.roundNumber - b.roundNumber);
}

/**
 * A node, with every slot resolved to something a person can read.
 *
 * An unresolved slot says "Ganador del 3", not nothing: a blank cell is
 * indistinguishable from a bug, while a named dependency tells a spectator what
 * has to happen before their team plays.
 */
export function toNode(match: BracketMatch, labels: ResultStateLabels): MatchNodeView {
  return {
    matchNumber: match.matchNumber,
    state: match.state,
    badge: presentState(match.state, labels),
    slots: match.slots.map((slot, index) => {
      const score = match.scores?.[index];
      const resultReason = match.resultReasons?.[index];
      const pending = slot.kind !== 'entrant';
      return {
        label: describeSlot(slot),
        ...(slot.kind === 'entrant'
          ? {
              fullName: slot.name,
              ...(slot.abbreviation === undefined ? {} : { abbreviation: slot.abbreviation }),
            }
          : {}),
        ...(score === undefined ? {} : { score }),
        ...(resultReason === undefined || resultReason === 'played' ? {} : { resultReason }),
        state: pending ? 'tbd' : match.state,
        pending,
      };
    }),
  };
}

/**
 * Not extracted to the message catalog — same shape as the control
 * panel's own deferred `describeSlot` (`apps/web/src/control/lib/bracket-
 * canvas.ts`): pure geometry computation with a dynamic match/
 * seed number and no `intl` in scope at the call site, a genuinely different
 * pattern from this module's other extractions; tracked as a follow-up
 * alongside that one rather than solved differently here.
 */
export function describeSlot(slot: SlotSource): string {
  switch (slot.kind) {
    case 'entrant':
      return slot.name;
    case 'winner-of': {
      if (
        typeof slot.matchNumber === 'number' &&
        !Number.isNaN(slot.matchNumber) &&
        slot.matchNumber > 0
      ) {
        return `Ganador del ${slot.matchNumber}`;
      }
      if (slot.matchId && slot.matchId !== '—') {
        const clean = slot.matchId.replace(/^SE-|^WB-|^LB-/, '');
        return `Ganador de ${clean}`;
      }
      return 'Por definir';
    }
    case 'loser-of': {
      if (
        typeof slot.matchNumber === 'number' &&
        !Number.isNaN(slot.matchNumber) &&
        slot.matchNumber > 0
      ) {
        return `Perdedor del ${slot.matchNumber}`;
      }
      if (slot.matchId && slot.matchId !== '—') {
        const clean = slot.matchId.replace(/^SE-|^WB-|^LB-/, '');
        return `Perdedor de ${clean}`;
      }
      return 'Por definir';
    }
    case 'seed':
      return `Sembrado ${slot.seed}`;
  }
}

/** Whether every entrant of a match is known; a grand final rarely is, early. */
export function isResolved(match: BracketMatch): boolean {
  return match.slots.every((slot) => slot.kind === 'entrant');
}

/**
 * A bracket card's own report page — resolved or not. The report
 * page already renders correctly for a not-yet-played match, so this needs
 * nothing about the match beyond its number.
 */
export function matchReportUrl(input: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
  readonly matchNumber: number;
  readonly localePrefix?: string;
}): string {
  const { organizationAlias, tournamentAlias, stageNumber, matchNumber, localePrefix = '' } = input;
  return `${localePrefix}/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
    tournamentAlias,
  )}/stages/${stageNumber}/matches/${matchNumber}`;
}
