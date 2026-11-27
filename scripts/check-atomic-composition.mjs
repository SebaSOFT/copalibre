import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { buildGraph } from './lib/component-graph.mjs';
import { ratchet, unreachableRegisterEntries } from './lib/rule-register.mjs';
import { KNOWN_RAW_ELEMENTS, KNOWN_HANDWRITTEN_CLASSES } from './check-ui-ownership.mjs';
import {
  checkImportDirection,
  checkPageTemplateHierarchy,
  checkTierMembership,
} from './lib/atomic-composition/tiers.mjs';
import {
  checkBannedOrnament,
  checkInlineLayout,
  checkPageWidthLiterals,
  checkRawStyleValues,
} from './lib/atomic-composition/styling.mjs';
import {
  checkCatalogueResolution,
  checkDataAccess,
  checkI18nPlacement,
  checkLiteralTextNodes,
} from './lib/atomic-composition/data-and-text.mjs';
import {
  checkCasing,
  checkDuplicateNames,
  checkOrphans,
  checkSingleAtomOwnership,
} from './lib/atomic-composition/naming.mjs';
export {
  checkImportDirection,
  checkPageTemplateHierarchy,
  checkTierMembership,
} from './lib/atomic-composition/tiers.mjs';
export {
  checkBannedOrnament,
  checkInlineLayout,
  checkPageWidthLiterals,
  checkRawStyleValues,
} from './lib/atomic-composition/styling.mjs';
export {
  checkCatalogueResolution,
  checkDataAccess,
  checkI18nPlacement,
  checkLiteralTextNodes,
  extractCatalogueIds,
} from './lib/atomic-composition/data-and-text.mjs';
export {
  checkCasing,
  checkDuplicateNames,
  checkOrphans,
  checkSingleAtomOwnership,
} from './lib/atomic-composition/naming.mjs';

/**
 * Enforces the atomic-composition tier contract over the
 * resolved graph `scripts/lib/component-graph.mjs` builds: tier membership,
 * import direction, styling/data/i18n placement, orphan resolution and
 * naming. A regex over lines cannot decide import direction or orphan
 * status, which is why this script asks structural questions of a graph
 * instead.
 *
 * Ownership counts *bypasses of an owner* (`check-ui-ownership.mjs`); this
 * script counts *contract violations*. The two keep separate registers so a
 * lowered count in one never hides a regression in the other.
 */

/**
 * Components directly inside a `ui/` directory, not in a declared tier
 * subdirectory, with a stated reason each — the R1 register. A non-component
 * support module at the same location (a registry, a story-only data file)
 * is not this rule's concern at all: R1 governs tier membership of
 * components, and `component-graph.mjs`'s `isComponent` already excludes
 * plain data/utility files from the tier system.
 *
 * `AstroPreview.tsx` is the development preview seam ("exempt, dev-only preview seam, recorded with reason"): it renders every
 * library component through the production renderer for review and ships to
 * no surface, so it belongs at the library root rather than in a tier it is
 * not a member of.
 *
 * `story-matrix.tsx` is workbench-only infrastructure (the reference-index rule "exempt, a registry, not a component" applies to the
 * same directory's story-support files by the same reasoning): it renders
 * story variants side by side for review and ships to no production
 * surface, so it is not a member of the production tier system either.
 */
export const KNOWN_UNDECLARED_TIER = new Map([
  ['components/ui/AstroPreview.tsx', 1],
  ['control/components/ui/story-matrix.tsx', 1],
]);

/**
 * Upward imports recorded as of this change, keyed by the importing file —
 * the R2 register. Empty: the graph has no case of a library tier importing
 * a screen component or a lower tier importing a higher one.
 */
export const KNOWN_UPWARD_IMPORTS = new Map();

