import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { buildGraph } from './lib/component-graph.mjs';
import { ratchet, unreachableRegisterEntries } from './lib/rule-register.mjs';
import { GOVERNED_ELEMENTS } from './check-ui-ownership.mjs';
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

const DECLARED_UI_TIERS = new Set(['atoms', 'molecules', 'organisms', 'templates']);

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
 * sit in the same flat directory pending the tier renames in tasks 3.1-3.2,
 * so they share one rank until that split exists on disk to check against.
 */
const TIER_RANK = { atoms: 0, molecules: 1, organisms: 2, templates: 3, screen: 4 };

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

/**
 * Debt recorded 2026-09-11, the day this gate first ran: every file with an
 * inline `style={{…}}` object carrying at least one layout property, counted
 * per file. Paid down by task 5.1/5.2 as inline layout is replaced by the
 * `Stack`/`Inline`/`Grid`/`Box` primitives task 2.1 adds.
 */
export const KNOWN_INLINE_LAYOUT = new Map([
  ['components/tv/TvDashboard.tsx', 3],
  ['components/ui/AstroPreview.tsx', 1],
  ['components/ui/atoms/EntrantName.tsx', 1],
  ['components/ui/molecules/DisciplineCard.tsx', 9],
  ['components/ui/organisms/ChampionshipMatchCard.tsx', 10],
  ['components/ui/organisms/LiveMatchScorecard.tsx', 12],
  ['control/components/AnalyticsRoute.tsx', 11],
  ['control/components/BracketCanvas.tsx', 2],
  ['control/components/ControlApp.tsx', 8],
  ['control/components/DescriptorBuilderWizard.tsx', 20],
  ['control/components/LiveConsoleRoute.tsx', 10],
  ['control/components/NativeAuthRoutes.tsx', 7],
  ['control/components/PlatformAdministrationRoute.tsx', 1],
  ['control/components/PreferencesRoute.tsx', 17],
  ['control/components/ProfileBuilderWizard.tsx', 6],
  ['control/components/RegistrationReviewPage.tsx', 3],
  ['control/components/RosterRoleSelector.tsx', 4],
  ['control/components/StandingsPage.tsx', 5],
  ['control/components/TournamentSettingsPage.tsx', 4],
  ['control/components/TournamentSetupWizard.tsx', 18],
  ['control/components/ui/atoms/LanguageSelector.tsx', 2],
  ['control/components/ui/atoms/TerminalBlock.tsx', 8],
  ['control/components/ui/atoms/select.tsx', 2],
  ['control/components/ui/molecules/CalloutBanner.tsx', 5],
  ['control/components/ui/molecules/TiebreakerSequence.tsx', 5],
  ['control/components/ui/organisms/AuditLogCard.tsx', 10],
  ['control/components/ui/organisms/StandingsPanel.tsx', 1],
  ['control/components/ui/story-matrix.tsx', 2],
]);

