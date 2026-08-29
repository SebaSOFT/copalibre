import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

// Enforces platform/help-and-api-docs's coverage guarantee (openspec 0162):
// every operator-facing capability accepted into the specification baseline
// must be claimed by at least one help page, and every organization or
// installation role must be named by at least one page. The gate compares
// specifications to claims, not filenames to routes — a filename check
// would pass a screenless capability like match-series with no page written
// for it, which is the exact failure this exists to catch. Mirrors
// check-help-locale-parity.mjs's shape: pure, testable functions plus a
// thin main() doing the file I/O.

/**
 * Vocabulary a scenario is judged "operator-facing" by, per design.md:
 * "a capability is operator-facing when its requirements describe something
 * a person does". Deliberately generous — the design's own trade-off is
 * that a false positive costs a page nobody strictly needed, a false
 * negative costs the gap this gate exists to close.
 */
export const PERSON_SUBJECT_WORDS = [
  'organizer',
  'operator',
  'referee',
  'broadcaster',
  'viewer',
  'administrator',
  'admin',
  'club-admin',
  'super-admin',
  'spectator',
  'participant',
  'entrant',
  'user',
  'person',
  'official',
  'visitor',
];

const PERSON_SUBJECT_PATTERN = new RegExp(
  `\\b(${PERSON_SUBJECT_WORDS.map((word) => word.replace('-', '[-\\s]')).join('|')})\\b`,
  'i',
);

/**
 * Every `#### Scenario:` block's own WHEN/THEN/AND bullet lines (plus their
 * wrapped continuation lines), stopping at the first blank line — never
 * bleeding into the next requirement's prose, which a heading-to-heading
 * slice would when a scenario is followed by unrelated narrative text
 * rather than immediately by another scenario.
 */
export function scenarioBlocks(specText) {
  const lines = specText.split('\n');
  const blocks = [];
  let current;
  for (const line of lines) {
    if (/^#### Scenario:/.test(line)) {
      current = [];
      blocks.push(current);
      continue;
    }
    if (current === undefined) continue;
    // A blank line before any bullet is just heading/body spacing; a blank
    // line once bullets have started ends the scenario.
    if (line.trim() === '') {
      if (current.length > 0) current = undefined;
      continue;
    }
    current.push(line);
  }
  return blocks.map((block) => block.join('\n'));
}

/** Whether any scenario in this spec's text names a person as its subject. */
export function isOperatorFacing(specText) {
  return scenarioBlocks(specText).some((block) => PERSON_SUBJECT_PATTERN.test(block));
}

/** @returns {readonly { id: string; path: string; text: string }[]} `id` is `<domain>/<capability>`. */
export function listCapabilities(specsRoot) {
  if (!existsSync(specsRoot)) return [];
  return readdirSync(specsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((domainEntry) => {
      const domainPath = join(specsRoot, domainEntry.name);
      return readdirSync(domainPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((capabilityEntry) => {
          const path = join(domainPath, capabilityEntry.name, 'spec.md');
          return {
            id: `${domainEntry.name}/${capabilityEntry.name}`,
            path,
            text: existsSync(path) ? readFileSync(path, 'utf8') : '',
          };
        });
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Capability ids whose specification describes something a person does. */
export function operatorFacingCapabilityIds(capabilities) {
  return capabilities.filter((capability) => isOperatorFacing(capability.text)).map((c) => c.id);
}

/** @returns {{ capabilities: readonly string[]; roles: readonly string[] } | undefined} `undefined` when the page declares neither. */
export function parseHelpFrontmatter(markdownSource) {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdownSource);
  if (!match) return undefined;
  const parsed = parseYaml(match[1]) ?? {};
  const capabilities = Array.isArray(parsed.capabilities) ? parsed.capabilities : [];
  const roles = Array.isArray(parsed.roles) ? parsed.roles : [];
  if (capabilities.length === 0 && roles.length === 0) return undefined;
  return { capabilities, roles };
}

/** @param {readonly { capabilities: readonly string[] }[]} pages */
export function claimedCapabilityIds(pages) {
  return new Set(pages.flatMap((page) => page.capabilities));
}

/** Operator-facing capability ids no page's frontmatter claims. */
export function uncoveredCapabilities(operatorFacingIds, claimedIds) {
  return operatorFacingIds.filter((id) => !claimedIds.has(id)).sort();
}

/** @param {readonly { roles: readonly string[] }[]} pages */
export function uncoveredRoles(pages, allRoles) {
  const named = new Set(pages.flatMap((page) => page.roles));
  return allRoles.filter((role) => !named.has(role));
}

function listMarkdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true })
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => join(directory, entry))
    .sort();
}

async function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const specsRoot = join(repoRoot, 'openspec/specs');
  const helpRoot = join(repoRoot, 'apps/web/src/content/docs/help');

  const capabilities = listCapabilities(specsRoot);
  const operatorFacingIds = operatorFacingCapabilityIds(capabilities);

  const pages = listMarkdownFiles(helpRoot)
    .map((path) => ({ path, frontmatter: parseHelpFrontmatter(readFileSync(path, 'utf8')) }))
    .filter((page) => page.frontmatter !== undefined)
    .map((page) => ({ path: page.path, ...page.frontmatter }));

  const undeclared = listMarkdownFiles(helpRoot).filter(
    (path) => parseHelpFrontmatter(readFileSync(path, 'utf8')) === undefined,
  );
  if (undeclared.length > 0) {
    process.stderr.write(
      `${undeclared.length} help page(s) declare neither capabilities nor roles:\n` +
        undeclared.map((path) => `  - ${relative(repoRoot, path)}\n`).join(''),
    );
    process.exitCode = 1;
    return;
  }

  const claimed = claimedCapabilityIds(pages);
  const uncoveredCaps = uncoveredCapabilities(operatorFacingIds, claimed);
  const ORGANIZATION_ROLES = ['admin', 'club-admin', 'referee', 'broadcaster', 'viewer'];
  const INSTALLATION_ROLES = ['super-admin'];
  const uncoveredR = uncoveredRoles(pages, [...ORGANIZATION_ROLES, ...INSTALLATION_ROLES]);

  let failed = false;

  if (uncoveredCaps.length > 0) {
    failed = true;
    process.stderr.write(
      `${uncoveredCaps.length} operator-facing capability/ies have no claiming help page — write a page (or add this capability to an existing one's frontmatter) for:\n` +
        uncoveredCaps.map((id) => `  - ${id} (openspec/specs/${id}/spec.md)\n`).join(''),
    );
  }

  if (uncoveredR.length > 0) {
    failed = true;
    process.stderr.write(
      `${uncoveredR.length} role(s) are named by no help page's frontmatter:\n` +
        uncoveredR.map((role) => `  - ${role}\n`).join(''),
    );
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Help coverage OK: ${operatorFacingIds.length} operator-facing capabilities claimed, ` +
      `${ORGANIZATION_ROLES.length + INSTALLATION_ROLES.length} roles named across ${pages.length} pages.\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
