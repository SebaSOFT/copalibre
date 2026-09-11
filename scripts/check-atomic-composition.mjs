import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildGraph } from './lib/component-graph.mjs';
import { ratchet, unreachableRegisterEntries } from './lib/rule-register.mjs';

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
// Runner
// ---------------------------------------------------------------------------

/**
 * @param {string} webSrcDir
 * @returns {readonly { path: string, line: number, message: string }[]}
 */
export function checkAtomicComposition(webSrcDir) {
  const { nodes, edges } = buildGraph(webSrcDir);

  const r1 = ratchet(
    checkTierMembership(nodes),
    KNOWN_UNDECLARED_TIER,
    'KNOWN_UNDECLARED_TIER',
    'undeclared-tier file(s)',
  );
  const r2 = ratchet(
    checkImportDirection(nodes, edges),
    KNOWN_UPWARD_IMPORTS,
    'KNOWN_UPWARD_IMPORTS',
    'upward import(s)',
  );

  return [...r1, ...r2].sort((a, b) =>
    a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1,
  );
}

/** R12 — every register entry in this script names a path that exists. */
export function checkRegisterEntriesExist(webSrcDir) {
  const exists = (relPath) => {
    try {
      const { nodes } = buildGraph(webSrcDir);
      return nodes.has(relPath);
    } catch {
      return false;
    }
  };
  return [
    ...unreachableRegisterEntries(KNOWN_UNDECLARED_TIER, exists).map((p) => ({
      register: 'KNOWN_UNDECLARED_TIER',
      path: p,
    })),
    ...unreachableRegisterEntries(KNOWN_UPWARD_IMPORTS, exists).map((p) => ({
      register: 'KNOWN_UPWARD_IMPORTS',
      path: p,
    })),
  ];
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
