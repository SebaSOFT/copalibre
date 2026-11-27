import { BREAKPOINTS } from '../../primitives.js';

export function compositionsPanels(): string[] {
  return [
    /*
     * The operational-tag family: chrome, not state. A state badge reports a
     * condition and takes the state's colour; these name a region and take the
     * chrome level, a border and the mono face, which is what stops a reader
     * mistaking a section label for a live indicator.
     *
     * They wrap. A section label carrying a German compound at the 188px floor
     * has no break the browser will take on its own, and a clipped label is a
     * label that stopped naming its section.
     */
    '.cl-badge--eyebrow, .cl-badge--section {',
    '  background: var(--cl-surface-chrome);',
    '  border: 1px solid var(--cl-border-muted);',
    '  color: var(--cl-text-secondary);',
    '  font-family: var(--cl-font-mono);',
    '  font-weight: var(--cl-weight-medium);',
    '  letter-spacing: var(--cl-tracking-wider);',
    '  max-width: 100%;',
    '  white-space: normal;',
    '  overflow-wrap: anywhere;',
    '}',
    '',
    '.cl-badge--eyebrow { font-size: var(--cl-font-size-xs); }',
    '.cl-badge--section { font-size: var(--cl-font-size-sm); padding: var(--cl-space-1) var(--cl-space-3); }',
    '',
    /*
     * The live dot is emphasis, never the cue: the label beside it is the cue.
     * Under reduced motion the global accommodation collapses the pulse to
     * nothing and the dot stays put and visible, which is the correct outcome —
     * the information was never in the movement.
     */
    '.cl-badge__dot {',
    '  flex: 0 0 auto;',
    '  width: 6px;',
    '  height: 6px;',
    '  border-radius: 50%;',
    '  background: currentColor;',
    '}',
    '',
    /*
     * The bracket's outcome key. Three channels per entry — glyph, box and
     * word — so advancement and elimination separate without the fill and
     * without a colour-vision assumption.
     */
    '.cl-outcome-legend {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  gap: var(--cl-space-4);',
    '  margin: 0;',
    '  padding: 0;',
    '  list-style: none;',
    '}',
    '',
    '.cl-outcome-legend__item { display: inline-flex; align-items: center; gap: var(--cl-space-2); min-width: 0; }',
    '',
    '.cl-outcome-legend__glyph {',
    '  display: grid;',
    '  place-items: center;',
    '  flex: 0 0 auto;',
    '  width: 20px;',
    '  height: 20px;',
    '  border: 1px solid var(--cl-border-muted);',
    '  background: var(--cl-surface-chrome);',
    '  color: var(--cl-text-secondary);',
    '  font-family: var(--cl-font-mono);',
    '  font-size: var(--cl-font-size-xs);',
    '  line-height: 1;',
    '}',
    '',
    '.cl-outcome-legend__glyph--advancing { background: var(--cl-primary); border-color: var(--cl-primary); color: var(--cl-primary-text); }',
    '',
    '.cl-outcome-legend__label { color: var(--cl-text-secondary); font-size: var(--cl-font-size-sm); overflow-wrap: anywhere; }',
    '',
    '.cl-completion-figure {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: var(--cl-space-3);',
    '  padding: var(--cl-space-4);',
    '  width: 100%;',
    '}',
    '',
    '.cl-completion-figure__header {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  gap: var(--cl-space-2) var(--cl-space-3);',
    '}',
    '',
    '.cl-completion-figure__heading {',
    '  margin: 0;',
    '  font-family: var(--cl-font-display);',
    '  font-size: var(--cl-font-size-md);',
    '  font-weight: var(--cl-weight-bold);',
    '  color: var(--cl-text-primary);',
    '}',
    '',
    '.cl-completion-figure__badge {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: var(--cl-space-1);',
    '  white-space: nowrap;',
    '  flex-shrink: 0;',
    '}',
    '',
    '.cl-completion-figure__body {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: var(--cl-space-2);',
    '}',
    '',
    '.cl-completion-figure__stages {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: var(--cl-space-3);',
    '  margin: var(--cl-space-1) 0 0;',
    '  padding: 0;',
    '  list-style: none;',
    '}',
    '',
    '.cl-completion-figure__stage-item {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: var(--cl-space-2);',
    '}',
    '',
    '.cl-completion-figure__segments {',
    '  display: grid;',
    '  grid-template-columns: repeat(auto-fill, minmax(min(11rem, 100%), 1fr));',
    '  gap: var(--cl-space-2) var(--cl-space-4);',
    '  margin: 0;',
    '  padding: 0 0 0 var(--cl-space-3);',
    '  list-style: none;',
    '  border-inline-start: 1px solid var(--cl-border-muted);',
    '}',
    '',
    '/* A name and its counts on one line, the bar full width beneath them. */',
    '.cl-completion-figure__row {',
    '  display: grid;',
    '  grid-template-columns: 1fr auto;',
    '  align-items: baseline;',
    '  gap: var(--cl-space-1) var(--cl-space-2);',
    '  font-size: var(--cl-font-size-sm);',
    '  color: var(--cl-text-secondary);',
    '}',
    '.cl-completion-figure__row .cl-progress { grid-column: 1 / -1; }',
    '.cl-completion-figure__row-name { overflow-wrap: anywhere; }',
    '',
    '.cl-completion-figure__stage-counts {',
    '  font-family: var(--cl-font-mono);',
    '  font-variant-numeric: tabular-nums;',
    '  white-space: nowrap;',
    '}',
    '',
    '/* Native <progress>, so the value and the maximum are announced without ARIA of our own. */',
    '.cl-progress {',
    '  appearance: none;',
    '  display: block;',
    '  width: 100%;',
    '  height: var(--cl-space-2);',
    '  border: 0;',
    '  background: var(--cl-surface-chrome);',
    '  color: var(--cl-primary);',
    '  overflow: hidden;',
    '}',
    '.cl-progress--overall { height: var(--cl-space-3); }',
    '.cl-progress::-webkit-progress-bar { background: var(--cl-surface-chrome); }',
    '.cl-progress::-webkit-progress-value { background: var(--cl-primary); }',
    '.cl-progress::-moz-progress-bar { background: var(--cl-primary); }',
    '',
    '/* The audit log panel displays cryptographic ledger diffs and events */',
    '.cl-audit-log-panel {',
    '  background: var(--cl-surface-panel);',
    '  border: 1px solid var(--cl-border-muted);',
    '  padding: var(--cl-space-4);',
    '}',
    '.cl-audit-log-panel__header {',
    '  border-bottom: 1px solid var(--cl-border-muted);',
    '  padding-bottom: var(--cl-space-2);',
    '}',
    '.cl-audit-log-panel__title {',
    '  margin: 0;',
    '  min-width: 0;',
    '  font-family: var(--cl-font-display);',
    '  font-size: var(--cl-font-size-md);',
    '  font-weight: var(--cl-weight-bold);',
    '  text-transform: uppercase;',
    '  letter-spacing: var(--cl-tracking-wide);',
    '  color: var(--cl-text-primary);',
    '}',
    '.cl-audit-log-panel__count {',
    '  font-family: var(--cl-font-mono);',
    '  font-size: var(--cl-font-size-xs);',
    '  color: var(--cl-text-muted);',
    '}',
    '.cl-audit-log-panel__item {',
    '  padding: var(--cl-space-2) var(--cl-space-3);',
    '  background: var(--cl-surface-chrome);',
    '  border-radius: 0 var(--cl-radius-sm) var(--cl-radius-sm) 0;',
    '}',
    '.cl-audit-log-panel__meta {',
    '  font-size: var(--cl-font-size-xs);',
    '  font-family: var(--cl-font-mono);',
    '  color: var(--cl-text-secondary);',
    '  margin-bottom: var(--cl-space-1);',
    '}',
    '.cl-audit-log-panel__actor {',
    '  font-weight: var(--cl-weight-bold);',
    '  color: var(--cl-text-primary);',
    '}',
    '.cl-audit-log-panel__dot {',
    '  margin: 0 6px;',
    '  color: var(--cl-text-muted);',
    '}',
    '.cl-audit-log-panel__latency {',
    '  color: var(--cl-state-live);',
    '  background: var(--cl-surface-base);',
    '  padding: 1px 6px;',
    '  border-radius: var(--cl-radius-sm);',
    '  font-size: var(--cl-font-size-xs);',
    '}',
    '.cl-audit-log-panel__diff {',
    '  font-family: var(--cl-font-mono);',
    '  font-size: var(--cl-font-size-xs);',
    '  margin-top: var(--cl-space-2);',
    '  padding: var(--cl-space-2);',
    '  background: var(--cl-surface-base);',
    '  border-radius: var(--cl-radius-sm);',
    '  border: 1px solid var(--cl-border-muted);',
    '}',
    '.cl-audit-log-panel__diff-prev {',
    '  color: var(--cl-state-destructive);',
    '}',
    '.cl-audit-log-panel__diff-curr {',
    '  color: var(--cl-state-positive);',
    '}',
    '',
    /*
     * The standings panel dresses `.cl-data-table`; it does not replace it.
     * Header and footer are chrome, the table sits in the well, and the footer
     * carries the tiebreaker sequence because that is where a reader looks
     * after finding two entrants level.
     */
    '.cl-standings-panel { display: grid; min-width: 0; }',
    '',
    '.cl-standings-panel__header {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  align-items: baseline;',
    '  justify-content: space-between;',
    '  gap: var(--cl-space-3);',
    '  padding: var(--cl-space-3) var(--cl-space-4);',
    '}',
    '',
    '.cl-standings-panel__title { margin: 0; font-size: var(--cl-font-size-md); }',
    '',
    '.cl-standings-panel__footer { display: grid; min-width: 0; gap: var(--cl-space-2); padding: var(--cl-space-3) var(--cl-space-4); }',
    '',
    // Rank and figures are read down a column, so they align down a column.
    '.cl-standings-panel__rank { font-family: var(--cl-font-mono); font-variant-numeric: tabular-nums; text-align: right; }',
    '.cl-standings-panel__figure { font-variant-numeric: tabular-nums; text-align: right; }',
    '',
    /*
     * The deciding comparator is marked in the column that decided it, not
     * announced somewhere else on the page: a reader who has just found two
     * equal point totals is already looking at the row.
     */
    '.cl-standings-panel__figure--deciding {',
    '  color: var(--cl-text-accent);',
    '  font-weight: var(--cl-weight-bold);',
    '  text-decoration: underline;',
    '  text-underline-offset: 3px;',
    '}',
    '',
    // Signed goal difference: the sign itself is the non-colour cue the
    // identity doc's accessibility gate requires (semantic.ts), so no
    // icon is added on top of it — colour only reinforces what the digit
    // already says.
    '.cl-standings-panel__figure--positive { color: var(--cl-state-positive); }',
    '.cl-standings-panel__figure--negative { color: var(--cl-state-destructive); }',
    // The ranking metric a layout's `defaultSort[0]` scales (PTS for group
    // standings, goals for a scorers table) — emphasised so it reads as the
    // column the whole table is ordered by.
    '.cl-standings-panel__figure--emphasis { color: var(--cl-text-accent); font-weight: var(--cl-weight-bold); }',
    '',
    '.cl-standings-panel__subtitle { margin: 0; color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); }',
    '',
    '.cl-standings-panel__footer-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--cl-space-3); }',
    '.cl-standings-panel__audit-code { color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); }',
    '',
    // The sortable header's own trigger: the whole cell is a button so its
    // hit target is the header, not just the tooltip glyph beside the label.
    '.cl-column-header { display: inline-flex; align-items: center; gap: var(--cl-space-1); background: transparent; border: none; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; padding: 0; cursor: pointer; }',
    '.cl-column-header__indicator { font-size: var(--cl-font-size-xs); color: var(--cl-text-muted); }',
    'th[aria-sort="ascending"] .cl-column-header__indicator, th[aria-sort="descending"] .cl-column-header__indicator { color: var(--cl-text-accent); }',
    '',
    // The label sorts and the icon beside it explains, so a header holds two
    // sibling controls and never one nested in the other.
    '.cl-column-header-tooltip { display: inline-flex; align-items: center; gap: 2px; }',
    // The label gives up its 44px width, so label and icon fit the column the
    // label alone used to need. It stays 44px tall, the axis a table constrains.
    '.cl-column-header-tooltip .cl-table__sort { min-width: 0; }',
    // The target overhangs up and down only: sideways it would cover the label
    // that sorts, or the next column's.
    '.cl-column-header-tooltip .cl-popover__trigger::before { inset: -14px -4px; }',
    '',
    // A floating explanation on the dialog surface. The trigger paints 16px and
    // its target overhangs to 44px, as the checkbox's does.
    // Doubled so it outranks Control's `button` target rule: the target is the
    // `::before` below, and a 44px box here would grow the field it sits in.
    '.cl-popover__trigger.cl-popover__trigger { position: relative; display: inline-flex; flex: none; align-items: center; justify-content: center; width: 1rem; min-width: 0; height: 1rem; min-height: 0; padding: 0; border: none; background: transparent; color: var(--cl-text-muted); cursor: help; }',
    ".cl-popover__trigger::before { content: ''; position: absolute; inset: -14px; }",
    ".cl-popover__trigger.cl-popover__trigger:hover, .cl-popover__trigger.cl-popover__trigger[data-state='open'] { color: var(--cl-text-accent); }",
    ".cl-popover__trigger.cl-popover__trigger[data-tone='error'] { color: var(--cl-state-destructive); }",
    // A text trigger reads as a chip: its own box is the target, so it needs no overhang.
    '.cl-popover__trigger.cl-popover__trigger--text { justify-content: flex-start; width: auto; height: auto; min-height: 1.75rem; padding: var(--cl-space-1) var(--cl-space-2); border: 1px solid var(--cl-border-muted); background: var(--cl-surface-chrome); color: var(--cl-text-secondary); font: inherit; text-align: start; text-decoration: underline dotted; text-underline-offset: 0.2em; cursor: pointer; overflow-wrap: anywhere; }',
    '.cl-popover__trigger--text::before { inset: 0; }',
    '.cl-popover__content { z-index: 40; max-width: min(20rem, calc(100vw - var(--cl-space-8))); padding: var(--cl-space-2) var(--cl-space-3); color: var(--cl-text-primary); font-family: var(--cl-font-body); font-size: var(--cl-font-size-sm); font-weight: normal; letter-spacing: normal; text-transform: none; overflow-wrap: anywhere; }',
    ".cl-popover__content[data-tone='error'] { color: var(--cl-state-destructive); }",
    '',
    /*
     * Numbered steps. The marker is a flex peer of the heading rather than a
     * float or a list marker, so a title that wraps to three lines keeps its
     * number beside its first line instead of drifting into the paragraph.
     */
    '.cl-step-heading { display: flex; align-items: flex-start; gap: var(--cl-space-3); min-width: 0; }',
    '',
    '.cl-step-heading__marker {',
    '  display: grid;',
    '  place-items: center;',
    '  flex: 0 0 auto;',
    '  width: 32px;',
    '  height: 32px;',
    '  background: var(--cl-primary);',
    '  color: var(--cl-primary-text);',
    '  font-family: var(--cl-font-display);',
    '  font-weight: var(--cl-weight-bold);',
    '  font-variant-numeric: tabular-nums;',
    '}',
    '',
    '.cl-step-heading__title { margin: 0; min-width: 0; overflow-wrap: anywhere; }',
    '',
    // Metrics are peers on a row and a stack on a phone, like every other tile grid here.
    '.cl-metric-strip { display: grid; grid-template-columns: 1fr; gap: var(--cl-space-4); min-width: 0; }',
    '.cl-metric-strip > * { min-width: 0; }',
    `@media (min-width: ${BREAKPOINTS.md}) {`,
    '  .cl-metric-strip { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }',
    '}',
    '',
    '.cl-metric-strip__label { display: block; color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; letter-spacing: var(--cl-tracking-wide); overflow-wrap: anywhere; }',
    '',
    /*
     * An unavailable metric is set in the muted role at body size, not in the
     * display face a number gets: the difference is what stops "—" reading as
     * a measured value of zero.
     */
    '.cl-metric-strip__unavailable { color: var(--cl-text-muted); font-family: var(--cl-font-body); font-size: var(--cl-font-size-sm); }',
    '',
    // Fixture numbers exist to demonstrate the layout; the workbench says so.
    '.cl-metric-strip__demonstration { display: block; margin-top: var(--cl-space-1); color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); }',
    '',
    /*
     * The inverse informational card lifts off its band instead of sinking
     * into it — the reference's own reversal, used where a card is the point of
     * the section rather than one of several entries in it.
     */
    '.cl-card--inverse { background: var(--cl-surface-chrome); }',
    ':where(.cl-band, .cl-band--base) .cl-card--inverse { background: var(--cl-surface-chrome); }',
    '.cl-card--inverse .cl-card__title { color: var(--cl-text-primary); }',
    '',
    // The terminal/file code block: every property
    // below was inline on the component before this task, an atom's own
    // styling declared once per instance rather than once here.
    '.cl-terminal-block { background: var(--cl-surface-base); border: 1px solid var(--cl-border-muted); font-family: var(--cl-font-mono); }',
    '.cl-terminal-block__header { display: flex; align-items: center; justify-content: space-between; padding: var(--cl-space-2) var(--cl-space-3); border-bottom: 1px solid var(--cl-border-muted); background: var(--cl-surface-chrome); gap: var(--cl-space-2); }',
    '.cl-terminal-block__dots { display: flex; align-items: center; gap: 6px; }',
    '.cl-terminal-block__dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }',
    '.cl-terminal-block__dot--red { background: var(--cl-state-destructive); }',
    '.cl-terminal-block__dot--yellow { background: var(--cl-state-upcoming); }',
    '.cl-terminal-block__dot--green { background: var(--cl-state-positive); }',
    '.cl-terminal-block__title { font-size: var(--cl-font-size-xs); color: var(--cl-text-secondary); letter-spacing: var(--cl-tracking-wide); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.cl-terminal-block__copy { background: transparent; border: 1px solid var(--cl-border-muted); border-radius: var(--cl-radius-sm); color: var(--cl-text-secondary); font-size: var(--cl-font-size-xs); padding: 2px 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }',
    '.cl-terminal-block__copy--copied { color: var(--cl-state-live); }',
    '.cl-terminal-block__copy--failed { color: var(--cl-state-destructive); }',
    '.cl-terminal-block__body { padding: var(--cl-space-3) var(--cl-space-4); overflow-x: auto; font-size: var(--cl-font-size-sm); line-height: 1.6; }',
    '.cl-terminal-block__command { display: flex; gap: var(--cl-space-2); align-items: baseline; }',
    '.cl-terminal-block__prompt { color: var(--cl-state-live); user-select: none; font-weight: var(--cl-weight-bold); }',
    '.cl-terminal-block__command code { color: var(--cl-text-primary); }',
    // A file listing keeps its columns: which column a YAML key sits in is the
    // one thing wrapping destroys, so long lines scroll inside this region
    // instead of re-flowing. The `--file` variant rule below narrows this to
    // `pre` for that case; the terminal variant (this base rule) wraps.
    '.cl-terminal-block__body pre { font-family: inherit; color: var(--cl-text-primary); white-space: pre-wrap; }',
    '',
    /*
     * The file variant of the code block: a filename header and a copy action,
     * no window dots and no prompt. The terminal variant keeps its own.
     */
    '.cl-terminal-block--file .cl-terminal-block__dots { display: none; }',
    '.cl-terminal-block--file .cl-terminal-block__header { justify-content: space-between; }',
    '.cl-terminal-block--file .cl-terminal-block__title { font-family: var(--cl-font-mono); color: var(--cl-text-primary); }',
    '',
    /*
     * The code body scrolls in its own labelled region. `pre-wrap` would keep
     * the page narrow but destroys the one thing a YAML block has to preserve —
     * which column a key sits in — so long lines scroll instead.
     */
    '.cl-terminal-block--file .cl-terminal-block__body { overflow-x: auto; }',
    '.cl-terminal-block--file .cl-terminal-block__body pre { white-space: pre; margin: 0; }',
    '',
  ];
}
