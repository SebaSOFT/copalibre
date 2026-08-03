/**
 * The A5 standings view model (0024).
 *
 * Everything here is arithmetic and column ordering. No ranking, no tiebreak
 * evaluation, and above all no trace text: the trace arrives from the API as
 * lines the rules engine rendered, and this screen's whole promise is that what
 * an operator reads is what the engine decided.
 */

export interface StandingsRowData {
  readonly rank: number;
  readonly entrantId: string;
  readonly sharedRank: boolean;
  readonly statistics: Readonly<Record<string, number>>;
  readonly tieBroken: boolean;
}

export interface StandingsData {
  readonly stageId: string;
  readonly projectionVersion: number;
  readonly fullyResolved: boolean;
  readonly rows: readonly StandingsRowData[];
  /** Whole-calculation trace retained for audit/export; row panels fetch filtered traces lazily. */
  readonly trace: readonly string[];
}

/** Display names for entrants, which the standings projection identifies by id. */
export type EntrantNames = Readonly<
  Record<string, { readonly name: string; readonly abbreviation?: string }>
>;

export interface StandingsColumn {
  readonly code: string;
  readonly label: string;
  /** Short header for the narrow columns the mockup stacks (W-D-L). */
  readonly shortLabel: string;
}

/**
 * The columns most disciplines declare, in the order the mockup shows them.
 *
 * A preference, never a filter: a discipline declaring `frags` gets a `frags`
 * column, because the descriptor is the authority on what its standings are
 * made of and a hardcoded five-column table would silently drop it.
 */
const PREFERRED_COLUMNS: readonly StandingsColumn[] = [
  { code: 'played', label: 'Partidos', shortLabel: 'PJ' },
  { code: 'wins', label: 'Ganados', shortLabel: 'G' },
  { code: 'draws', label: 'Empatados', shortLabel: 'E' },
  { code: 'losses', label: 'Perdidos', shortLabel: 'P' },
  { code: 'goals-for', label: 'A favor', shortLabel: 'GF' },
  { code: 'goals-against', label: 'En contra', shortLabel: 'GC' },
  { code: 'score-difference', label: 'Diferencia', shortLabel: 'Dif' },
  { code: 'points', label: 'Puntos', shortLabel: 'Pts' },
];

export function standingsColumns(rows: readonly StandingsRowData[]): readonly StandingsColumn[] {
  const present = new Set(rows.flatMap((row) => Object.keys(row.statistics)));
  const preferred = PREFERRED_COLUMNS.filter((column) => present.has(column.code));
  const known = new Set(preferred.map((column) => column.code));

  const extra = [...present]
    .filter((code) => !known.has(code))
    .sort()
    .map((code) => ({ code, label: code, shortLabel: code }));

  return [...preferred, ...extra];
}

export interface DistributionBar {
  readonly entrantId: string;
  readonly label: string;
  readonly value: number;
  /** Percentage of the widest bar, 0–100, rounded to one decimal. */
  readonly widthPercent: number;
}

/**
 * The top-N points-distribution bars.
 *
 * Scaled against the leader rather than against the axis maximum, because the
 * chart's job is comparison between the rows on screen — with a 0–100 axis a
 * league where everyone has eleven points renders as eight identical stubs and
 * says nothing.
 *
 * A leader on zero yields zero-width bars, not a division by zero: nobody has
 * scored, and eight full-width bars would say the opposite.
 */
export function distributionBars(
  rows: readonly StandingsRowData[],
  input: {
    readonly statisticCode?: string;
    readonly top?: number;
    readonly names?: EntrantNames;
  } = {},
): readonly DistributionBar[] {
  const code = input.statisticCode ?? 'points';
  const top = input.top ?? 5;
  const selected = rows.slice(0, Math.max(0, top));
  const max = selected.reduce((best, row) => Math.max(best, row.statistics[code] ?? 0), 0);

  return selected.map((row) => {
    const value = row.statistics[code] ?? 0;
    return {
      entrantId: row.entrantId,
      label: labelFor(row.entrantId, input.names),
      value,
      widthPercent: max <= 0 ? 0 : Math.round((value / max) * 1000) / 10,
    };
  });
}

export interface TiebreakIndicator {
  /** Rendered as text beside the icon; never colour alone. */
  readonly label: string;
  /** A glyph, chosen so grayscale printing still distinguishes the states. */
  readonly icon: string;
  readonly kind: 'resolved' | 'shared' | 'none';
}

/**
 * The tiebreak marker for one row.
 *
 * Icon **and** text, per the accessibility rule: a coloured dot alone is
 * invisible to a colour-blind operator and gone entirely on the printed sheet
 * somebody pins to the wall of the venue.
 */
export function tiebreakIndicator(row: StandingsRowData): TiebreakIndicator {
  if (row.sharedRank) return { kind: 'shared', icon: '=', label: 'Posición compartida' };
  if (row.tieBroken) return { kind: 'resolved', icon: '⇅', label: 'Desempatado' };
  return { kind: 'none', icon: '', label: '' };
}

export interface StandingsRowView extends StandingsRowData {
  readonly name: string;
  readonly abbreviation?: string;
  readonly indicator: TiebreakIndicator;
  /** True when there is a comparator chain worth expanding. */
  readonly expandable: boolean;
}

export function toRowViews(
  rows: readonly StandingsRowData[],
  names: EntrantNames = {},
): readonly StandingsRowView[] {
  return rows.map((row) => {
    const entry = names[row.entrantId];
    return {
      ...row,
      name: labelFor(row.entrantId, names),
      ...(entry?.abbreviation === undefined ? {} : { abbreviation: entry.abbreviation }),
      indicator: tiebreakIndicator(row),
      expandable: row.tieBroken,
    };
  });
}

function labelFor(entrantId: string, names?: EntrantNames): string {
  return names?.[entrantId]?.name ?? entrantId;
}
