import { BREAKPOINTS } from '../../primitives.js';
import { DIALOG_TOKENS } from '../../components.js';

export function compositionsBracketPublic(): string[] {
  return [
    /*
     * The bracket stage: columns of rounds inside one bounded scroll region.
     * The region scrolls, never the page body — a public results page that
     * pans sideways loses its own navigation.
     */
    '.cl-bracket-stage { display: grid; gap: var(--cl-space-4); min-width: 0; }',
    '',
    '.cl-bracket-stage__scroll { overflow-x: auto; scrollbar-gutter: stable; max-width: 100%; }',
    // A bracket wider than its panel says so: a hint below it and an edge fade on each side that
    // still has matches out of view. The frame is transparent to layout; the hint shows only while
    // a scroller is marked as overflowing, which only script does, so without it no hint appears.
    '.cl-bracket-stage__frame { display: contents; }',
    '.cl-bracket-stage__hint { display: none; margin: 0; color: var(--cl-text-secondary); font-size: var(--cl-font-size-sm); }',
    '.cl-bracket-stage__frame:has(> .cl-bracket-stage__scroll[data-overflowing]) > .cl-bracket-stage__hint { display: block; }',
    '.cl-bracket-stage__scroll[data-overflow-start][data-overflow-end] { -webkit-mask-image: linear-gradient(to right, transparent, var(--cl-surface-panel) var(--cl-space-8), var(--cl-surface-panel) calc(100% - var(--cl-space-8)), transparent); mask-image: linear-gradient(to right, transparent, var(--cl-surface-panel) var(--cl-space-8), var(--cl-surface-panel) calc(100% - var(--cl-space-8)), transparent); }',
    '.cl-bracket-stage__scroll[data-overflow-end]:not([data-overflow-start]) { -webkit-mask-image: linear-gradient(to right, var(--cl-surface-panel) calc(100% - var(--cl-space-8)), transparent); mask-image: linear-gradient(to right, var(--cl-surface-panel) calc(100% - var(--cl-space-8)), transparent); }',
    '.cl-bracket-stage__scroll[data-overflow-start]:not([data-overflow-end]) { -webkit-mask-image: linear-gradient(to right, transparent, var(--cl-surface-panel) var(--cl-space-8)); mask-image: linear-gradient(to right, transparent, var(--cl-surface-panel) var(--cl-space-8)); }',
    '',
    // One fixed-size box with two layers: the matches placed absolutely, and the links between
    // them as polylines. The scroll region around it carries any width the bracket needs.
    '.cl-bracket-stage__canvas { position: relative; padding-bottom: var(--cl-space-2); }',
    '.cl-bracket-stage__links { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: visible; }',
    // A winner's link is a solid line, a loser's is dashed: the difference never rests on colour.
    '.cl-bracket-link { fill: none; stroke: var(--cl-border-strong); stroke-width: 2; }',
    '.cl-bracket-link--loser { stroke-dasharray: 6 4; }',
    '@media print { .cl-bracket-link { stroke: currentColor; } }',
    '',
    // The round label sits on an accent rule, so a column is identifiable from its head.
    '.cl-bracket-stage__round-label {',
    '  position: absolute;',
    '  box-sizing: border-box;',
    '  margin: 0;',
    '  padding-bottom: var(--cl-space-2);',
    '  border-bottom: 2px solid var(--cl-border-accent);',
    '  color: var(--cl-text-secondary);',
    '  font-family: var(--cl-font-mono);',
    '  font-size: var(--cl-font-size-xs);',
    '  text-transform: uppercase;',
    '  letter-spacing: var(--cl-tracking-wide);',
    '}',
    '',
    // A band's own name, when a zone draws more than one (the main bracket and its placement games).
    '.cl-bracket-stage__band {',
    '  position: absolute;',
    '  left: 0;',
    '  margin: 0;',
    '  color: var(--cl-text-primary);',
    '  font-family: var(--cl-font-display);',
    '  font-size: var(--cl-font-size-md);',
    '  font-weight: var(--cl-weight-bold);',
    '}',
    '',
    '.cl-bracket-stage__node { position: absolute; z-index: 1; min-width: 0; }',
    // What a placement game decides, or "Final", just above its card.
    '.cl-bracket-stage__caption {',
    '  position: absolute;',
    '  bottom: 100%;',
    '  left: 0;',
    '  margin: 0 0 var(--cl-space-1);',
    '  color: var(--cl-text-secondary);',
    '  font-family: var(--cl-font-mono);',
    '  font-size: var(--cl-font-size-xs);',
    '  text-transform: uppercase;',
    '  letter-spacing: var(--cl-tracking-wide);',
    '  white-space: nowrap;',
    '}',
    '',
    '.cl-stage-matchdays, .cl-stage-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); gap: var(--cl-space-3); min-width: 0; }',
    '.cl-match-card--skeleton { display: grid; gap: var(--cl-space-2); padding: var(--cl-space-2); border: 1px solid var(--cl-border-muted); }',
    '.cl-match-card__slot-skeleton, .cl-group-slot-skeleton { min-height: 1.5rem; border-left: 3px solid var(--cl-border-muted); background: var(--cl-surface-raised); }',
    '.cl-bracket-node__title-skeleton { display: inline-block; width: 5rem; height: 0.75rem; background: var(--cl-surface-raised); }',
    '.cl-bracket-slot-skeleton { display: block; width: min(9rem, 70%); height: 0.75rem; background: var(--cl-surface-raised); }',
    '.cl-stage-groups > *, .cl-stage-matchdays > * { min-width: 0; }',
    '.cl-visual-rule-builder { display: grid; gap: var(--cl-space-4); min-width: 0; }',
    '.cl-visual-rule-builder__given { display: grid; gap: var(--cl-space-2); border-left: 3px solid var(--cl-border-accent); padding: var(--cl-space-3); background: var(--cl-surface-panel); }',
    '.cl-visual-rule-builder__logic { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--cl-space-4); min-width: 0; }',
    '.cl-visual-rule-builder__block { display: grid; align-content: start; gap: var(--cl-space-3); min-width: 0; padding: var(--cl-space-3); border: 1px solid var(--cl-border-muted); }',
    '.cl-visual-rule-builder__element { display: flex; align-items: center; justify-content: space-between; gap: var(--cl-space-3); min-width: 0; padding: var(--cl-space-2); border: 1px solid var(--cl-border-muted); }',
    '.cl-visual-rule-builder__block--when { border-left: 3px solid var(--cl-border-accent); }',
    '.cl-visual-rule-builder__block h3 { margin: 0; font-size: var(--cl-font-size-sm); }',
    `@media (width < ${BREAKPOINTS.md}) { .cl-visual-rule-builder__logic { grid-template-columns: minmax(0, 1fr); } }`,
    '',
    // Bare .cl-slot had no rules of its own, so the ordered list's browser
    // default 40px marker indent — far more than the card padding itself —
    // was left to squeeze slot rows down to almost nothing. list-style-position:
    // inside folds the marker back into the content box, and the flex row
    // keeps the entrant name and score on one line instead of wrapping.
    '.cl-bracket-stage__node ol { margin: 0; padding: 0; list-style-position: inside; }',
    '.cl-slot { display: flex; justify-content: space-between; gap: var(--cl-space-2); }',
    '',
    // Per-slot, not per-match: a card with one confirmed entrant and one
    // still-unresolved "winner of" slot marks only the slot that's waiting,
    // matching the control BracketCanvas's own pendingSlotStyle treatment.
    '.cl-slot--pending { border-left: 2px dashed var(--cl-border-muted); padding-left: var(--cl-space-2); }',
    '',
    /*
     * The textual view. Not a degraded copy: it carries seeds, sources and
     * outcomes, and it is what renders below the graph's floor or wherever the
     * graph cannot represent a topology.
     */
    '.cl-bracket-stage__outline { display: none; gap: var(--cl-space-4); margin: 0; padding: 0; }',
    '.cl-bracket-stage__outline-branch { display: grid; gap: var(--cl-space-2); }',
    '.cl-bracket-stage__outline-list { margin: 0; padding-left: var(--cl-space-5); display: grid; gap: var(--cl-space-1); }',
    '.cl-bracket-stage__outline-list li { overflow-wrap: anywhere; }',
    '',
    `@media (max-width: ${BREAKPOINTS.sm}) {`,
    '  .cl-bracket-stage__scroll { display: none; }',
    '  .cl-bracket-stage__outline { display: grid; }',
    '}',
    // Two drawings of one bracket: cards where there is room, abbreviations and scores where there
    // is not. The breakpoint is the one the textual view already uses.
    `@media (width < ${BREAKPOINTS.md}) {`,
    '  .cl-bracket-stage__scroll--full { display: none; }',
    '}',
    `@media (min-width: ${BREAKPOINTS.md}) {`,
    '  .cl-bracket-stage__scroll--compact { display: none; }',
    '}',
    '',
    // A stack of editorial cards, each already framed by the card owner.
    '.cl-editorial-list { display: grid; gap: var(--cl-space-4); margin: 0; padding: 0; min-width: 0; }',
    '',
    /*
     * The public header.
     *
     * A single-height primary row holds the brand, global destinations and
     * persistent actions. Tournament destinations live in a full-width band
     * below it, aligned to the same container. At the compact breakpoint both
     * navigation groups become separate, in-flow disclosures under persistent
     * actions.
     *
     * That is the deliberate difference from the operator surface's modal
     * drawer, which keeps its overlay, its focus trap and its return-focus
     * exactly as they are: a dense task surface wants the page held still
     * behind the menu, and a public results page does not.
     */
    '.cl-public-header { position: sticky; top: 0; z-index: 30; background: color-mix(in srgb, var(--cl-surface-base) 92%, transparent); border-block-end: 1px solid var(--cl-border-muted); backdrop-filter: blur(6px); }',
    '',
    '.cl-public-header__row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--cl-space-4); padding-block: var(--cl-space-3); min-width: 0; }',
    '',
    '.cl-public-header__brand { display: flex; min-width: 0; }',
    '',
    // Locale and Control panel remain visible while the compact menu opens.
    '.cl-public-header__actions { display: flex; flex-wrap: nowrap; align-items: center; justify-content: flex-end; gap: var(--cl-space-2); min-width: 0; }',
    '',
    '.cl-public-header__nav { display: flex; align-items: center; justify-self: stretch; min-width: 0; }',
    '.cl-public-header__global-label { display: none; }',
    '',
    // The closed menu is closed for everyone: `hidden` takes its links out of
    // the tab order, which a `visibility` or an off-screen trick would not.
    // The reset at the top of `components()` is what makes it stick.
    '.cl-public-header__links { display: flex; flex-wrap: wrap; align-items: center; gap: var(--cl-space-4); width: 100%; min-width: 0; margin: 0; padding: 0; list-style: none; }',
    '',
    '.cl-public-header__context-band { background: var(--cl-surface-panel); border-block: 1px solid var(--cl-border-muted); }',
    '.cl-public-header__context-row { padding-block: var(--cl-space-2); }',
    '.cl-public-header__tournament-nav { display: flex; align-items: center; gap: var(--cl-space-4); min-width: 0; }',
    '.cl-public-header__context-label { flex: none; margin: 0; padding-inline-end: var(--cl-space-4); border-inline-end: 1px solid var(--cl-border-muted); color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; letter-spacing: var(--cl-tracking-wide); }',
    '.cl-public-header__tournament-links { display: flex; flex-wrap: wrap; align-items: center; gap: var(--cl-space-4); min-width: 0; margin: 0; padding: 0; list-style: none; }',
    '',
    '.cl-public-header__theme { position: relative; }',
    '.cl-public-header__theme > details > summary { display: inline-flex; align-items: center; gap: var(--cl-space-2); min-height: var(--cl-touch-target); padding-inline: var(--cl-space-2); color: var(--cl-text-secondary); font-family: var(--cl-font-display); font-size: var(--cl-font-size-sm); text-transform: uppercase; letter-spacing: var(--cl-tracking-wide); cursor: pointer; list-style: none; }',
    '.cl-public-header__theme > details > summary::-webkit-details-marker { display: none; }',
    `.cl-public-header__theme-list { position: absolute; inset-inline-start: 0; z-index: 40; display: grid; gap: var(--cl-space-1); min-width: max-content; margin: var(--cl-space-1) 0 0; padding: var(--cl-space-2); list-style: none; background: var(--cl-surface-chrome); border: 1px solid var(--cl-border-muted); box-shadow: ${DIALOG_TOKENS.elevation}; }`,
    '.cl-public-header__theme-list .cl-btn { width: 100%; justify-content: flex-start; }',
    '.cl-public-header__theme-list [aria-pressed="true"] { border-color: var(--cl-border-accent); color: var(--cl-text-accent); }',
    '',
    '.cl-public-header__link { display: inline-flex; align-items: center; min-height: var(--cl-touch-target); color: var(--cl-text-secondary); font-family: var(--cl-font-display); font-size: var(--cl-font-size-sm); text-transform: uppercase; letter-spacing: var(--cl-tracking-wide); text-decoration: none; overflow-wrap: anywhere; }',
    '',
    '.cl-public-header__link:hover, .cl-public-header__link:focus-visible { color: var(--cl-text-primary); }',
    '',
    '.cl-public-header__tournament-link[aria-current="page"] { color: var(--cl-text-primary); text-decoration: underline; text-decoration-color: var(--cl-primary); text-decoration-thickness: 2px; text-underline-offset: var(--cl-space-1); }',
    '',
    '.cl-public-header__toggle { display: none; place-items: center; min-width: var(--cl-touch-target); min-height: var(--cl-touch-target); background: transparent; border: 1px solid var(--cl-border-muted); color: var(--cl-text-primary); cursor: pointer; }',
    '',
    // The icon changes with the state, so the control reads as opened or closed
    // without relying on the reader remembering which way it was.
    '.cl-public-header__toggle .cl-public-header__toggle-open { display: none; }',
    ".cl-public-header__toggle[aria-expanded='true'] .cl-public-header__toggle-open { display: block; }",
    ".cl-public-header__toggle[aria-expanded='true'] .cl-public-header__toggle-closed { display: none; }",
    '',
    // The locale control is a native disclosure, so it opens with no script.
    '.cl-public-header__locale { position: relative; }',
    '.cl-public-header__locale > summary { display: inline-flex; align-items: center; justify-content: center; gap: var(--cl-space-1); min-width: var(--cl-touch-target); min-height: var(--cl-touch-target); padding-inline: var(--cl-space-2); border: 1px solid var(--cl-border-muted); color: var(--cl-text-secondary); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; cursor: pointer; list-style: none; }',
    '.cl-public-header__locale > summary::-webkit-details-marker { display: none; }',
    // The disclosure caret is sized to its label, as the text character it replaced was: at the
    // 188px zoom floor a 16px icon pushed the menu toggle past the viewport edge.
    '.cl-public-header__caret { width: 0.75em; height: 0.75em; }',
    `.cl-public-header__locale-list { position: absolute; inset-inline-end: 0; z-index: 40; min-width: max-content; width: max-content; white-space: nowrap; display: grid; gap: var(--cl-space-1); margin: var(--cl-space-1) 0 0; padding: var(--cl-space-2); list-style: none; background: var(--cl-surface-chrome); border: 1px solid var(--cl-border-muted); box-shadow: ${DIALOG_TOKENS.elevation}; }`,
    '',
    /* Compact menu: persistent brand and actions lead; each navigation layer
     * then gets its own labelled surface in document flow. */
    `@media (max-width: ${BREAKPOINTS.md}) {`,
    '  .cl-public-header__row { grid-template-columns: minmax(0, 1fr); gap: var(--cl-space-2); padding-block: var(--cl-space-2); }',
    '  .cl-public-header__brand { grid-column: 1; grid-row: 1; }',
    '  .cl-public-header__actions { grid-column: 1; grid-row: 2; justify-content: space-between; width: 100%; }',
    '  .cl-public-header__nav { display: grid; grid-column: 1; grid-row: 3; align-items: stretch; gap: var(--cl-space-2); padding-block: var(--cl-space-3); border-block-start: 1px solid var(--cl-border-muted); }',
    '  .cl-public-header__global-label { display: block; margin: 0; color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; letter-spacing: var(--cl-tracking-wide); }',
    '  .cl-public-header__links, .cl-public-header__tournament-links { flex-direction: column; align-items: stretch; gap: var(--cl-space-1); }',
    '  .cl-public-header__link { width: 100%; padding-inline: var(--cl-space-2); }',
    '  .cl-public-header__context-row { padding-block: var(--cl-space-3); }',
    '  .cl-public-header__tournament-nav { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--cl-space-2); }',
    '  .cl-public-header__context-label { padding: 0 0 var(--cl-space-2); border-inline-end: 0; border-block-end: 1px solid var(--cl-border-muted); }',
    '  .cl-public-header__tournament-links { display: grid; grid-template-columns: minmax(0, 1fr); }',
    '  .cl-public-header__tournament-link[aria-current="page"] { border-inline-start: 2px solid var(--cl-primary); }',
    '  .cl-public-header__toggle:not([hidden]) { display: inline-grid; }',
    /* When scripting runs, paint the menu closed from the first frame: the
     * header's script closes it anyway, and closing it after first paint
     * shifts the whole page up. `data-scripting` comes from the classic script
     * that runs before paint; `data-nav-ready` from the header script, after
     * which its own state (the panels' `hidden`) decides. Without scripting the
     * markup stays expanded and every link reachable. `!important` with the
     * higher specificity is needed to outrank the global `[hidden]` rule. */
    '  html[data-scripting] .cl-public-header:not([data-nav-ready]) .cl-public-header__nav, html[data-scripting] .cl-public-header:not([data-nav-ready]) .cl-public-header__context-band { display: none; }',
    '  html[data-scripting] .cl-public-header:not([data-nav-ready]) .cl-public-header__toggle { display: inline-grid !important; }',
    '  html[data-scripting] .cl-public-header:not([data-nav-ready]) .cl-public-header__toggle .cl-public-header__toggle-open { display: none; }',
    '  html[data-scripting] .cl-public-header:not([data-nav-ready]) .cl-public-header__toggle .cl-public-header__toggle-closed { display: block; }',
    '}',
  ];
}
