import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  capabilitiesForRole,
  inheritedFrom,
  inheritsFrom,
  ORGANIZATION_ROLES,
} from '@copalibre/domain';

// Generates each organization role's manual page's capability list from the
// declared mapping (openspec 0165, task 4.1) — the one thing on the page
// that must never be hand-maintained, since it is also what the
// documentation-drift gate (task 4.3, check-role-manual-drift.mjs) checks
// against. `super-admin` sits outside `ORGANIZATION_ROLES`/the capability
// mapping entirely (it is an installation role, not an organization one),
// so its page carries no generated block — its authority is described in
// hand-written prose only, same as it always has been.

const START_MARKER = '<!-- GENERATED:CAPABILITIES:START -->';
const END_MARKER = '<!-- GENERATED:CAPABILITIES:END -->';

/** @param {import('@copalibre/domain').OrganizationRole} role */
export function generatedCapabilityBlock(role) {
  const held = capabilitiesForRole(role);
  const parents = inheritsFrom(role);
  if (held.length === 0) {
    return [
      START_MARKER,
      '',
      'No capabilities are granted to this role today.',
      '',
      END_MARKER,
    ].join('\n');
  }
  const lines = held
    .slice()
    .sort()
    .map((capability) => {
      const from = inheritedFrom(role, capability);
      return from === undefined
        ? `- \`${capability}\``
        : `- \`${capability}\` (inherited from \`${from}\`)`;
    });
  const inheritanceNote =
    parents.length > 0
      ? [
          '',
          `In addition to its own, this role holds every capability \`${parents.join('`, `')}\` holds, ` +
            'by inheritance — a capability added there reaches this role with no second edit here.',
        ]
      : [];
  return [START_MARKER, '', ...lines, ...inheritanceNote, '', END_MARKER].join('\n');
}

/** Replaces the marked generated block in one page's source with a fresh one built from the mapping. */
export function withRegeneratedCapabilities(source, role) {
  const block = generatedCapabilityBlock(role);
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Role manual page for "${role}" is missing the ${START_MARKER}/${END_MARKER} markers`,
    );
  }
  return source.slice(0, start) + block + source.slice(end + END_MARKER.length);
}

/**
 * The capability ids a page's generated block currently lists — parsed back
 * out of the rendered markdown, so the documentation-drift gate (task 4.3)
 * checks the one artifact a reader actually sees, not a second hidden
 * source of truth that could itself drift from the visible page.
 */
export function documentedCapabilities(source) {
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start === -1 || end === -1) return [];
  const block = source.slice(start, end);
  return [...block.matchAll(/^- `([a-z.-]+)`/gm)].map((match) => match[1]);
}

/**
 * A page belongs to exactly one role's manual when its frontmatter names
 * exactly one — the index page under this directory names every role, on
 * purpose, to build its own listing, and is not itself a manual page.
 * @returns {readonly { readonly role: string; readonly path: string }[]}
 */
export function roleManualPages(rolesRoot) {
  if (!existsSync(rolesRoot)) return [];
  return readdirSync(rolesRoot)
    .filter((entry) => entry.endsWith('.md') && entry !== 'index.md')
    .map((entry) => {
      const path = join(rolesRoot, entry);
      const source = readFileSync(path, 'utf8');
      const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(source);
      const frontmatter = frontmatterMatch ? (parseYaml(frontmatterMatch[1]) ?? {}) : {};
      const roles = Array.isArray(frontmatter.roles) ? frontmatter.roles : [];
      return { role: roles.length === 1 ? roles[0] : undefined, path };
    })
    .filter((page) => typeof page.role === 'string');
}

async function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const rolesRoot = join(repoRoot, 'apps/web/src/content/docs/help/roles');
  const check = process.argv.includes('--check');

  let drift = false;
  for (const page of roleManualPages(rolesRoot)) {
    if (!ORGANIZATION_ROLES.includes(page.role)) continue; // super-admin: hand-written, no generated block
    const source = readFileSync(page.path, 'utf8');
    const regenerated = withRegeneratedCapabilities(source, page.role);
    if (regenerated !== source) {
      drift = true;
      if (check) {
        process.stderr.write(`Stale generated capability list: ${page.path}\n`);
      } else {
        writeFileSync(page.path, regenerated);
        process.stdout.write(`Regenerated: ${page.path}\n`);
      }
    }
  }

  if (check && drift) {
    process.stderr.write('Run `node scripts/generate-role-manuals.mjs` and commit the result.\n');
    process.exitCode = 1;
  } else if (!drift) {
    process.stdout.write('Every role manual page already matches the declared mapping.\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