/**
 * Debt recorded 2026-09-11, the day this gate first ran: every file with an
 * inline `style={{…}}` object carrying at least one layout property, counted
 * per file. Paid down as inline layout is replaced by the
 * `Stack`/`Inline`/`Grid`/`Box` primitives.
 *
 * The two remaining public/broadcast entries above
 * `MatchCard.tsx` were surveyed and neither occurrence is primitive-convertible, for
 * reasons specific to each: `TvFocalPanel.tsx`'s one (moved from `TvDashboard.tsx`) is `vmin`-scaled padding for
 * broadcast-continuous sizing, which the fixed token scale `Box`'s
 * `padding` resolves to cannot express without changing how the overlay
 * actually scales; `AstroPreview.tsx`'s one styles an `<iframe>`, an element
 * a `<div>` primitive cannot become.
 *
 * `MatchCard.tsx`'s count fell from 22 to 1 the other way: not through a
 * primitive, but by giving its merged `ChampionshipMatchCard`/
 * `LiveMatchScorecard` variants the named CSS classes
 * `MatchCard`'s own `cl-match-card*` family already has — `cl-scorecard__*`
 * existed as classNames with no rule behind them; `cl-championship-card*` is
 * new. Two properties stay deliberately inline: `box-shadow` on
 * `.cl-championship-card`, set only under `isLive` (it reaches the banned
 * `--cl-glow-cyan` resting ornament, so it is left where
 * its replacement will find it rather than baked into the stylesheet first), and
 * `.cl-scorecard__events`' `margin-bottom`, which depends on whether
 * `comparatorTrace` was passed — genuinely per-render data, not a design
 * constant a class can state.
 *
 * The three atom-tier entries this register carried
 * (`EntrantName.tsx`, `terminal-block.tsx`, `select.tsx`) were paid down to zero: each was a
 * static, per-instance-identical style, so each moved into a named CSS class
 * in `packages/design-tokens/src/generate/css.ts` instead — an atom owns its
 * own styling once, not once per render.
 */
export const KNOWN_INLINE_LAYOUT = new Map([
  ['components/tv/TvFocalPanel.tsx', 1],
  ['components/tv/TvPerformersView.tsx', 1],
  ['components/tv/ui/organisms/TvStandingsTable.tsx', 1],
  ['components/ui/AstroPreview.tsx', 1],
  ['components/ui/organisms/MatchCard.tsx', 1],
  ['control/components/BracketCanvas.tsx', 1],
  ['control/components/ControlApp.tsx', 8],
  ['control/components/DescriptorBuilderWizard.tsx', 7],
  // Historical debt from before the rule existed, moved with the lists.
  ['control/components/DescriptorBuilderLists.tsx', 2],
  ['control/components/screens/LiveConsoleTemplate.tsx', 2],
  ['control/components/NativeAuthRoutes.tsx', 7],
  ['control/components/screens/PlatformAdministrationTemplate.tsx', 1],
  ['control/components/ProfileBuilderWizard.tsx', 3],
  ['control/components/screens/RegistrationReviewTemplate.tsx', 3],
  ['control/components/RosterRoleSelector.tsx', 4],
  // Remaining inline layout is the distribution-bar chart pending its own
  // presentation primitive; one tiebreak disclosure's inline layout was removed.
  ['control/components/screens/StandingsTemplate.tsx', 3],
  // Historical debt from before the rule existed, moved with the wizard steps.
  ['control/components/tournament-setup/TournamentSetupFormatSteps.tsx', 5],
  // The GIVEN/WHEN/THEN rule composition was extracted into its own organism.
  ['control/components/tournament-setup/TournamentSetupRulesStep.tsx', 4],
  // A stage is genuinely an ordered list; the layout primitives (Stack/
  // Inline/Grid) only ever render a <div> and cannot become an <ol>, the
  // same class of exception as AstroPreview.tsx's <iframe> above.
  ['control/components/StageListEditor.tsx', 1],
  ['control/components/ui/molecules/callout-banner.tsx', 5],
  ['control/components/ui/molecules/tiebreaker-sequence.tsx', 5],
  ['control/components/ui/organisms/standings-panel.tsx', 1],
  ['control/components/ui/story-matrix.tsx', 2],
  // The step-indicator <ol>/<li>/<span> is the same ordered-list exception
  // StageListEditor.tsx's entry above documents, moved here from the three
  // wizards' own hand-rolled chrome rather than newly added.
  ['control/components/ui/organisms/wizard-shell.tsx', 1],
]);