export function checkInlineLayout(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    if (node.path.startsWith(LAYOUT_PRIMITIVE_ROOT)) continue;
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

/** Debt recorded 2026-09-11: inline style objects with a raw value outside `var()`, per file. */
export const KNOWN_RAW_STYLE_VALUES = new Map([
  ['components/tv/TvDashboard.tsx', 1],
  ['components/ui/AstroPreview.tsx', 1],
  ['components/ui/molecules/DisciplineCard.tsx', 5],
  ['components/ui/organisms/ChampionshipMatchCard.tsx', 5],
  ['components/ui/organisms/LiveMatchScorecard.tsx', 8],
  ['control/components/AnalyticsRoute.tsx', 1],
  ['control/components/ControlApp.tsx', 8],
  ['control/components/DescriptorBuilderWizard.tsx', 1],
  ['control/components/NativeAuthRoutes.tsx', 7],
  ['control/components/PreferencesRoute.tsx', 16],
  ['control/components/ProfileBuilderWizard.tsx', 1],
  ['control/components/RosterRoleSelector.tsx', 1],
  ['control/components/StandingsPage.tsx', 1],
  ['control/components/TournamentSetupWizard.tsx', 2],
  ['control/components/ui/atoms/LanguageSelector.tsx', 1],
  ['control/components/ui/atoms/TerminalBlock.tsx', 7],
  ['control/components/ui/molecules/CalloutBanner.tsx', 2],
  ['control/components/ui/molecules/TiebreakerSequence.tsx', 2],
  ['control/components/ui/organisms/AuditLogCard.tsx', 6],
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
  ['components/ui/organisms/StandingsPreview.astro', 2],
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
 * which moves the formatting to each molecule's consumer.
 */
export const KNOWN_I18N_BELOW_ORGANISM = new Map([
  ['components/ui/molecules/BroadcastStatusPanel.astro', 1],
  ['components/ui/molecules/ResultLegend.astro', 1],
  ['components/ui/molecules/RulesetBriefing.astro', 1],
  ['components/ui/molecules/SeriesStateBar.astro', 1],
  ['components/ui/molecules/TournamentHero.astro', 1],
]);

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
 * consumer and no reference-index row. Two of the nine orphans the survey
 * found (`LiveMatchScorecard`, `LanguageSelector`) already carry a
 * reference-index row with a stated reason and are exempted by the rule
 * itself rather than this register. The remaining seven are dispositioned by
 * design.md Decision 5: `table-toolbar`/`pagination`/`form-screen-template`
 * are adopted (tasks 4.1-4.2), `DisciplineCard` is deleted and
 * `ChampionshipMatchCard` merged (task 4.3), and `AstroPreview`/
 * `story-matrix` are recorded in the reference index with a reason (task
 * 4.5) — a dev-only preview seam and workbench-only infrastructure, neither
 * shipping to a production surface.
 */
export const KNOWN_ORPHANS = new Map([
  ['components/ui/AstroPreview.tsx', 1],
  ['components/ui/molecules/DisciplineCard.tsx', 1],
  ['components/ui/organisms/ChampionshipMatchCard.tsx', 1],
  ['control/components/ui/molecules/pagination.tsx', 1],
  ['control/components/ui/molecules/table-toolbar.tsx', 1],
  ['control/components/ui/story-matrix.tsx', 1],
  ['control/components/ui/templates/form-screen-template.tsx', 1],
]);

/** The last `/`-segment of a storyId's title, before the ` — scenario` suffix. */
function referenceIndexComponentNames(referenceIndex) {
  const names = new Set();
  for (const entry of referenceIndex) {
    if (entry.consumers.length > 0) continue; // has a real consumer; not what exempts an orphan
    const title = entry.storyId.split(' — ')[0] ?? entry.storyId;
    const segment = title.split('/').pop();
    if (segment) names.add(segment);
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
    if (exemptNames.has(baseName)) continue;

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
 * Debt recorded 2026-09-11: control-library files still in PascalCase,
 * pending the rename in task 3.3.
 */
export const KNOWN_CASING_VIOLATIONS = new Map([
  ['control/components/ui/atoms/LanguageSelector.tsx', 1],
  ['control/components/ui/atoms/StatTile.tsx', 1],
  ['control/components/ui/atoms/TerminalBlock.tsx', 1],
  ['control/components/ui/molecules/CalloutBanner.tsx', 1],
  ['control/components/ui/molecules/EditorialCard.tsx', 1],
  ['control/components/ui/molecules/MetricStrip.tsx', 1],
  ['control/components/ui/molecules/StepHeading.tsx', 1],
  ['control/components/ui/molecules/TiebreakerSequence.tsx', 1],
  ['control/components/ui/organisms/AuditLogCard.tsx', 1],
  ['control/components/ui/organisms/StandingsPanel.tsx', 1],
]);

/** Debt recorded 2026-09-11: two components sharing a base name, pending task 3.4. */
export const KNOWN_DUPLICATE_NAMES = new Map([
  ['components/ui/organisms/TournamentCard.astro', 1],
  ['control/components/TournamentCard.tsx', 1],
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
 * raw `<select>`, `<button>` or `<input>` from scratch. `select` is the pair
 * design.md names explicitly (`LanguageSelector.tsx` and `select.tsx`,
 * resolved by task 4.3a deleting `LanguageSelector.tsx`). The `button` and
 * `input` entries are genuine findings this rule surfaces beyond that named
 * case — an atom's own dismiss control, copy affordance or file-picker
 * trigger, each composing the raw element directly rather than the `Button`/
 * `Input` atom — recorded rather than resolved here, since no task in this
 * change disposes of them.
 */
export const KNOWN_MULTI_ATOM_OWNERSHIP = new Map([
  ['control/components/ui/atoms/LanguageSelector.tsx', 1],
  ['control/components/ui/atoms/select.tsx', 1],
  ['control/components/ui/atoms/TerminalBlock.tsx', 1],
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
 */
export const KNOWN_LITERAL_TEXT = new Map([
  ['components/tv/TvDashboard.tsx', 4],
  ['components/ui/AstroPreview.tsx', 1],
  ['components/ui/organisms/PlayerProfileView.astro', 3],
  ['components/ui/organisms/StandingsPreview.astro', 9],
  ['control/components/AcceptInvitationForm.tsx', 2],
  ['control/components/AnalyticsRoute.tsx', 1],
  ['control/components/ControlApp.tsx', 7],
  ['control/components/ControlShell.tsx', 1],
  ['control/components/LiveConsoleRoute.tsx', 1],
  ['control/components/NativeAuthRoutes.tsx', 1],
  ['control/components/PreferencesRoute.tsx', 1],
  ['control/components/RolesPermissionsPage.tsx', 1],
  ['control/components/RosterRoleSelector.tsx', 1],
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
const MESSAGE_ID_IN_RECORD = /^\s*'([a-zA-Z][\w.]*)':\s*'/gm;

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
 * Debt recorded 2026-09-11: message ids present in the English (source)
 * catalogue and absent from a locale sibling, counted per locale file. Two
 * families predate this change entirely (`messages.fr.ts` missing 78 of 923,
 * `messages.it.ts` missing 44, `public-messages.fr.ts` missing 2 of 140) —
 * this rule did not create the gap, it is the first thing to count it.
 */
export const KNOWN_CATALOGUE_GAPS = new Map([
  ['control/i18n/messages.fr.ts', 78],
  ['control/i18n/messages.it.ts', 44],
  ['lib/i18n/public-messages.fr.ts', 2],
]);

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
 * Debt recorded 2026-09-11: `TiebreakerSequence.tsx:86` uses `--cl-glow-cyan`
 * as a resting indicator (design.md's one genuine ornament defect the
 * critique found — task 5.4 replaces it with a token that carries the state
 * without the glow). `ChampionshipMatchCard.tsx:36` carries the identical
 * pattern (`isLive ? 'var(--cl-glow-cyan)' : 'none'`) — a second instance
 * this rule finds that the manual critique did not name; task 4.3 merges
 * this component away entirely, which resolves it without a separate edit.
 */
export const KNOWN_BANNED_ORNAMENT = new Map([
  ['control/components/ui/molecules/TiebreakerSequence.tsx', 1],
  ['components/ui/organisms/ChampionshipMatchCard.tsx', 1],
]);

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

/** Every register this script ratchets, named for R12's report. */
const ALL_REGISTERS = [
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
