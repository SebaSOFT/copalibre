import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { buildGraph } from './lib/component-graph.mjs';
import { ratchet, unreachableRegisterEntries } from './lib/rule-register.mjs';
import {
  GOVERNED_ELEMENTS,
  KNOWN_RAW_ELEMENTS,
  KNOWN_HANDWRITTEN_CLASSES,
} from './check-ui-ownership.mjs';
import { isExempt } from './check-ui-text-catalogue-coverage.mjs';

/**
 * Enforces the atomic-composition tier contract (openspec 0225) over the
 * resolved graph `scripts/lib/component-graph.mjs` builds: tier membership,
 * import direction, styling/data/i18n placement, orphan resolution and
 * naming. A regex over lines cannot decide import direction or orphan
 * status, which is why this script asks structural questions of a graph
 * instead — see design.md Decision 4.
 *
 * Ownership counts *bypasses of an owner* (`check-ui-ownership.mjs`); this
 * script counts *contract violations*. The two keep separate registers so a
 * lowered count in one never hides a regression in the other.
 */

// ---------------------------------------------------------------------------
// R1 — tier membership: every file under a `ui/` directory declares its tier
// by living directly inside one of the four library-tier subdirectories.
// ---------------------------------------------------------------------------

const DECLARED_UI_TIERS = new Set(['atoms', 'molecules', 'organisms', 'layouts']);

/**
 * Components directly inside a `ui/` directory, not in a declared tier
 * subdirectory, with a stated reason each — the R1 register. A non-component
 * support module at the same location (a registry, a story-only data file)
 * is not this rule's concern at all: R1 governs tier membership of
 * components, and `component-graph.mjs`'s `isComponent` already excludes
 * plain data/utility files from the tier system.
 *
 * `AstroPreview.tsx` is the development preview seam (design.md Decision 5:
 * "exempt, dev-only preview seam, recorded with reason"): it renders every
 * library component through the production renderer for review and ships to
 * no surface, so it belongs at the library root rather than in a tier it is
 * not a member of.
 *
 * `story-matrix.tsx` is workbench-only infrastructure (design.md Decision
 * 5's "reference-index: exempt, a registry, not a component" applies to the
 * same directory's story-support files by the same reasoning): it renders
 * story variants side by side for review and ships to no production
 * surface, so it is not a member of the production tier system either.
 */
export const KNOWN_UNDECLARED_TIER = new Map([
  ['components/ui/AstroPreview.tsx', 1],
  ['control/components/ui/story-matrix.tsx', 1],
]);