/**
 * Debt recorded 2026-09-11: inline style objects with a raw value outside
 * `var()`, per file. `TvFocalPanel.tsx`'s `vmin` value is deliberate
 * broadcast-continuous scaling, no token expresses it; `AstroPreview.tsx`
 * styles a raw `<iframe>` — neither is this rule's concern to convert.
 *
 * `MatchCard.tsx`'s entry is gone: its 13 raw values were bespoke
 * pixel choices — `1px 6px` padding, hairline border widths — that don't
 * correspond to any step the token scale declares. Rather than invent a new
 * step or round to the nearest existing one and change the rendered size,
 * they moved into the `cl-championship-card*`/`cl-scorecard*` CSS classes
 * the `KNOWN_INLINE_LAYOUT` comment describes: this rule scans
 * inline style objects, the same as R3, so a value a stylesheet states
 * outright is not this rule's concern either way — the design system's own
 * stylesheet is where a bespoke, precisely-tuned value belongs, same as the
 * many raw hairline widths already in `packages/design-tokens/src/generate/css.ts`.
 *
 * `terminal-block.tsx`'s entry is gone the same way: its raw
 * pixel/hex values moved into the `.cl-terminal-block*` CSS classes alongside
 * its `KNOWN_INLINE_LAYOUT` paydown above.
 */
export const KNOWN_RAW_STYLE_VALUES = new Map([
  ['components/tv/TvFocalPanel.tsx', 1],
  ['components/ui/AstroPreview.tsx', 1],
  ['control/components/ControlApp.tsx', 8],
  ['control/components/NativeAuthRoutes.tsx', 7],
  ['control/components/RosterRoleSelector.tsx', 1],
  ['control/components/screens/StandingsTemplate.tsx', 1],
  ['control/components/tournament-setup/TournamentSetupRulesStep.tsx', 1],
  ['control/components/ui/molecules/callout-banner.tsx', 2],
  ['control/components/ui/molecules/tiebreaker-sequence.tsx', 2],
  // The step-indicator grid's `minmax(8rem, 1fr)`/`minmax(min(100%, 6rem), 1fr)`
  // moved here from the three wizards' own hand-rolled chrome
  // rather than newly added.
  ['control/components/ui/organisms/wizard-shell.tsx', 1],
]);

// ---------------------------------------------------------------------------
// R5 — no API client, fetch, or realtime subscription below the page tier.
// ---------------------------------------------------------------------------

/**
 * Debt recorded 2026-09-11: library-tier files (atoms/molecules/organisms/
 * templates) with a data-access signal — a `fetch`/`RealtimeClient`/
 * `EventSource` call, or an import resolving into `lib/public-api-client.ts`
 * or `control/lib/api-client.ts`. Paid down by moving these organisms and
 * the one molecule below the page tier once their consumers supply data as
 * props instead.
 */
export const KNOWN_DATA_BELOW_PAGE = new Map([
  ['components/ui/organisms/LiveMatchHero.tsx', 1],
  ['components/ui/organisms/StandingsTable.astro', 2],
  ['components/ui/molecules/TournamentHero.astro', 1],
  ['components/ui/organisms/PlayerProfileView.astro', 1],
  // Bracket entrant slots gain a club emblem, the same
  // clubEmblemUrl()-in-the-template pattern StandingsTable.astro already uses above.
  ['components/ui/organisms/MatchNode.astro', 1],
]);

// ---------------------------------------------------------------------------
// R6 — no react-intl formatting call in an atom or molecule.
// ---------------------------------------------------------------------------

/**
 * Debt recorded 2026-09-11: the five public molecules calling
 * `react-intl` to format their own labels. Paid down by
 * moving the formatting to each molecule's consumer:
 * `ResultLegend`/`TournamentHero`/`BroadcastStatusPanel`/`RulesetBriefing`
 * now take pre-formatted strings as props, and `SeriesStateBar` takes a
 * `seriesStateBarLabels(intl, series, …)`-resolved props object — the
 * server-rendered equivalent of `matchCardLabels`'s pattern, but with real
 * resolved values rather than `{placeholder}` templates, since nothing here
 * crosses a `client:load` serialization boundary.
 */
export const KNOWN_I18N_BELOW_ORGANISM = new Map();

