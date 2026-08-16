import type { LocalizedLabel } from '../i18n-label.js';
import type { ActorGranularity } from '../statistics/hierarchies.js';

/**
 * A table layout turns figures a collector already produces into a row a
 * human reads — group standings, a top-scorers table, a goalkeeper ranking.
 * Before this, that shape lived in frontend code (`PREFERRED_COLUMNS` in
 * `apps/web`), at odds with every other discipline concept: an event, a
 * statistic, a win condition are all declared data, and which columns a
 * table shows was the one thing that was not.
 */

export type TableTarget =
  'group-phase' | 'match-roster' | 'player-ranking' | 'team-ranking' | 'schedule-timeframe';

/**
 * Where a column's value comes from. `computed` and `template` both route
 * through `@copalibre/rules`'s existing sandboxed expression evaluator —
 * `computed` yields the typed numeric value a sort rule can compare,
 * `template` yields a formatted string mixing literal text with `{{ }}`
 * expressions. Kept as two declared kinds because a discipline author
 * writing a ratio and one writing a display string are stating two
 * different intents, even though one evaluator serves both.
 */
export type ColumnSource =
  | { readonly kind: 'rank' }
  | { readonly kind: 'entrant-name' | 'actor-name' | 'team-name' | 'role' }
  | { readonly kind: 'collector'; readonly code: string }
  | { readonly kind: 'composite'; readonly numerator: string; readonly denominator: string }
  | { readonly kind: 'computed'; readonly expression: string }
  | { readonly kind: 'template'; readonly template: string };

export type ColumnFormat =
  'text' | 'number' | 'decimal-1' | 'decimal-2' | 'percentage' | 'fraction';

export interface TableSortRule {
  readonly columnCode: string;
  readonly direction: 'asc' | 'desc';
}

export interface TableQualificationFilter {
  readonly minSamples?: { readonly collectorCode: string; readonly min: number };
  readonly requiresRole?: string;
  readonly requiresTag?: string;
}

export interface TableColumnDefinition {
  readonly code: string;
  readonly header: LocalizedLabel;
  readonly shortHeader?: LocalizedLabel;
  readonly source: ColumnSource;
  readonly format: ColumnFormat;
  /** Absent means visible. A discipline may declare a column a console offers to reveal, not one it hides entirely. */
  readonly visibleByDefault?: boolean;
}

export interface TableLayoutDefinition {
  readonly code: string;
  readonly target: TableTarget;
  readonly label: LocalizedLabel;
  readonly entityGranularity: ActorGranularity;
  readonly filter?: TableQualificationFilter;
  readonly defaultSort: readonly TableSortRule[];
  readonly columns: readonly TableColumnDefinition[];
}
