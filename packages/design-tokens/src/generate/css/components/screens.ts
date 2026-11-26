import { BREAKPOINTS } from '../../../primitives.js';

export function screens(): string[] {
  return [
    '/* Templates own inter-section spacing — no component below this tier sets its own external margin. */',
    '.cl-list-screen, .cl-form-screen, .cl-match-console-screen { display: grid; gap: var(--cl-density-section-gap, var(--cl-space-6)); min-width: 0; }',
    '.cl-form-screen { width: 100%; }',
    // A grid item's default `min-width: auto` sizes it to its content, which
    // silently defeats a descendant's `overflow-x: auto` (a wide table forces
    // every ancestor grid track wider instead of scrolling in place). Every
    // grid track in this template chain gets `min-width: 0` so the narrowest
    // reference width (188px, a 200%-zoom equivalent) scrolls instead of
    // overflowing the page.
    '.cl-list-screen > *, .cl-form-screen > *, .cl-match-console-screen > * { min-width: 0; }',
    '.cl-list-screen__header, .cl-form-screen__header { display: flex; align-items: end; justify-content: space-between; gap: var(--cl-space-4); flex-wrap: wrap; }',
    '.cl-page-header { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--cl-space-2); min-width: 0; }',
    '.cl-page-header__breadcrumb { min-width: 0; color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; overflow-wrap: anywhere; }',
    '.cl-page-header__breadcrumb ol { display: flex; flex-wrap: wrap; align-items: center; gap: var(--cl-space-2); list-style: none; margin: 0; padding: 0; }',
    '.cl-page-header__breadcrumb li + li:not(.cl-crumb)::before { content: "›"; margin-inline-end: var(--cl-space-2); color: var(--cl-text-muted); }',
    '.cl-page-header__breadcrumb a { color: var(--cl-text-secondary); text-decoration: none; }',
    '.cl-page-header__breadcrumb a:hover { color: var(--cl-primary-hover); text-decoration: underline; }',
    '.cl-page-header__row { display: flex; flex-wrap: wrap; align-items: end; gap: var(--cl-space-4); min-width: 0; }',
    '.cl-page-header__content { flex: 1 1 14rem; min-width: 0; }',
    '.cl-page-header__title { margin: 0; }',
    '.cl-page-header__description { margin: var(--cl-space-1) 0 0; color: var(--cl-text-secondary); }',
    '.cl-page-header__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--cl-space-2); min-width: 0; }',
    '.cl-page-header--inline { display: block; }',
    '.cl-page-header--inline .cl-page-header__row { display: block; }',
    '.cl-list-screen__title, .cl-form-screen__title { margin: 0; font-family: var(--cl-font-display); text-transform: uppercase; }',
    '.cl-list-screen__breadcrumb, .cl-form-screen__breadcrumb { color: var(--cl-state-live); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; }',
    '.cl-form-screen__section { display: grid; gap: var(--cl-space-3); }',
    '.cl-form-screen__section-heading { margin: 0; font-family: var(--cl-font-display); text-transform: uppercase; font-size: var(--cl-font-size-lg); }',
    '.cl-form-screen__section-fields { display: grid; gap: var(--cl-space-4); }',
    '.cl-form-screen__footer { position: sticky; bottom: 0; display: flex; justify-content: flex-end; gap: var(--cl-space-2); padding-block: var(--cl-space-3); background: var(--cl-surface-base); }',
    '.cl-list-screen__empty { margin: 0; padding: var(--cl-space-5); color: var(--cl-text-muted); }',
    '',
    '/* The unauthenticated screens: brand header, one centred panel, and the page gutter that keeps it off the viewport edge at every width. */',
    '.cl-auth-screen { display: grid; grid-template-rows: auto 1fr; min-height: 100vh; min-width: 0; max-width: 100%; padding: clamp(24px, 5vw, 64px); font-family: var(--cl-font-body); overflow-wrap: anywhere; }',
    '.cl-auth-screen__header { display: flex; align-items: center; gap: var(--cl-space-3); }',
    '.cl-auth-screen__mark { border: 1px solid var(--cl-state-live); padding: var(--cl-space-1); }',
    '.cl-auth-screen__brand { display: grid; gap: 2px; }',
    '.cl-auth-screen__wordmark { font-family: var(--cl-font-display); font-size: var(--cl-font-size-md); }',
    '.cl-auth-screen__tagline { color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); }',
    // `.cl-auth-screen` is a single-column grid, so `align-self: center` alone
    // only centers the panel vertically (the block axis); without
    // `justify-self: center` (the inline axis) the panel's constrained width
    // left it flush to the grid track's start edge instead of centered.
    '.cl-auth-screen__panel { width: min(100%, 560px); min-width: 0; max-width: 100%; box-sizing: border-box; align-self: center; justify-self: center; margin-block: var(--cl-space-8); display: grid; gap: var(--cl-space-5); padding-block: var(--cl-space-6); }',
    '.cl-auth-screen .cl-btn--primary { font-size: var(--cl-font-size-sm); }',
    '',
    '.cl-match-console-screen__header { display: flex; justify-content: space-between; align-items: start; gap: var(--cl-space-4); flex-wrap: wrap; min-width: 0; }',
    '.cl-match-console-screen__header > * { min-width: 0; }',
    '.cl-match-console-screen__title { margin: var(--cl-space-1) 0 0; font-family: var(--cl-font-display); text-transform: uppercase; overflow-wrap: anywhere; word-break: break-word; }',
    '.cl-match-console-screen__breadcrumb { color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; margin: 0; overflow-wrap: anywhere; word-break: break-word; }',
    '.cl-match-console-screen__status { display: grid; justify-items: end; color: var(--cl-state-live); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-lg); min-width: 0; overflow-wrap: anywhere; }',
    '.cl-match-console-screen__sync-status { display: flex; min-width: 0; }',
    // One dot, and the detail only while the operator asks for it. The detail
    // is absolutely positioned so disclosing it never reflows the controls
    // underneath — a console that shifts under a moving hand loses taps.
    '.cl-sync-indicator { position: relative; display: inline-flex; }',
    '.cl-sync-indicator__icon { display: grid; place-items: center; width: 24px; height: 24px; }',
    '.cl-sync-indicator__dot { width: 10px; height: 10px; border-radius: 50%; background: currentColor; }',
    '.cl-sync-indicator__icon--online { color: var(--cl-state-live); }',
    '.cl-sync-indicator__icon--offline { color: var(--cl-text-muted); }',
    '.cl-sync-indicator__icon--offline .cl-sync-indicator__dot { background: transparent; border: 2px solid currentColor; }',
    '.cl-sync-indicator__detail { position: absolute; top: 100%; left: 0; z-index: 2; display: grid; gap: var(--cl-space-1); white-space: nowrap; border: 1px solid var(--cl-border-muted); background: var(--cl-surface-panel); padding: var(--cl-space-2) var(--cl-space-3); color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; }',
    // Wraps rather than scrolls: on a phone held sideways at the touchline the
    // three clock commands must all stay reachable without a horizontal swipe.
    '.cl-clock-commands { display: flex; flex-wrap: wrap; gap: var(--cl-space-3); }',
    '.cl-match-console-screen__workspace { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: var(--cl-space-5); min-width: 0; }',
    '.cl-match-console-screen__workspace > * { min-width: 0; }',
    `@media (width < ${BREAKPOINTS.md}) { .cl-match-console-screen__workspace { grid-template-columns: 1fr; } }`,
    '.cl-match-console-screen__primary { display: grid; align-content: start; gap: var(--cl-space-5); min-width: 0; }',
    '.cl-match-console-screen__rail { display: grid; align-content: start; gap: var(--cl-space-5); min-width: 0; }',
    '.cl-match-console-screen__scoreboard { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr)); border: 1px solid var(--cl-border-muted); background: var(--cl-surface-panel); min-width: 0; }',
    '.cl-match-console-screen__score-side { display: flex; justify-content: space-between; align-items: center; gap: var(--cl-space-3); padding: var(--cl-space-4); font-family: var(--cl-font-mono); font-variant-numeric: tabular-nums; font-size: var(--cl-font-size-figure-lg); min-width: 0; }',
    '.cl-match-console-screen__score-entrant { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '',
    '/* A row-identity chip (avatar initials + label) reused by any listing showing one person per row. */',
    '.cl-role-user { display: flex; align-items: center; gap: var(--cl-space-3); min-width: 0; flex-wrap: wrap; }',
    '.cl-role-user__avatar { display: grid; place-items: center; width: 32px; height: 32px; flex: 0 0 32px; background: var(--cl-surface-chrome); border: 1px solid var(--cl-border-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); }',
    // An email address has no break opportunity a browser will take by
    // default, so the identity column set a min-content width wider than the
    // 188px reference. `anywhere` rather than `break-word`: the address must
    // break mid-token, since it is one token.
    '.cl-role-user > span { min-width: 0; overflow-wrap: anywhere; }',
    '.cl-role-user__id { display: block; color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); }',
    '.cl-tiebreaker-editor__list { display: grid; gap: var(--cl-space-2); list-style: none; margin: 0; padding: 0; min-width: 0; }',
    '.cl-zone-group__assignment-controls .cl-form-field { width: min(100%, 30rem); }',
    '.cl-zone-group__entrant-assignment { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 12rem); align-items: center; gap: var(--cl-space-3); min-width: 0; }',
    '.cl-zone-group__entrant-assignment > * { min-width: 0; }',
    '.cl-schedule-builder__assignment-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--cl-space-4); align-items: start; min-width: 0; }',
    '.cl-schedule-builder__assignment-row > * { min-width: 0; }',
    '.cl-schedule-builder__slot-pickers { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--cl-space-4); min-width: 0; }',
    '.cl-schedule-builder__slot-pickers > * { min-width: 0; }',
    '.cl-schedule-builder__officials { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: var(--cl-space-3); min-width: 0; }',
    '.cl-schedule-builder__officials > fieldset { flex: 1 1 100%; }',
    '.cl-schedule-builder__stream { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: var(--cl-space-3); min-width: 0; }',
    '.cl-schedule-builder__stream-current { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); }',
    '.cl-schedule-builder__stream-editor { flex: 1 1 100%; display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--cl-space-3); min-width: 0; }',
    '.cl-schedule-builder__stream-editor > .cl-form-field { flex: 0 1 22rem; min-width: 0; }',
    '.cl-schedule-builder__stream-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--cl-space-2); }',
    `@media (width < ${BREAKPOINTS.md}) { .cl-zone-group__entrant-assignment, .cl-schedule-builder__assignment-row { grid-template-columns: minmax(0, 1fr); } }`,
    `@media (width < ${BREAKPOINTS.lg}) { .cl-schedule-builder__slot-pickers { grid-template-columns: minmax(0, 1fr); } }`,
    '.cl-role-status { display: flex; align-items: center; gap: var(--cl-space-2); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; }',
    '.cl-role-status--active { color: var(--cl-state-live); }',
    '.cl-role-status--inactive { color: var(--cl-text-muted); }',
    '',
    // Small tabs above the field, not a Select-with-icon: Select's trigger
    // holds one leading icon for the whole control (select.tsx), not a
    // per-option marker, so it cannot carry a "this language already has
    // text" dot per option without changing what an atom's `icon` prop means.
    // Tabs give every language its own always-visible slot for that dot.
    //
    // Shared by LocalizedInput and LocalizedTextarea (localized-field-tabs.tsx)
    // - one class family, not one copy per field control. The strip sits
    // flush on the field it controls, not floating above it with a gap: the
    // tabs' bottom border is dropped, the row is pulled down 1px onto the
    // field's own top border (`margin-bottom: -1px`), and the field's top
    // corners are squared under the tabs so the two read as one piece, not
    // two stacked boxes.
    '.cl-localized-field { display: grid; min-width: 0; }',
    '.cl-localized-field__tabs { display: flex; gap: var(--cl-space-1); overflow-x: auto; margin-bottom: -1px; }',
    '.cl-localized-field__tab { display: inline-flex; flex: 0 0 auto; align-items: center; gap: var(--cl-space-1); border: 1px solid var(--cl-border-muted); border-bottom: none; border-radius: var(--cl-radius-sm) var(--cl-radius-sm) 0 0; background: var(--cl-surface-chrome); color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); line-height: 1; text-transform: uppercase; white-space: nowrap; padding: var(--cl-space-1); cursor: pointer; }',
    '.cl-localized-field__tab--active { position: relative; z-index: 1; background: var(--cl-surface-panel); border-color: var(--cl-border-accent); color: var(--cl-text-primary); }',
    '.cl-localized-field__tab:disabled { cursor: not-allowed; opacity: 0.6; }',
    // Same green as the badge/terminal-block fill dots (--cl-state-positive):
    // one colour for "this already has a value," everywhere it appears. A
    // fixed small size, like the sync-indicator dot (control.css) - a dot's
    // exact pixel size is a bespoke visual detail, not a spacing decision.
    '.cl-localized-field__dot { width: 4px; height: 4px; border-radius: 50%; background: var(--cl-state-positive); flex: 0 0 auto; }',
    '.cl-localized-field .cl-input, .cl-localized-field .cl-textarea { position: relative; border-top-left-radius: 0; border-top-right-radius: 0; }',
    '',
    // One name for one rule. The dashboard's and the platform screen's own
    // section wrappers were byte-identical: a screen that stacks sections is a
    // screen that stacks sections, whichever screen it is.
    '.cl-screen-sections { display: grid; gap: var(--cl-density-section-gap, var(--cl-space-6)); min-width: 0; }',
    '.cl-screen-sections > * { min-width: 0; }',
    '/* The dashboard activity feed renders through DataTable; these are the cell treatments its rows carry. */',
    '.cl-activity-feed { display: grid; gap: var(--cl-space-3); min-width: 0; }',
    '.cl-activity-feed > h2 { margin: 0; font-family: var(--cl-font-display); text-transform: uppercase; font-size: var(--cl-font-size-lg); }',
    '.cl-activity-feed__action-code, .cl-activity-feed__reason { color: var(--cl-text-muted); font-family: var(--cl-font-mono); }',
    '.cl-activity-feed__reason { font-size: var(--cl-font-size-sm); }',
    // An actor id, an action code and a relative time are single tokens: broken
    // mid-word they stop being readable at all. Kept whole, the table overflows
    // into the scroll its own region already provides.
    '.cl-activity-feed__action-code, .cl-activity-feed__time, .cl-activity-feed .cl-badge { white-space: nowrap; overflow-wrap: normal; }',
    '.cl-platform-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: var(--cl-space-4); align-items: end; }',
    '.cl-platform-update-list { margin: 0; padding: var(--cl-space-4); list-style-position: inside; border: 1px solid var(--cl-state-upcoming); color: var(--cl-text-secondary); }',
    '.cl-platform-modules-header { display: flex; justify-content: space-between; align-items: start; gap: var(--cl-space-4); flex-wrap: wrap; }',
    '/* A badge is a colour *and* a label; the token contract refuses one without. */',
  ];
}

export function authForms(): string[] {
  return [
    '.cl-auth-form { display: grid; gap: var(--cl-space-4); }',
    '',
    /*
     * Summary tiles are a row of peers, not a stack. The compositions folded the
     * dashboard's own `.cl-stat-grid` into `.cl-metric-strip`, which does the
     * same job for any number of tiles rather than for exactly three — two
     * rules laying out one pattern is the duplication this system exists to
     * avoid.
     */
    '',
  ];
}