// ---------------------------------------------------------------------------
// R7 — every library component has ≥1 production consumer or a
// reference-index reason.
// ---------------------------------------------------------------------------

/**
 * Debt recorded 2026-09-11: storied library components with no production
 * consumer and no reference-index row. One of the nine orphans the survey
 * found (`LiveMatchScorecard`) already carries a reference-index row with a
 * stated reason and is exempted by the rule itself rather than this
 * register (that row now points at the `MatchCard` variant that now
 * carries it). `table-toolbar`/`pagination`/`form-screen-template` are
 * adopted.
 *
 * `AstroPreview.tsx`'s entry is gone: it is recorded in the reference
 * index instead (`Astro preview seam`, `Public/Astro preview —
 * ResultLegend`) — a genuine standing exemption, not debt pending a future
 * adoption task, so it belongs in the permanent mechanism rather than this
 * ratcheted one. `story-matrix.tsx` stays here rather than moving the same
 * way: it is workbench infrastructure imported *by* other components'
 * stories (a `Matrix` scenario composes it), not a component with a
 * dedicated story of its own — the reference-index schema requires a real
 * `storyId` naming one, which nothing declares for it, so this register is
 * the only mechanism that can record its exemption. Both are equally
 * permanent; only one can be expressed the newer way.
 *
 * `DisciplineCard.tsx`'s entry is gone: the file was deleted outright,
 * along with its public-to-operator `TerminalBlock` import. `ChampionshipMatchCard.tsx`'s
 * entry is gone the same way `table-toolbar.tsx`'s entry did — its
 * implementation was merged into `MatchCard.tsx` (a file with real
 * production consumers), so R7 no longer sees it as a separate,
 * unconsumed file at all; its stories and tests are untouched, only
 * repointed to import from `./MatchCard.js`.
 *
 * `table-toolbar.tsx`'s entry is gone: it gained a real consumer
 * (`RegistrationReviewTemplate.tsx`'s filter/actions row). `StandingsTemplate.tsx`
 * was not adopted the same way — its `cl-table-toolbar__filters` usage
 * borrows one BEM child class for an unrelated `role="tablist"` group inside
 * a `cl-platform-form-grid` layout, not the toolbar's title/filters/actions
 * composition, and this scanner already treats a BEM child class as the
 * component's own structure rather than a bypass of it (see
 * `check-ui-ownership.mjs`'s `OWNED_CLASS_RULES` comment). Forcing the real
 * `TableToolbar` there would drop the tablist's `role` (an accessibility
 * regression) or nest an extra flex wrapper inside the grid (a visual
 * change) — either violates this change's own non-goal.
 *
 * `language-selector.tsx`'s entry is gone: the file was deleted
 * outright, carrying only its language glyph forward onto `LanguageSwitcher`
 * (via the icon slot `Select` gained) — nothing else survived, since
 * the raw `<select>`, the inline-styled chrome and the glyph's non-semantic
 * `--cl-state-live` use were exactly the drift this change removes elsewhere.
 */
export const KNOWN_ORPHANS = new Map([
  // `box.tsx` lost its only consumer when the analytics screen moved onto the
  // workspace template; it is kept until a screen needs a padded wrapper again.
  ['control/components/ui/atoms/layout/box.tsx', 1],
  ['control/components/ui/story-matrix.tsx', 1],
  ['control/components/ui/layouts/form-screen-layout.tsx', 1],
  // The layout primitives shipped before their consumers adopted
  // them — that is the inline-layout paydown. `stack.tsx`/`box.tsx`
  // (AnalyticsPage.tsx) and `inline.tsx` (LiveConsolePage.tsx) gained their
  // first real consumer there and are gone from this register; `grid.tsx`
  // gained its own first real consumer in `StageListEditor.tsx` and
  // is gone from this register the same way.
  // Form's own entry is gone: it gained eleven real consumers across
  // the five files named in check-ui-ownership.mjs's KNOWN_RAW_ELEMENTS
  // comment. FieldSet's own entry is gone the same way — the
  // finalize-winner control gave it one.
  // DataTable.astro's and Modal.astro's own entries are gone:
  // both gained a preview-seam consumer (they render in isolation at
  // `/__preview/data-table` and `/__preview/modal`), so they are no longer
  // orphans. Their production adoption — paying down KNOWN_RAW_ELEMENTS'
  // StandingsTable.astro/PlayerProfileView.astro entries in
  // check-ui-ownership.mjs — remains separate, unstarted work.
]);