export function checkTierMembership(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    if (!node.isComponent) continue; // not a component — outside the tier system
    const segments = node.path.split('/');
    const uiIndex = segments.indexOf('ui');
    if (uiIndex === -1) continue; // not a library file at all — not this rule's concern
    const tierSegment = segments[uiIndex + 1];
    if (segments.length > uiIndex + 1 && DECLARED_UI_TIERS.has(tierSegment)) continue;

    violations.push({
      path: node.path,
      line: 1,
      message:
        `${node.path} sits directly inside a ui/ directory without a declared tier ` +
        `(one of ${[...DECLARED_UI_TIERS].join(', ')}). Move it into a tier subdirectory or ` +
        'record it in KNOWN_UNDECLARED_TIER with a stated reason.',
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R2 — import direction: imports point downward only. No library tier may
// import a screen component, and no tier may import a higher-ranked tier.
// ---------------------------------------------------------------------------

/**
 * Ascending rank — a file may import its own rank or lower, never higher.
 * `screen` covers every file outside a `ui/` library directory: today's
 * `*Page.tsx` (screen template role) and `*Route.tsx` (page-controller role)
 * sit in the same flat directory pending the tier rename in task 3.2, so
 * they share one rank until that split exists on disk to check against.
 */
const TIER_RANK = { atoms: 0, molecules: 1, organisms: 2, layouts: 3, screen: 4 };

/**
 * Upward imports recorded as of this change, keyed by the importing file —
 * the R2 register. Empty: the graph has no case of a library tier importing
 * a screen component or a lower tier importing a higher one.
 */
export const KNOWN_UPWARD_IMPORTS = new Map();

export function checkImportDirection(nodes, edges) {
  const violations = [];
  for (const edge of edges) {
    const fromNode = nodes.get(edge.from);
    const toNode = nodes.get(edge.to);
    if (!fromNode || !toNode) continue;
    // A plain data/utility module (a catalogue, a formatting helper, an API
    // client) is not a tier member; importing one is never a direction
    // violation regardless of which tier does the importing.
    if (!toNode.isComponent) continue;
    const fromRank = TIER_RANK[fromNode.tier] ?? TIER_RANK.screen;
    const toRank = TIER_RANK[toNode.tier] ?? TIER_RANK.screen;
    if (toRank <= fromRank) continue;

    violations.push({
      path: edge.from,
      line: edge.line ?? 1,
      message:
        `${edge.from} (tier: ${fromNode.tier}) imports ${edge.to} (tier: ${toNode.tier}), ` +
        'which ranks above it. Imports point downward only — a tier may import its own tier ' +
        'or lower, never a tier above it.',
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R3 — no inline style carries a layout property outside ui/atoms/layout/,
// the directory the layout primitives (task 2.1) land in.
// ---------------------------------------------------------------------------

const LAYOUT_PROPERTIES = new Set([
  'display',
  'flex',
  'flexDirection',
  'flexWrap',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'justifyContent',
  'alignItems',
  'alignContent',
  'alignSelf',
  'placeItems',
  'placeContent',
  'gap',
  'rowGap',
  'columnGap',
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridTemplateAreas',
  'gridColumn',
  'gridRow',
  'gridArea',
  'gridAutoFlow',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginBlock',
  'marginInline',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingBlock',
  'paddingInline',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'float',
  'clear',
  'order',
]);

const LAYOUT_PRIMITIVE_ROOT = 'ui/atoms/layout/';

/** True for a path under either surface's `ui/atoms/layout/` directory. */
function isLayoutPrimitive(path) {
  return path.includes(LAYOUT_PRIMITIVE_ROOT);
}

/**
 * Debt recorded 2026-09-11, the day this gate first ran: every file with an
 * inline `style={{…}}` object carrying at least one layout property, counted
 * per file. Paid down by task 5.1/5.2 as inline layout is replaced by the
 * `Stack`/`Inline`/`Grid`/`Box` primitives task 2.1 adds.
 *
 * Task 5.2 surveyed the two remaining public/broadcast entries above
 * `MatchCard.tsx` and found neither occurrence primitive-convertible, for
 * reasons specific to each: `TvDashboard.tsx`'s three (task 7.1 split two of
 * them out into `TvPerformersView.tsx` and `TvStandingsTable.tsx` alongside
 * the components carrying them) are `vmin`-scaled padding for
 * broadcast-continuous sizing, which the fixed token scale `Box`'s
 * `padding` resolves to cannot express without changing how the overlay
 * actually scales; `AstroPreview.tsx`'s one styles an `<iframe>`, an element
 * a `<div>` primitive cannot become.
 *
 * `MatchCard.tsx`'s count fell from 22 to 1 the other way: not through a
 * primitive, but by giving its merged `ChampionshipMatchCard`/
 * `LiveMatchScorecard` variants (task 4.3) the named CSS classes
 * `MatchCard`'s own `cl-match-card*` family already has — `cl-scorecard__*`
 * existed as classNames with no rule behind them; `cl-championship-card*` is
 * new. Two properties stay deliberately inline: `box-shadow` on
 * `.cl-championship-card`, set only under `isLive` (it reaches the banned
 * `--cl-glow-cyan` resting ornament task 5.4 replaces, so it is left where
 * that task will find it rather than baked into the stylesheet first), and
 * `.cl-scorecard__events`' `margin-bottom`, which depends on whether
 * `comparatorTrace` was passed — genuinely per-render data, not a design
 * constant a class can state.
 *
 * Task 5.7 paid down the three atom-tier entries this register carried
 * (`EntrantName.tsx`, `terminal-block.tsx`, `select.tsx`) to zero: each was a
 * static, per-instance-identical style, so each moved into a named CSS class
 * in `packages/design-tokens/src/generate/css.ts` instead — an atom owns its
 * own styling once, not once per render.
 */
export const KNOWN_INLINE_LAYOUT = new Map([
  ['components/tv/TvDashboard.tsx', 1],
  ['components/tv/TvPerformersView.tsx', 1],
  ['components/tv/ui/organisms/TvStandingsTable.tsx', 1],
  ['components/ui/AstroPreview.tsx', 1],
  ['components/ui/organisms/MatchCard.tsx', 1],
  ['control/components/screens/AnalyticsTemplate.tsx', 5],
  ['control/components/BracketCanvas.tsx', 2],
  ['control/components/ControlApp.tsx', 8],
  ['control/components/DescriptorBuilderWizard.tsx', 12],
  ['control/components/screens/LiveConsoleTemplate.tsx', 4],
  ['control/components/NativeAuthRoutes.tsx', 7],
  ['control/components/screens/PlatformAdministrationTemplate.tsx', 1],
  ['control/components/screens/PreferencesTemplate.tsx', 15],
  ['control/components/ProfileBuilderWizard.tsx', 6],
  ['control/components/screens/RegistrationReviewTemplate.tsx', 3],
  ['control/components/RosterRoleSelector.tsx', 4],
  ['control/components/screens/StandingsTemplate.tsx', 5],
  ['control/components/screens/TournamentSettingsTemplate.tsx', 4],
  ['control/components/TournamentSetupWizard.tsx', 17],
  ['control/components/ui/molecules/callout-banner.tsx', 5],
  ['control/components/ui/molecules/tiebreaker-sequence.tsx', 5],
  ['control/components/ui/organisms/audit-log-panel.tsx', 10],
  ['control/components/ui/organisms/standings-panel.tsx', 1],
  ['control/components/ui/story-matrix.tsx', 2],
]);

export function checkInlineLayout(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    if (isLayoutPrimitive(node.path)) continue;
    for (const style of node.inlineStyles) {
      const hasLayoutProp = style.properties.some((p) => LAYOUT_PROPERTIES.has(p));
      if (!hasLayoutProp) continue;
      violations.push({
        path: node.path,
        line: style.line,
        message: `${node.path}:${style.line}: inline style carries a layout property. Layout belongs to a Stack/Inline/Grid/Box primitive, not an inline object.`,
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R4 — no style value is a raw length or colour outside var().
// ---------------------------------------------------------------------------

const RAW_VALUE = /\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)\b|#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

/** Strips `var(...)` calls (repeatedly, so nested fallbacks are also removed). */
function withoutVarCalls(text) {
  let previous;
  let result = text;
  do {
    previous = result;
    result = result.replace(/var\([^()]*\)/g, '');
  } while (result !== previous);
  return result;
}

/**
 * Debt recorded 2026-09-11: inline style objects with a raw value outside
 * `var()`, per file. `TvDashboard.tsx`'s `vmin` value is deliberate
 * broadcast-continuous scaling, no token expresses it; `AstroPreview.tsx`
 * styles a raw `<iframe>` — neither is this rule's concern to convert.
 *
 * `MatchCard.tsx`'s entry is gone: its 13 raw values (task 5.2) were bespoke
 * pixel choices — `1px 6px` padding, hairline border widths — that don't
 * correspond to any step the token scale declares. Rather than invent a new
 * step or round to the nearest existing one and change the rendered size,
 * they moved into the `cl-championship-card*`/`cl-scorecard*` CSS classes
 * this task's `KNOWN_INLINE_LAYOUT` comment describes: this rule scans
 * inline style objects, the same as R3, so a value a stylesheet states
 * outright is not this rule's concern either way — the design system's own
 * stylesheet is where a bespoke, precisely-tuned value belongs, same as the
 * many raw hairline widths already in `packages/design-tokens/src/generate/css.ts`.
 *
 * `terminal-block.tsx`'s entry is gone the same way (task 5.7): its raw
 * pixel/hex values moved into the `.cl-terminal-block*` CSS classes alongside
 * its `KNOWN_INLINE_LAYOUT` paydown above.
 */
export const KNOWN_RAW_STYLE_VALUES = new Map([
  ['components/tv/TvDashboard.tsx', 1],
  ['components/ui/AstroPreview.tsx', 1],
  ['control/components/screens/AnalyticsTemplate.tsx', 1],
  ['control/components/ControlApp.tsx', 8],
  ['control/components/DescriptorBuilderWizard.tsx', 1],
  ['control/components/NativeAuthRoutes.tsx', 7],
  ['control/components/screens/PreferencesTemplate.tsx', 14],
  ['control/components/ProfileBuilderWizard.tsx', 1],
  ['control/components/RosterRoleSelector.tsx', 1],
  ['control/components/screens/StandingsTemplate.tsx', 1],
  ['control/components/TournamentSetupWizard.tsx', 2],
  ['control/components/ui/molecules/callout-banner.tsx', 2],
  ['control/components/ui/molecules/tiebreaker-sequence.tsx', 2],
  ['control/components/ui/organisms/audit-log-panel.tsx', 5],
]);

export function checkRawStyleValues(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    for (const style of node.inlineStyles) {
      if (!RAW_VALUE.test(withoutVarCalls(style.raw))) continue;
      violations.push({
        path: node.path,
        line: style.line,
        message: `${node.path}:${style.line}: inline style value is a raw length or colour, not a var() reference.`,
      });
    }
  }
  return violations;
}

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
]);

export function checkDataAccess(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    if (!DECLARED_UI_TIERS.has(node.tier)) continue;
    if (node.dataSignals > 0) {
      violations.push({
        path: node.path,
        line: 1,
        message: `${node.path} (tier: ${node.tier}) contains a fetch/RealtimeClient/EventSource call. Data access belongs to the page tier only.`,
      });
    }
    for (const imp of node.imports) {
      if (imp.resolved && /(?:^|\/)(?:public-api-client|api-client)\.ts$/.test(imp.resolved)) {
        violations.push({
          path: node.path,
          line: imp.line,
          message: `${node.path}:${imp.line}: imports an API client (${imp.resolved}). Data access belongs to the page tier only.`,
        });
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R6 — no react-intl formatting call in an atom or molecule.
// ---------------------------------------------------------------------------

/**
 * Debt recorded 2026-09-11: the five public molecules design.md names as
 * calling `react-intl` to format their own labels. Paid down by task 5.3,
 * which moved the formatting to each molecule's consumer:
 * `ResultLegend`/`TournamentHero`/`BroadcastStatusPanel`/`RulesetBriefing`
 * now take pre-formatted strings as props, and `SeriesStateBar` takes a
 * `seriesStateBarLabels(intl, series, …)`-resolved props object — the
 * server-rendered equivalent of `matchCardLabels`'s pattern, but with real
 * resolved values rather than `{placeholder}` templates, since nothing here
 * crosses a `client:load` serialization boundary.
 */
export const KNOWN_I18N_BELOW_ORGANISM = new Map();

export function checkI18nPlacement(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    if (node.tier !== 'atoms' && node.tier !== 'molecules') continue;
    if (node.i18nSignals === 0) continue;
    violations.push({
      path: node.path,
      line: 1,
      message: `${node.path} (tier: ${node.tier}) formats its own message via react-intl. i18n sits at organism and above; an atom or molecule takes rendered strings as props.`,
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R7 — every library component has ≥1 production consumer or a
// reference-index reason.
// ---------------------------------------------------------------------------

/**
 * Debt recorded 2026-09-11: storied library components with no production
 * consumer and no reference-index row. One of the nine orphans the survey
 * found (`LiveMatchScorecard`) already carries a reference-index row with a
 * stated reason and is exempted by the rule itself rather than this
 * register (task 4.4 repoints that row at the `MatchCard` variant that now
 * carries it). `table-toolbar`/`pagination`/`form-screen-template` are
 * adopted (tasks 4.1-4.2).
 *
 * `AstroPreview.tsx`'s entry is gone: task 4.5 recorded it in the reference
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
 * `DisciplineCard.tsx`'s entry is gone: task 4.3 deleted the file outright,
 * along with its public-to-operator `TerminalBlock` import. `ChampionshipMatchCard.tsx`'s
 * entry is gone the same way task 4.1's `table-toolbar.tsx` entry did — task
 * 4.3 merged its implementation into `MatchCard.tsx` (a file with real
 * production consumers), so R7 no longer sees it as a separate,
 * unconsumed file at all; its stories and tests are untouched, only
 * repointed to import from `./MatchCard.js`.
 *
 * `table-toolbar.tsx`'s entry is gone: task 4.1 gave it a real consumer
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
 * `language-selector.tsx`'s entry is gone: task 4.3a deleted the file
 * outright, carrying only its language glyph forward onto `LanguageSwitcher`
 * (via the icon slot task 2.0 adds to `Select`) — nothing else survived, since
 * the raw `<select>`, the inline-styled chrome and the glyph's non-semantic
 * `--cl-state-live` use were exactly the drift this change removes elsewhere.
 *
 * `pagination.tsx` was not adopted in task 4.2, despite design.md naming
 * it: the two screens whose `ListScreenLayout.pagination` slot is filled
 * today don't share its shape. `RegistrationReviewTemplate.tsx` renders a
 * bare `{page} / {pageCount}` status with no forward/back controls at all
 * — adopting the molecule would mean building page-navigation that does
 * not exist yet, a feature addition, not a refactor. `AuditTrailTemplate.tsx`
 * already has forward/back buttons, but shows a translated "{start}–{end}
 * of {total}" status — `Pagination`'s middle slot is fixed as `{page} /
 * {pageCount}`, so adopting it verbatim would replace shipped, catalogued
 * copy with different text in every locale. Left as recorded debt.
 */
export const KNOWN_ORPHANS = new Map([
  ['control/components/ui/molecules/pagination.tsx', 1],
  ['control/components/ui/story-matrix.tsx', 1],
  ['control/components/ui/layouts/form-screen-layout.tsx', 1],
  // The layout primitives (task 2.1) shipped before their consumers adopted
  // them — that is task 5.1's inline-layout paydown. `stack.tsx`/`box.tsx`
  // (AnalyticsPage.tsx) and `inline.tsx` (LiveConsolePage.tsx) gained their
  // first real consumer there and are gone from this register; `grid.tsx`
  // remains a temporary orphan by the migration plan's own ordering, not an
  // oversight.
  ['control/components/ui/atoms/layout/grid.tsx', 1],
  // Form's own entry is gone: task 4.2 gave it eleven real consumers across
  // the five files named in check-ui-ownership.mjs's KNOWN_RAW_ELEMENTS
  // comment. FieldSet's own entry is gone the same way — task 2.5's
  // finalize-winner control gave it one.
  // DataTable.astro and Modal.astro (task 2.3) ship before their consumers
  // adopt them, same as the primitives above. Adopting them is what lets
  // KNOWN_RAW_ELEMENTS' StandingsTable.astro/PlayerProfileView.astro
  // entries in check-ui-ownership.mjs finally be paid down.
  ['components/ui/organisms/DataTable.astro', 1],
  ['components/ui/organisms/Modal.astro', 1],
]);

/**
 * Case- and separator-insensitive: a story title names a component the way
 * Storybook titles do ("Astro preview", a human phrase) while a file
 * basename names it the way the filesystem does ("AstroPreview" or, since
 * task 3.3, "astro-preview" in kebab-case) — never the same string, even
 * when they mean the same component. `checkOrphans` normalizes both sides
 * before comparing rather than requiring the two conventions to coincide.
 */
function normalizeComponentName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The last `/`-segment of a storyId's title, before the ` — scenario` suffix. */
function referenceIndexComponentNames(referenceIndex) {
  const names = new Set();
  for (const entry of referenceIndex) {
    if (entry.consumers.length > 0) continue; // has a real consumer; not what exempts an orphan
    const title = entry.storyId.split(' — ')[0] ?? entry.storyId;
    const segment = title.split('/').pop();
    if (segment) names.add(normalizeComponentName(segment));
  }
  return names;
}

export function checkOrphans(nodes, edges, referenceIndex) {
  const consumedTargets = new Set(edges.filter((e) => e.rendered).map((e) => e.to));
  const exemptNames = referenceIndexComponentNames(referenceIndex);
  const violations = [];

  for (const node of nodes.values()) {
    if (!node.isComponent) continue;
    if (!node.path.split('/').includes('ui')) continue; // library-adjacent files only
    if (consumedTargets.has(node.path)) continue;

    const baseName = node.path
      .split('/')
      .pop()
      .replace(/\.(tsx|astro|ts)$/, '');
    if (exemptNames.has(normalizeComponentName(baseName))) continue;

    violations.push({
      path: node.path,
      line: 1,
      message: `${node.path} has no production consumer and no reference-index row explaining why. Adopt it, delete it, merge it, or record it in reference-index.ts with a reason.`,
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R9 — naming: casing matches the tier directory's rule; no two components
// share a base name.
// ---------------------------------------------------------------------------

/**
 * Debt recorded 2026-09-11: control-library files still in PascalCase.
 * Empty: task 3.3 renamed all ten to kebab-case.
 */
export const KNOWN_CASING_VIOLATIONS = new Map();

/**
 * Debt recorded 2026-09-11: two components sharing a base name. Task 3.4
 * resolved the `TournamentCard` pair by renaming the control screen
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

const KEBAB_CASE = /^[a-z][a-z0-9-]*\.(tsx|ts)$/;
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*\.astro$/;

export function checkCasing(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    const segments = node.path.split('/');
    if (!segments.includes('ui')) continue;
    const fileName = segments[segments.length - 1];
    const isControl = node.path.startsWith('control/');

    if (isControl && !KEBAB_CASE.test(fileName)) {
      violations.push({
        path: node.path,
        line: 1,
        message: `${node.path}: control library files are kebab-case; ${fileName} is not.`,
      });
    } else if (!isControl && node.path.endsWith('.astro') && !PASCAL_CASE.test(fileName)) {
      violations.push({
        path: node.path,
        line: 1,
        message: `${node.path}: public library .astro files are PascalCase; ${fileName} is not.`,
      });
    }
  }
  return violations;
}

/** Route files under `pages/` legitimately repeat a name across route trees (Astro file routing). */
export function checkDuplicateNames(nodes) {
  const byBaseName = new Map();
  for (const node of nodes.values()) {
    if (!node.isComponent) continue;
    if (node.path.startsWith('pages/')) continue;
    const baseName = node.path
      .split('/')
      .pop()
      .replace(/\.(tsx|astro)$/, '');
    if (!byBaseName.has(baseName)) byBaseName.set(baseName, []);
    byBaseName.get(baseName).push(node.path);
  }

  const violations = [];
  for (const [baseName, paths] of byBaseName) {
    if (paths.length < 2) continue;
    for (const path of paths) {
      violations.push({
        path,
        line: 1,
        message: `${path}: base name "${baseName}" is shared with ${paths.filter((p) => p !== path).join(', ')}. No two components may share a base name.`,
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R13 — at most one atom per surface renders a given governed element from
// scratch. Independent of R1/R2's directory-based exemption for the atom
// tier: that exemption legitimizes an atom using the raw element it owns; it
// does not say only one atom may.
// ---------------------------------------------------------------------------

/**
 * Debt recorded 2026-09-11: atom pairs within one surface both rendering a
 * raw `<select>`, `<button>` or `<input>` from scratch. `select` was the pair
 * design.md names explicitly (`language-selector.tsx` and `select.tsx`) —
 * resolved by task 4.3a deleting `language-selector.tsx` outright, which
 * leaves `select.tsx` the surface's only raw-`<select>` owner and pays down
 * its entry too, since one owner is no longer a multi-atom-ownership finding.
 * The `button` and `input` entries are genuine findings this rule surfaces
 * beyond that named case — an atom's own dismiss control, copy affordance or
 * file-picker trigger, each composing the raw element directly rather than
 * the `Button`/`Input` atom — recorded rather than resolved here, since no
 * task in this change disposes of them.
 */
export const KNOWN_MULTI_ATOM_OWNERSHIP = new Map([
  ['control/components/ui/atoms/terminal-block.tsx', 1],
  ['control/components/ui/atoms/alert.tsx', 1],
  ['control/components/ui/atoms/button.tsx', 1],
  ['control/components/ui/atoms/file-picker.tsx', 2], // owns both `button` and `input`
  ['control/components/ui/atoms/input.tsx', 1],
]);

export function checkSingleAtomOwnership(nodes) {
  const bySurfaceElement = new Map();
  for (const node of nodes.values()) {
    if (node.tier !== 'atoms') continue;
    const governedTags = new Set(
      node.nativeElements.map((e) => e.tag).filter((tag) => GOVERNED_ELEMENTS.includes(tag)),
    );
    for (const tag of governedTags) {
      const key = `${node.surface}::${tag}`;
      if (!bySurfaceElement.has(key)) bySurfaceElement.set(key, []);
      bySurfaceElement.get(key).push(node.path);
    }
  }

  const violations = [];
  for (const [key, paths] of bySurfaceElement) {
    if (paths.length < 2) continue;
    const [, tag] = key.split('::');
    for (const path of paths) {
      violations.push({
        path,
        line: 1,
        message: `${path}: renders a raw <${tag}> from scratch, and so does ${paths.filter((p) => p !== path).join(', ')}, within the same surface. At most one atom may own a governed element.`,
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R10 — no rendered text node is a literal; every descriptor resolves in
// all eight catalogues in the source language.
// ---------------------------------------------------------------------------

/**
 * Debt recorded 2026-09-11: literal (non-catalogue) text nodes, per file.
 * Paid down by task 2.6 (the eleven Spanish literals it names) and task
 * 2.7's sibling gate for anything this rule finds beyond that list — several
 * entries here (`TvDashboard.tsx`, `AstroPreview.tsx`, the public organisms
 * and Astro pages) are English or Spanish literals task 2.6 does not name,
 * recorded rather than silently exempted.
 *
 * `MatchCard.tsx`'s one entry (task 5.2) is `LiveMatchScorecard`'s "VAR
 * CONFIRMED" tag — pre-existing, not introduced: this scanner only matches a
 * single-line text node (component-graph.mjs's own documented limitation),
 * and the literal sat on its own line, inside a multi-line `<span style=…>`,
 * until task 5.2's CSS-class extraction collapsed it onto one. No i18n
 * exists anywhere in this component's merged variants to route it through;
 * adding one is out of this styling task's scope.
 */
export const KNOWN_LITERAL_TEXT = new Map([
  ['components/ui/AstroPreview.tsx', 1],
  ['components/ui/organisms/MatchCard.tsx', 1],
  ['components/ui/organisms/PlayerProfileView.astro', 3],
  ['components/ui/organisms/StandingsTable.astro', 9],
  ['control/components/AcceptInvitationForm.tsx', 2],
  ['control/components/ControlShell.tsx', 1],
  ['control/components/screens/RolesPermissionsTemplate.tsx', 1],
  [
    'pages/[...locale]/[organization]/tournaments/[tournament]/stages/[stage]/matches/[match].astro',
    11,
  ],
  ['pages/control/[...path].astro', 1],
  ['pages/control/app.astro', 1],
  ['pages/help/api-reference.astro', 1],
  ['pages/index.astro', 3],
  ['pages/invitations/accept.astro', 1],
]);

export function checkLiteralTextNodes(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    for (const textNode of node.textNodes) {
      if (isExempt(textNode.text)) continue;
      violations.push({
        path: node.path,
        line: textNode.line,
        message: `${node.path}:${textNode.line}: rendered text "${textNode.text.trim().slice(0, 60)}" is a literal, not a catalogue descriptor.`,
      });
    }
  }
  return violations;
}

const MESSAGE_ID_IN_DEFINE = /id:\s*'([^']+)'/g;
// A locale value is double-quoted instead of single-quoted precisely when
// it contains an apostrophe (e.g. French/Italian "l'organisation") — both
// are valid, equally common in these catalogues, and the key itself is
// always single-quoted either way.
const MESSAGE_ID_IN_RECORD = /^\s*'([a-zA-Z][\w.]*)':\s*['"]/gm;

/** Extracts every message id a catalogue file defines, in either its `defineMessages` or plain-Record shape. */
export function extractCatalogueIds(path) {
  const source = readFileSync(path, 'utf8');
  const ids = new Set();
  for (const match of source.matchAll(MESSAGE_ID_IN_DEFINE)) ids.add(match[1]);
  for (const match of source.matchAll(MESSAGE_ID_IN_RECORD)) ids.add(match[1]);
  return ids;
}

/** A catalogue family: a source (English) file and its locale siblings, all in one directory. */
const CATALOGUE_FAMILIES = [
  { dir: 'control/i18n', prefix: 'messages.' },
  { dir: 'lib/i18n', prefix: 'public-messages.' },
];
const CATALOGUE_LOCALES = ['de', 'en', 'es', 'fr', 'it', 'pt', 'ru', 'zh'];

/**
 * Message ids present in the English (source) catalogue and absent from a
 * locale sibling, counted per locale file. Empty: the three entries this
 * register carried when the rule first ran (`messages.fr.ts` "missing" 78,
 * `messages.it.ts` 44, `public-messages.fr.ts` 2) were a false positive in
 * `extractCatalogueIds` itself, not a real gap — MESSAGE_ID_IN_RECORD only
 * recognized a single-quoted value, and French/Italian legitimately
 * double-quote a translation containing an apostrophe ("l'organisation").
 * Every id in every family resolves in all eight catalogues once the
 * extractor accepts either quote style; task 2.6 found and fixed this
 * while adding new ids to these same files.
 */
export const KNOWN_CATALOGUE_GAPS = new Map();

export function checkCatalogueResolution(webSrcDir) {
  const violations = [];
  for (const family of CATALOGUE_FAMILIES) {
    const sourcePath = join(webSrcDir, family.dir, `${family.prefix}en.ts`);
    const sourceIds = extractCatalogueIds(sourcePath);

    for (const locale of CATALOGUE_LOCALES) {
      if (locale === 'en') continue;
      const localeRelPath = `${family.dir}/${family.prefix}${locale}.ts`;
      const localePath = join(webSrcDir, localeRelPath);
      const localeIds = extractCatalogueIds(localePath);

      for (const id of sourceIds) {
        if (localeIds.has(id)) continue;
        violations.push({
          path: localeRelPath,
          line: 1,
          message: `${localeRelPath}: missing message id "${id}", present in ${family.prefix}en.ts. Every descriptor must resolve in all eight catalogues.`,
        });
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R11 — no banned ornament (resting glow, resting shadow, second accent) and
// no recurring treatment declared inline rather than as a named class.
// ---------------------------------------------------------------------------

/**
 * Tokens DESIGN.md's anti-glow/anti-shadow rules ban as a *resting* state
 * cue — a glow or shadow with no corresponding interaction (hover, focus,
 * an active/live state already named elsewhere). Detected as a raw property
 * naming them inline, which is the only way an inline style can apply one at
 * all (a class-based ban is `0224`'s detector's job on generated CSS; this
 * rule is about the inline escape hatch instead).
 */
const BANNED_ORNAMENT_TOKENS = [
  /--cl-glow-\w+/,
  /box-shadow['"]?\s*:\s*['"]?[^,}]*\d+px[^,}]*\d+px/, // a hand-written multi-value shadow, not a token
];

/**
 * Debt recorded 2026-09-11: `tiebreaker-sequence.tsx:86` used `--cl-glow-cyan`
 * as a resting indicator (design.md's one genuine ornament defect the
 * critique found) and the former `ChampionshipMatchCard.tsx:36` carried the
 * identical pattern (`isLive ? 'var(--cl-glow-cyan)' : 'none'`) — a second
 * instance this rule found that the manual critique did not name, carried
 * into `MatchCard.tsx` by task 4.3's merge. Both are gone: task 5.4 replaced
 * the tiebreaker's glow with a doubled border width (the triggered state
 * already reads from background, text colour and a "Triggered" badge; the
 * border was a fourth cue, not the only one) and removed the championship
 * card's glow outright, since its own state was already fully carried by the
 * status pill's background, colour and text.
 */
export const KNOWN_BANNED_ORNAMENT = new Map();

export function checkBannedOrnament(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    for (const style of node.inlineStyles) {
      if (!BANNED_ORNAMENT_TOKENS.some((pattern) => pattern.test(style.raw))) continue;
      violations.push({
        path: node.path,
        line: style.line,
        message: `${node.path}:${style.line}: inline style declares a banned resting ornament (glow/shadow). Use the token that carries the state without it.`,
      });
    }
  }
  return violations;
}

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
 * `check-ui-ownership.mjs`'s two registers (design.md Decision 4: "every
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
