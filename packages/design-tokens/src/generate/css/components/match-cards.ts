export function matchCards(): string[] {
  return [
    // The atom's own base styling: `display: block`
    // so a caller's flex/grid item sizes it normally rather than by its
    // inline default, and `min-width: 0` so the resize-observer truncation
    // this atom does internally can actually shrink below its content's own
    // width — an atom owns all of its own styling, so this is a class, not
    // the inline style object the layout primitives exist to replace.
    '.cl-entrant-name { display: block; min-width: 0; }',
    '.cl-entrant-name--pending { color: var(--entrant-pending-color, var(--cl-text-secondary)); overflow-wrap: anywhere; }',
    '.cl-entrant-name--inline { display: inline-block; max-width: 100%; vertical-align: bottom; }',
    '',
    "/* The matches-view card — shared by MatchCard.tsx on both public-web and control-web, so it lives here rather than in either surface's own page-scoped styles. */",
    '.cl-match-card { display: grid; gap: var(--cl-space-3); min-width: 0; }',
    '.cl-match-card--linked { position: relative; }',
    '.cl-match-card__heading { margin: 0; min-width: 0; font-size: var(--cl-font-size-lg); line-height: var(--cl-line-height-title); overflow-wrap: anywhere; }',
    // The stage-wide match number under the group or round title: secondary, in the mono data-label voice.
    '.cl-match-card__number { display: block; color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); font-weight: var(--cl-weight-regular); line-height: var(--cl-line-height-label); text-transform: uppercase; letter-spacing: var(--cl-tracking-wide); }',
    '.cl-match-card__report-link { color: inherit; text-decoration: none; }',
    '.cl-match-card__report-link:hover, .cl-match-card__report-link:focus-visible { text-decoration: underline; }',
    '.cl-match-card__report-link::after, .cl-match-card__hit-area { position: absolute; inset: 0; z-index: 1; }',
    '.cl-match-card__report-link::after { content: ""; }',
    // The state badge and the clock sit on one line until they cannot: at the
    // 188px reference width a longer translation of the state — `IN DIRETTA`
    // for `LIVE` — plus a running clock exceeds the card, so the pair wraps
    // rather than widening the card past the viewport.
    '.cl-match-card__header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--cl-space-3); min-width: 0; }',
    // The title takes the row's free width and truncates with an ellipsis; the badges beside it never wrap
    // or shrink, so the status and outcome sit on the title row on every card at every width.
    '.cl-match-card__title { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.cl-match-card__header > .cl-match-card__heading { flex: 1 1 0; min-width: 0; }',
    '.cl-match-card__header > .cl-badge { flex: 0 0 auto; white-space: nowrap; }',
    // `overflow-wrap: anywhere`: an ISO datetime has
    // no space to wrap at, so at the 188px reference width the clock alone —
    // not the header row it sits in, which already wraps — held its full
    // unbroken width and pushed the card past the viewport.
    '.cl-match-card__clock { font-family: var(--cl-font-mono); font-size: var(--cl-font-size-figure-lg); line-height: var(--cl-line-height-figure); color: var(--cl-state-live); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
    '.cl-live-clock { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: var(--cl-space-2); font-family: var(--cl-font-mono); font-variant-numeric: tabular-nums; line-height: var(--cl-line-height-figure); max-width: 100%; overflow-wrap: anywhere; }',
    '.cl-live-clock--public { color: var(--cl-state-live); font-size: var(--cl-font-size-figure-lg); }',
    '.cl-live-clock__segment { font-family: var(--cl-font-display); font-size: var(--cl-font-size-xs); font-weight: var(--cl-weight-semibold); text-transform: none; letter-spacing: var(--cl-tracking-wide); color: var(--cl-text-secondary); }',
    '.cl-live-clock__digits { font-variant-numeric: tabular-nums; }',
    '.cl-live-clock__stopped { font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; letter-spacing: var(--cl-tracking-wide); color: var(--cl-state-warning); }',
    '.cl-live-scoreboard { display: grid; gap: var(--cl-space-1); min-width: 0; }',
    '.cl-live-scoreboard__updated { margin: 0; color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); overflow-wrap: anywhere; }',
    '.cl-match-counters { display: grid; gap: var(--cl-space-2); min-width: 0; text-align: start; }',
    '.cl-match-counters__list { display: grid; gap: var(--cl-space-3); margin: 0; padding: 0; list-style: none; }',
    '.cl-match-counter-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: var(--cl-space-2); }',
    '.cl-match-penalties { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: var(--cl-space-2); margin: 0; padding: 0; list-style: none; }',
    '.cl-match-counter-row__label { grid-column: 1 / -1; justify-self: center; color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); letter-spacing: var(--cl-tracking-wide); text-transform: uppercase; text-align: center; }',
    '.cl-match-counter { display: inline-flex; align-items: center; padding: var(--cl-space-1) var(--cl-space-2); border: 1px solid var(--cl-border-muted); color: var(--cl-text-primary); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); font-variant-numeric: tabular-nums; font-weight: var(--cl-weight-semibold); overflow-wrap: anywhere; justify-self: center; }',
    '.cl-match-counter--home { grid-column: 1; justify-self: end; margin-inline-end: var(--cl-space-2); }',
    '.cl-match-counter--away { grid-column: 2; justify-self: start; margin-inline-start: var(--cl-space-2); }',
    '.cl-match-counter--warning { border-color: var(--cl-state-warning); color: var(--cl-state-warning); }',
    '.cl-match-counter__cue { font-weight: var(--cl-weight-semibold); }',
    '.cl-match-penalty { color: var(--cl-state-upcoming); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); font-variant-numeric: tabular-nums; font-weight: var(--cl-weight-semibold); text-align: center; justify-self: center; }',
    '.cl-match-penalty--home { grid-column: 1; justify-self: end; margin-inline-end: var(--cl-space-2); }',
    '.cl-match-penalty--away { grid-column: 2; justify-self: start; margin-inline-start: var(--cl-space-2); }',
    '.cl-tournament-card__live { display: grid; gap: var(--cl-space-1); padding: var(--cl-space-3); background: var(--cl-surface-chrome); border-left: 4px solid var(--cl-state-live); min-width: 0; }',
    '.cl-tournament-card__live-match { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--cl-space-2); margin: 0; color: var(--cl-text-primary); font-family: var(--cl-font-display); font-size: var(--cl-font-size-sm); font-weight: var(--cl-weight-semibold); min-width: 0; overflow-wrap: anywhere; }',
    '.cl-tournament-card__live-score { font-family: var(--cl-font-mono); font-variant-numeric: tabular-nums; color: var(--cl-state-live); white-space: nowrap; }',
    '.cl-tournament-card__live-more { margin: 0; font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); color: var(--cl-text-muted); text-transform: uppercase; letter-spacing: var(--cl-tracking-wide); }',
    // A grid of match cards, promoted out of `MatchCardGrid.astro`'s scoped
    // style so the React surfaces can compose it too. While it lived there,
    // `LiveMatchHero` had no grid to reach and stacked one full-width card per
    // row, wasting most of a 1440px viewport.
    //
    // `min(100%, 280px)` rather than a bare 280px floor: a hard minimum wider
    // than the viewport makes the page itself scroll sideways at the 188px
    // reference width. The local copy had that latent bug and never hit it,
    // because it was only ever rendered inside a page that constrained it.
    '.cl-match-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: var(--cl-space-3); list-style: none; padding: 0; margin: 0; }',
    '.cl-match-card__sides { display: grid; gap: var(--cl-space-2); margin: 0; padding: 0; list-style: none; }',
    '.cl-match-card__side { display: flex; align-items: center; gap: var(--cl-space-2); min-width: 0; }',
    '.cl-match-card__side .cl-badge--rank { font-family: var(--cl-font-mono); font-variant-numeric: tabular-nums; flex: 0 0 auto; }',
    // A descendant selector, not a direct-child one:
    // `EntrantName` hydrates via `client:load`, and Astro wraps a hydrated
    // island in an intervening `<astro-island>` element. `display: contents`
    // keeps that wrapper out of the flex layout, but a DOM combinator still
    // sees it — `>` never matched past it, so the name rendered at its full,
    // unconstrained width and pushed the 188px reference width sideways.
    ".cl-match-card__side span[data-testid='entrant-name'] { flex: 1 1 auto; font-family: var(--cl-font-display); font-weight: var(--cl-weight-medium); font-size: var(--cl-font-size-lg); line-height: var(--cl-line-height-title); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    '.cl-match-card__team-link { position: relative; z-index: 2; flex: 1 1 auto; min-width: var(--cl-touch-target); min-height: var(--cl-touch-target); display: inline-flex; align-items: center; color: inherit; text-decoration: none; border-radius: var(--cl-radius-sm); }',
    '.cl-match-card__team-link:hover { text-decoration: underline; color: var(--cl-text-accent); }',
    '.cl-match-card__team-link:focus-visible { outline: var(--cl-focus-ring); outline-offset: 2px; }',
    ".cl-match-card__team-link span[data-testid='entrant-name'] { flex: 1 1 auto; min-width: 0; }",
    '.cl-match-card__side .cl-stat-tile__value { flex: 0 0 auto; font-size: var(--cl-font-size-figure-2xl); line-height: var(--cl-line-height-figure); background: none; padding: 0; }',
    '.cl-match-card__scope, .cl-match-card__venue, .cl-match-card__event { margin: 0; color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); line-height: var(--cl-line-height-label); text-transform: uppercase; letter-spacing: var(--cl-tracking-wide); }',
    '.cl-match-card__event { color: var(--cl-text-secondary); }',
    '.cl-match-card__series { display: grid; gap: var(--cl-space-1); padding: var(--cl-space-3); background: var(--cl-surface-chrome); border-left: 2px solid var(--cl-state-upcoming); }',
    '.cl-match-card__series .cl-series__score { margin: 0; font-family: var(--cl-font-mono); font-size: var(--cl-font-size-figure-lg); line-height: var(--cl-line-height-figure); }',
    '.cl-match-card__series .cl-series__pending, .cl-match-card__series .cl-series__decided, .cl-match-card__series .cl-series__aggregate { margin: 0; color: var(--cl-text-secondary); font-size: var(--cl-font-size-sm); }',
    '.cl-match-card__trace { position: relative; z-index: 2; border-top: 1px solid var(--cl-border-muted); padding-top: var(--cl-space-2); }',
    '.cl-match-card__trace > summary { cursor: pointer; color: var(--cl-focus-ring); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; }',
    '.cl-match-card__trace-lines { margin: var(--cl-space-2) 0 0; padding-left: var(--cl-space-4); color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); }',
    // `min(100%, 280px)` rather than a bare floor: a hard minimum wider than
    // the viewport makes the page scroll sideways. Flagged when the entity-card
    // grid got the same treatment and left alone because this route was not in
    // the responsive gate's list — which only ever meant nobody was looking.
    // `auto-fill`, matching `.cl-match-card-grid`. With `auto-fit` the empty
    // tracks collapse, so a tournament with one match rendered a single card
    // 1408px wide on the matches view while the same card sat at 343px on the
    // live page — two grids for one kind of card, disagreeing about what a card
    // is. A match card has a size; a row with one of them is a row with a gap.
    '.cl-matches-view__completion { margin-bottom: var(--cl-space-6); }',
    '.cl-matches-view__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: var(--cl-space-4); }',
    '',
    // The compact ticker card — a dense single-line row, not
    // a smaller version of the full card: `.cl-match-card--compact` overrides
    // the base card's grid layout with a flex row, and neither its grid
    // variant selects `.cl-match-card__sides`, `__header`, etc., since the
    // compact branch never renders them.
    '.cl-matches-view__grid--compact { grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: var(--cl-space-2); }',
    '.cl-match-card-grid--compact { grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: var(--cl-space-2); }',
    '.cl-match-card-grid--compact-summary { grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: var(--cl-space-2); }',
    '.cl-match-card--compact { display: inline-flex; align-items: center; gap: var(--cl-space-2); min-height: var(--cl-touch-target); padding: var(--cl-space-1) var(--cl-space-3); font-family: var(--cl-font-display); font-size: var(--cl-font-size-sm); min-width: 0; max-width: 100%; }',
    '.cl-match-card--compact-full-names { display: flex; width: 100%; }',
    '.cl-match-card__compact-dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--cl-border-muted); }',
    // Each `presentState()` class fills the dot with its own semantic token —
    // color is never the sole cue (the visually-hidden label beside it says
    // the same thing), but the dot still has to actually be that color.
    '.cl-match-card__compact-dot.cl-state--live { background: var(--cl-state-live); }',
    '.cl-match-card__compact-dot.cl-state--upcoming { background: var(--cl-state-upcoming); }',
    '.cl-match-card__compact-dot.cl-state--delayed { background: var(--cl-state-warning); }',
    '.cl-match-card__compact-dot.cl-state--positive { background: var(--cl-state-positive); }',
    '.cl-match-card__compact-dot.cl-state--destructive { background: var(--cl-state-destructive); }',
    '.cl-match-card__compact-dot.cl-state--muted { background: var(--cl-border-muted); }',
    '.cl-match-card__compact-dot.cl-state--pending { background: var(--cl-text-muted); }',
    '.cl-match-card__compact-content { display: inline-flex; align-items: center; gap: var(--cl-space-2); min-width: 0; overflow: hidden; white-space: nowrap; font-variant-numeric: tabular-nums; }',
    '.cl-match-card--compact-full-names .cl-match-card__compact-content { display: grid; flex: 1 1 auto; grid-template-columns: minmax(0, 1fr) auto; gap: var(--cl-space-1) var(--cl-space-2); overflow: visible; white-space: normal; }',
    '.cl-match-card__compact-side--home { grid-column: 1; grid-row: 1; }',
    '.cl-match-card__compact-versus { grid-column: 2; grid-row: 1; }',
    '.cl-match-card__compact-side--away { grid-column: 1; grid-row: 2; }',
    '.cl-match-card__compact-time { grid-column: 2; grid-row: 2; white-space: nowrap; }',
    '.cl-match-card__compact-rescheduled { grid-column: 1 / -1; }',
    '.cl-match-card__compact-state { grid-column: 1 / -1; justify-self: start; }',
    '.cl-match-card--compact-full-names .cl-match-card__compact-side > span { overflow: visible; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; }',
    '.cl-match-card__compact-side { display: inline-flex; align-items: center; gap: var(--cl-space-1); min-width: 0; }',
    '.cl-match-card__compact-side > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.cl-match-card__compact-side .cl-entrant-emblem { flex: 0 0 auto; }',
    '',
    // The Broadcaster Studio's live preview: a real `<iframe>`
    // has no intrinsic size, so it renders at the UA default (300×150) with no
    // explicit dimensions — every property here exists to give it one.
    '.cl-broadcaster-studio__preview { display: block; width: 100%; aspect-ratio: 16 / 9; border: 1px solid var(--cl-border-muted); background: var(--cl-surface-chrome); }',
    '',
    // The grand-final spotlight — a MatchCard
    // variant, not MatchCardData's shape: a seed and a per-participant winner
    // flag have no place there. No `box-shadow` here: an `isLive`-only resting
    // glow (`--cl-glow-cyan`) used to mark the live state at the card level
    // (removed under DESIGN.md's anti-glow rule) — redundant ornament
    // even before the ban, since the status pill's own background, colour and
    // "LIVE"/"FINAL" text already carry that fact on their own.
    '.cl-championship-card { background: var(--cl-surface-panel); border: 2px solid var(--cl-state-live); padding: var(--cl-space-4); position: relative; overflow: hidden; }',
    '.cl-championship-card__header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--cl-border-muted); padding-bottom: var(--cl-space-2); margin-bottom: var(--cl-space-3); }',
    '.cl-championship-card__title-group { display: flex; align-items: center; gap: var(--cl-space-2); }',
    '.cl-championship-card__title { font-family: var(--cl-font-display); font-size: var(--cl-font-size-sm); font-weight: var(--cl-weight-bold); text-transform: uppercase; letter-spacing: var(--cl-tracking-wider); color: var(--cl-state-live); }',
    '.cl-championship-card__meta { display: flex; align-items: center; gap: var(--cl-space-2); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); }',
    '.cl-championship-card__time { color: var(--cl-text-muted); }',
    '.cl-championship-card__status { padding: 1px 6px; border-radius: var(--cl-radius-sm); font-weight: var(--cl-weight-bold); background: var(--cl-surface-base); color: var(--cl-text-primary); border: 1px solid var(--cl-border-muted); }',
    '.cl-championship-card__status--live { background: var(--cl-state-live); color: var(--cl-surface-base); border: none; }',
    '.cl-championship-card__participants { display: flex; flex-direction: column; gap: var(--cl-space-2); }',
    '.cl-championship-card__participant { display: flex; align-items: center; justify-content: space-between; padding: var(--cl-space-2) var(--cl-space-3); border-radius: 0 var(--cl-radius-sm) var(--cl-radius-sm) 0; background: var(--cl-surface-base); border-left: 3px solid transparent; }',
    '.cl-championship-card__participant--winner { background: var(--cl-surface-chrome); border-left: 3px solid var(--cl-state-live); }',
    '.cl-championship-card__participant-info { display: flex; align-items: center; gap: var(--cl-space-2); }',
    '.cl-championship-card__seed { font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); color: var(--cl-text-muted); }',
    '.cl-championship-card__name { font-family: var(--cl-font-display); font-size: var(--cl-font-size-base); text-transform: uppercase; font-weight: var(--cl-weight-semibold); color: var(--cl-text-secondary); }',
    '.cl-championship-card__name--winner { font-weight: var(--cl-weight-bold); color: var(--cl-text-primary); }',
    '.cl-championship-card__score { font-family: var(--cl-font-mono); font-size: var(--cl-font-size-figure-lg); font-weight: var(--cl-weight-bold); font-variant-numeric: tabular-nums; color: var(--cl-text-primary); }',
    '.cl-championship-card__score--winner { color: var(--cl-state-live); }',
    '',
    // The tactical live scorebug — the fourth
    // match renderer, merged the same way. `.cl-scorecard__header`,
    // `__matchup`, `__score-box`, `__events` and `__comparator-trace` already
    // existed as classNames on the component with no rule here; every
    // property they need is added now rather than left to inline styles.
    // A team's own colour (`homeTeam.color`/`awayTeam.color`) stays inline:
    // it is caller-supplied data, not a design-time choice this stylesheet
    // can fix a value for.
    '.cl-scorecard { background: var(--cl-surface-panel); border: 1px solid var(--cl-border-muted); padding: var(--cl-space-4); position: relative; overflow: hidden; }',
    '.cl-scorecard__header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--cl-space-2); border-bottom: 1px solid var(--cl-border-muted); padding-bottom: var(--cl-space-2); margin-bottom: var(--cl-space-4); font-family: var(--cl-font-display); font-size: var(--cl-font-size-xs); text-transform: uppercase; letter-spacing: var(--cl-tracking-wider); font-weight: var(--cl-weight-bold); }',
    '.cl-scorecard__location-group, .cl-scorecard__clock-group { display: flex; align-items: center; gap: var(--cl-space-2); }',
    '.cl-scorecard__clock-group { font-family: var(--cl-font-mono); }',
    '.cl-scorecard__dot { color: var(--cl-state-live); font-size: 0.9em; }',
    '.cl-scorecard__location { color: var(--cl-text-primary); }',
    '.cl-scorecard__separator { color: var(--cl-text-muted); }',
    '.cl-scorecard__operations { color: var(--cl-text-secondary); }',
    '.cl-scorecard__clock { color: var(--cl-state-live); font-weight: var(--cl-weight-bold); }',
    '.cl-scorecard__matchup { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--cl-space-4); margin-bottom: var(--cl-space-4); }',
    // `min-width: 0`: a grid item's automatic
    // minimum is its content size by default, which at a narrow width kept
    // this column from shrinking below one team name's longest word —
    // widening the whole matchup grid past the viewport instead, with the
    // ambient page `overflow-x: hidden` clipping the excess rather than
    // reflowing it. `overflow-wrap` on the name lets that word itself break.
    '.cl-scorecard__team { display: flex; align-items: center; gap: var(--cl-space-2); min-width: 0; }',
    '.cl-scorecard__team--home { justify-content: flex-end; text-align: right; }',
    '.cl-scorecard__team--away { justify-content: flex-start; text-align: left; }',
    '.cl-scorecard__team-name { font-family: var(--cl-font-display); font-size: var(--cl-font-size-lg); font-weight: var(--cl-weight-bold); text-transform: uppercase; color: var(--cl-text-primary); overflow-wrap: anywhere; }',
    '.cl-scorecard__team-swatch { font-size: var(--cl-font-size-sm); }',
    // `white-space: nowrap`: without it, a narrow
    // `.cl-scorecard__matchup` grid can compress this `auto` track down to
    // its per-word minimum, wrapping "[ 3 : 1 ]" across three lines instead
    // of shrinking the team-name columns beside it, which already wrap.
    '.cl-scorecard__score-box { background: var(--cl-surface-base); border: 1px solid var(--cl-border-muted); padding: var(--cl-space-2) var(--cl-space-4); border-radius: var(--cl-radius-sm); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-figure-xl); font-weight: var(--cl-weight-bold); color: var(--cl-text-primary); font-variant-numeric: tabular-nums; letter-spacing: var(--cl-tracking-wide); text-align: center; min-width: 90px; white-space: nowrap; }',
    '.cl-scorecard__events { display: flex; flex-wrap: wrap; gap: var(--cl-space-2); padding: var(--cl-space-2) 0; border-top: 1px solid var(--cl-border-muted); }',
    '.cl-scorecard__event { display: inline-flex; align-items: center; gap: var(--cl-space-2); background: var(--cl-surface-chrome); padding: var(--cl-space-1) var(--cl-space-2); border-radius: var(--cl-radius-sm); font-size: var(--cl-font-size-xs); font-family: var(--cl-font-mono); }',
    '.cl-scorecard__event-minute { color: var(--cl-state-live); font-weight: var(--cl-weight-bold); }',
    '.cl-scorecard__event-player { color: var(--cl-text-primary); }',
    '.cl-scorecard__var-tag { background: var(--cl-surface-base); color: var(--cl-color-amber-400); border: 1px solid var(--cl-color-amber-400); padding: 0 4px; border-radius: 2px; font-size: var(--cl-font-size-xs); font-weight: var(--cl-weight-bold); }',
    '.cl-scorecard__comparator-trace { background: var(--cl-surface-chrome); padding: var(--cl-space-2) var(--cl-space-3); margin-top: var(--cl-space-2); display: flex; align-items: center; gap: var(--cl-space-2); font-size: var(--cl-font-size-xs); font-family: var(--cl-font-mono); color: var(--cl-text-secondary); }',
    '.cl-scorecard__comparator-step { color: var(--cl-state-live); font-weight: var(--cl-weight-bold); }',
    '.cl-scorecard__comparator-text { color: var(--cl-text-primary); }',
  ];
}