// ---------------------------------------------------------------------------
// R9 — naming: casing matches the tier directory's rule; no two components
// share a base name.
// ---------------------------------------------------------------------------

/**
 * Debt recorded 2026-09-11: control-library files still in PascalCase.
 * Empty: all ten were renamed to kebab-case.
 */
export const KNOWN_CASING_VIOLATIONS = new Map();

/**
 * Debt recorded 2026-09-11: two components sharing a base name. The
 * `TournamentCard` pair was resolved by renaming the control screen
 * component to `TournamentSummaryCard`, leaving
 * `components/ui/organisms/TournamentCard.astro` the sole owner of that
 * name. The `AstroPreview` pair remains: the dev-only preview seam
 * (`components/ui/AstroPreview.tsx`) and the Astro page that mounts it
 * (`preview/AstroPreview.astro`) are two different components by design,
 * not a naming accident — a page and the component it renders sharing a
 * name is not this rule's concern.
 */
export const KNOWN_DUPLICATE_NAMES = new Map([
  ['components/ui/AstroPreview.tsx', 1],
  ['preview/AstroPreview.astro', 1],
]);

// ---------------------------------------------------------------------------
// R13 — at most one atom per surface renders a given governed element from
// scratch. Independent of R1/R2's directory-based exemption for the atom
// tier: that exemption legitimizes an atom using the raw element it owns; it
// does not say only one atom may.
// ---------------------------------------------------------------------------

/**
 * Debt recorded 2026-09-11: atom pairs within one surface both rendering a
 * raw `<select>`, `<button>` or `<input>` from scratch. `select` was the pair
 * named explicitly (`language-selector.tsx` and `select.tsx`) —
 * resolved by deleting `language-selector.tsx` outright, which
 * leaves `select.tsx` the surface's only raw-`<select>` owner and pays down
 * its entry too, since one owner is no longer a multi-atom-ownership finding.
 * The `button` and `input` entries are genuine findings this rule surfaces
 * beyond that named case — an atom's own dismiss control, copy affordance or
 * file-picker trigger, each composing the raw element directly rather than
 * the `Button`/`Input` atom — recorded rather than resolved here, since nothing in the original scope
 * disposes of them.
 */
export const KNOWN_MULTI_ATOM_OWNERSHIP = new Map([
  ['control/components/ui/atoms/terminal-block.tsx', 1],
  ['control/components/ui/atoms/alert.tsx', 1],
  ['control/components/ui/atoms/button.tsx', 1],
  ['control/components/ui/atoms/file-picker.tsx', 2], // owns both `button` and `input`
  ['control/components/ui/atoms/input.tsx', 1],
  // Left unregistered when this atom was added; its tab
  // strip renders its own <button> per language tab, a shape none of the
  // other governed-element owners share (a tab, not a generic click target).
  ['control/components/ui/atoms/localized-field-tabs.tsx', 1],
  // `ColumnHeaderTooltip` is a table column header's own
  // sort/description trigger — borderless, embedded in a `<th>`, a shape
  // distinct from `Button.astro`'s CTA-styled anchor/button and unusable as
  // one, since public-web's Astro atom cannot be imported into this React
  // component (or vice versa: `Button.astro` cannot render inside a `.tsx`
  // file StandingsTemplate.tsx, which needs the interactivity, actually
  // imports).
  ['components/ui/atoms/Button.astro', 1],
  ['components/ui/atoms/ColumnHeaderTooltip.tsx', 1],
]);

// ---------------------------------------------------------------------------
// R10 — no rendered text node is a literal; every descriptor resolves in
// all eight catalogues in the source language.
// ---------------------------------------------------------------------------

