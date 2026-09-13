/**
 * The bracket's outcome key.
 *
 * A bracket paints advancement and elimination as fills, and a fill is not a
 * cue: the identity's accessibility gate says colour is never alone, and a
 * viewer who distinguishes neither the accent nor the neutral needs the other
 * two channels. So every entry carries a glyph *and* a written word, and the
 * box around the glyph is the third channel rather than the only one.
 *
 * Rendered statically by Astro — no `client:` directive at its call sites — so
 * it survives a page loaded with JavaScript unavailable, which is the state a
 * public results page has to keep working in.
 */

export type BracketOutcome = 'advancing' | 'eliminated' | 'pending';

/** A shape per outcome, for viewers who distinguish neither the fill nor the word. */
const GLYPH: Readonly<Record<BracketOutcome, string>> = {
  advancing: '✓',
  eliminated: '✕',
  pending: '—',
};

export interface OutcomeLegendEntry {
  readonly outcome: BracketOutcome;
  /** The written word. The caller holds the catalogue; this holds no strings. */
  readonly label: string;
}

export interface OutcomeLegendProps {
  readonly entries: readonly OutcomeLegendEntry[];
  /** Accessible name for the legend as a whole. */
  readonly label: string;
  readonly className?: string;
}

export function OutcomeLegend({
  entries,
  label,
  className = '',
}: OutcomeLegendProps): React.JSX.Element {
  return (
    <ul aria-label={label} className={`cl-outcome-legend ${className}`.trim()}>
      {entries.map((entry) => (
        <li className="cl-outcome-legend__item" key={entry.outcome}>
          <span
            aria-hidden="true"
            className={`cl-outcome-legend__glyph cl-outcome-legend__glyph--${entry.outcome}`}
          >
            {GLYPH[entry.outcome]}
          </span>
          <span className="cl-outcome-legend__label">{entry.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** The glyph a single outcome uses, for a caller marking one node rather than a key. */
export function outcomeGlyph(outcome: BracketOutcome): string {
  return GLYPH[outcome];
}