/**
 * Debt recorded 2026-09-11: literal (non-catalogue) text nodes, per file.
 * Paid down for the eleven Spanish literals originally named, with a
 * sibling gate for anything this rule finds beyond that list — several
 * entries here (`TvDashboard.tsx`, `AstroPreview.tsx`, the public organisms
 * and Astro pages) are English or Spanish literals outside that list,
 * recorded rather than silently exempted.
 *
 * `MatchCard.tsx`'s one entry is `LiveMatchScorecard`'s "VAR
 * CONFIRMED" tag — pre-existing, not introduced: this scanner only matches a
 * single-line text node (component-graph.mjs's own documented limitation),
 * and the literal sat on its own line, inside a multi-line `<span style=…>`,
 * until a CSS-class extraction collapsed it onto one. No i18n
 * exists anywhere in this component's merged variants to route it through;
 * adding one is out of that styling scope.
 */
export const KNOWN_LITERAL_TEXT = new Map([
  ['components/ui/AstroPreview.tsx', 1],
  ['components/ui/organisms/MatchCard.tsx', 1],
  // These four carry the match report page's literals (they were split
  // out of `[match].astro`, whose entry is now gone): English text outside the
  // original list, recorded rather than silently exempted, same as the rest
  // of this register.
  ['components/ui/organisms/MatchHero.astro', 1],
  // `MatchOfficials.astro`, `MatchRosters.astro` and `MatchTimeline.astro`'s
  // entries are gone: every literal moved into the message
  // catalogue, and every timestamp now renders through `ResponsiveTimestamp`.
  // `PlayerProfileView.astro`'s entry is gone: its
  // three column headers moved into `DataTable`'s `columns` config as plain
  // JS string literals when the file adopted the owned table, the same way
  // this register's other `DataTable`/`AstroPreview.astro` column configs
  // were never counted here — R10 finds literal text nodes in a template,
  // not string literals in frontmatter.
  // `StandingsTable.astro`'s entry is gone: every counted
  // template-node literal, plus the competition-history modal's
  // script-template-literal strings this register's own comment above says
  // R10 cannot see, now resolve through the message catalogue via a
  // `data-player-dialog-labels` JSON island (the same mechanism
  // `BracketView.astro` already uses for `data-journey-matches`).
  // `AcceptInvitationForm.tsx`'s entry is gone: every literal moved through
  // `useIntl`/`FormattedMessage`, the same fix applied elsewhere.
  ['control/components/ControlShell.tsx', 1],
  ['control/components/screens/RolesPermissionsTemplate.tsx', 1],
  ['pages/control/[...path].astro', 1],
  ['pages/control/app.astro', 1],
  // pages/index.astro's hero and empty orientation hub text are now fully
  // resolved through the message catalogue — zero violations,
  // entry removed per the ratchet rule.
  // pages/invitations/accept.astro's hardcoded "CopaLibre · Aceptar
  // invitación" title is now resolved through the message catalogue —
  // zero violations, entry removed per the ratchet rule.
]);

/**
 * Message ids present in the English (source) catalogue and absent from a
 * locale sibling, counted per locale file. Empty: the three entries this
 * register carried when the rule first ran (`messages.fr.ts` "missing" 78,
 * `messages.it.ts` 44, `public-messages.fr.ts` 2) were a false positive in
 * `extractCatalogueIds` itself, not a real gap — MESSAGE_ID_IN_RECORD only
 * recognized a single-quoted value, and French/Italian legitimately
 * double-quote a translation containing an apostrophe ("l'organisation").
 * Every id in every family resolves in all eight catalogues once the
 * extractor accepts either quote style; this was found and fixed
 * while adding new ids to these same files.
 */
export const KNOWN_CATALOGUE_GAPS = new Map();

/**
 * Debt recorded 2026-09-11: `tiebreaker-sequence.tsx:86` used `--cl-glow-cyan`
 * as a resting indicator (the one genuine ornament defect the
 * critique found) and the former `ChampionshipMatchCard.tsx:36` carried the
 * identical pattern (`isLive ? 'var(--cl-glow-cyan)' : 'none'`) — a second
 * instance this rule found that the manual critique did not name, carried
 * into `MatchCard.tsx` by the merge. Both are gone: the
 * tiebreaker's glow was replaced with a doubled border width (the triggered state
 * already reads from background, text colour and a "Triggered" badge; the
 * border was a fourth cue, not the only one) and the championship
 * card's glow was removed outright, since its own state was already fully carried by the
 * status pill's background, colour and text.
 */
export const KNOWN_BANNED_ORNAMENT = new Map();

// ---------------------------------------------------------------------------
// R14 — page components place their template before any sibling content.
// ---------------------------------------------------------------------------

export const KNOWN_PAGE_TEMPLATE_HIERARCHY = new Map();

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * @param {string} webSrcDir
 * @returns {readonly { path: string, line: number, message: string }[]}
 */
export function checkAtomicComposition(webSrcDir) {
  const { nodes, edges } = buildGraph(webSrcDir);
  const referenceIndexPath = join(webSrcDir, 'control/components/ui/reference-index.ts');
  const referenceIndex = loadReferenceIndex(referenceIndexPath);

  const results = [
    ratchet(
      checkTierMembership(nodes),
      KNOWN_UNDECLARED_TIER,
      'KNOWN_UNDECLARED_TIER',
      'undeclared-tier file(s)',
    ),
    ratchet(
      checkImportDirection(nodes, edges),
      KNOWN_UPWARD_IMPORTS,
      'KNOWN_UPWARD_IMPORTS',
      'upward import(s)',
    ),
    ratchet(
      checkInlineLayout(nodes),
      KNOWN_INLINE_LAYOUT,
      'KNOWN_INLINE_LAYOUT',
      'inline-layout style object(s)',
    ),
    ratchet(
      checkRawStyleValues(nodes),
      KNOWN_RAW_STYLE_VALUES,
      'KNOWN_RAW_STYLE_VALUES',
      'raw style value(s)',
    ),
    ratchet(
      checkDataAccess(nodes),
      KNOWN_DATA_BELOW_PAGE,
      'KNOWN_DATA_BELOW_PAGE',
      'data-access signal(s)',
    ),
    ratchet(
      checkI18nPlacement(nodes),
      KNOWN_I18N_BELOW_ORGANISM,
      'KNOWN_I18N_BELOW_ORGANISM',
      'i18n-below-organism signal(s)',
    ),
    ratchet(
      checkOrphans(nodes, edges, referenceIndex),
      KNOWN_ORPHANS,
      'KNOWN_ORPHANS',
      'orphan(s)',
    ),
    ratchet(
      checkCasing(nodes),
      KNOWN_CASING_VIOLATIONS,
      'KNOWN_CASING_VIOLATIONS',
      'casing violation(s)',
    ),
    ratchet(
      checkDuplicateNames(nodes),
      KNOWN_DUPLICATE_NAMES,
      'KNOWN_DUPLICATE_NAMES',
      'duplicate-name violation(s)',
    ),
    ratchet(
      checkSingleAtomOwnership(nodes),
      KNOWN_MULTI_ATOM_OWNERSHIP,
      'KNOWN_MULTI_ATOM_OWNERSHIP',
      'multi-atom-ownership violation(s)',
    ),
    ratchet(
      checkLiteralTextNodes(nodes),
      KNOWN_LITERAL_TEXT,
      'KNOWN_LITERAL_TEXT',
      'literal text node(s)',
    ),
    ratchet(
      checkCatalogueResolution(webSrcDir),
      KNOWN_CATALOGUE_GAPS,
      'KNOWN_CATALOGUE_GAPS',
      'missing message id(s)',
    ),
    ratchet(
      checkBannedOrnament(nodes),
      KNOWN_BANNED_ORNAMENT,
      'KNOWN_BANNED_ORNAMENT',
      'banned-ornament violation(s)',
    ),
    ratchet(
      checkPageTemplateHierarchy(nodes, webSrcDir),
      KNOWN_PAGE_TEMPLATE_HIERARCHY,
      'KNOWN_PAGE_TEMPLATE_HIERARCHY',
      'leading page sibling(s)',
    ),
    checkPageWidthLiterals(webSrcDir),
  ].flat();

  return results.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1));
}

/**
 * Loads `reference-index.ts`'s `REFERENCE_INDEX` export without a TypeScript
 * build step — a text scan for the two fields R7 needs (`storyId`,
 * `consumers`), in the fixed order the file's own entries use, rather than a
 * full parse of a file that is TS syntax, not JSON.
 */
export function loadReferenceIndex(path) {
  const source = readFileSync(path, 'utf8');
  const entries = [];
  const pattern = /storyId:\s*'([^']*)'[\s\S]*?consumers:\s*(\[[\s\S]*?\])/g;
  for (const match of source.matchAll(pattern)) {
    const [, storyId, consumersLiteral] = match;
    const consumers = [...consumersLiteral.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    entries.push({ storyId, consumers });
  }
  return entries;
}

/**
 * Every register this script ratchets, named for R12's report — plus
 * `check-ui-ownership.mjs`'s two registers ("every
 * register entry in *either* script names a path that exists"). One R12
 * check covers both scripts rather than each carrying its own, so a path
 * that moves is caught wherever it was recorded.
 */
const ALL_REGISTERS = [
  ['KNOWN_RAW_ELEMENTS (check-ui-ownership.mjs)', KNOWN_RAW_ELEMENTS],
  ['KNOWN_HANDWRITTEN_CLASSES (check-ui-ownership.mjs)', KNOWN_HANDWRITTEN_CLASSES],
  ['KNOWN_UNDECLARED_TIER', KNOWN_UNDECLARED_TIER],
  ['KNOWN_UPWARD_IMPORTS', KNOWN_UPWARD_IMPORTS],
  ['KNOWN_INLINE_LAYOUT', KNOWN_INLINE_LAYOUT],
  ['KNOWN_RAW_STYLE_VALUES', KNOWN_RAW_STYLE_VALUES],
  ['KNOWN_DATA_BELOW_PAGE', KNOWN_DATA_BELOW_PAGE],
  ['KNOWN_I18N_BELOW_ORGANISM', KNOWN_I18N_BELOW_ORGANISM],
  ['KNOWN_ORPHANS', KNOWN_ORPHANS],
  ['KNOWN_CASING_VIOLATIONS', KNOWN_CASING_VIOLATIONS],
  ['KNOWN_DUPLICATE_NAMES', KNOWN_DUPLICATE_NAMES],
  ['KNOWN_MULTI_ATOM_OWNERSHIP', KNOWN_MULTI_ATOM_OWNERSHIP],
  ['KNOWN_LITERAL_TEXT', KNOWN_LITERAL_TEXT],
  ['KNOWN_CATALOGUE_GAPS', KNOWN_CATALOGUE_GAPS],
  ['KNOWN_BANNED_ORNAMENT', KNOWN_BANNED_ORNAMENT],
  ['KNOWN_PAGE_TEMPLATE_HIERARCHY', KNOWN_PAGE_TEMPLATE_HIERARCHY],
];

/** R12 — every register entry in this script names a path that exists. */
export function checkRegisterEntriesExist(webSrcDir) {
  const { nodes } = buildGraph(webSrcDir);
  const exists = (relPath) => nodes.has(relPath);

  return ALL_REGISTERS.flatMap(([registerName, register]) =>
    unreachableRegisterEntries(register, exists).map((path) => ({ register: registerName, path })),
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const webSrc = join(fileURLToPath(import.meta.url), '../../apps/web/src');
  const violations = checkAtomicComposition(webSrc);
  const badRegisterEntries = checkRegisterEntriesExist(webSrc);

  if (badRegisterEntries.length > 0) {
    console.error(`\x1b[31m[FAIL]\x1b[0m Register entries naming a path that does not exist:`);
    for (const entry of badRegisterEntries) {
      console.error(`    ${entry.register}: ${entry.path}`);
    }
  }

  if (violations.length > 0) {
    console.error(
      `\x1b[31m[FAIL]\x1b[0m Found ${violations.length} atomic-composition violation(s):`,
    );
    for (const v of violations) {
      console.error(`  ${v.path}:${v.line}: ${v.message}`);
    }
  }

  if (violations.length > 0 || badRegisterEntries.length > 0) process.exit(1);

  console.log('\x1b[32m[PASS]\x1b[0m Every surface satisfies the atomic-composition contract.');
  process.exit(0);
}
