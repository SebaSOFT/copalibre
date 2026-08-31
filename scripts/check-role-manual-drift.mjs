import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capabilitiesForRole, ORGANIZATION_ROLES } from '@copalibre/domain';
import { documentedCapabilities, roleManualPages } from './generate-role-manuals.mjs';

// Enforces platform/help-and-api-docs's "documented authority is gated
// against enforced authority" requirement (openspec 0165, task 4.3): a role
// manual page's generated capability list SHALL name exactly the
// capabilities `capabilitiesForRole` grants that role — nothing missing
// (an undocumented grant), nothing extra (an over-promised claim). Both
// directions fail the same way `check-help-coverage.mjs` reports gaps:
// named explicitly, so a reviewer sees the actual disagreement rather than
// a bare non-zero exit code. Mirrors that script's shape: pure functions
// plus a thin main() doing the file I/O.

/**
 * @param {string} role
 * @param {readonly string[]} documented
 * @returns {{ readonly undocumented: readonly string[]; readonly overclaimed: readonly string[] }}
 */
export function capabilityDrift(role, documented) {
  const granted = new Set(capabilitiesForRole(role));
  const claimed = new Set(documented);
  return {
    undocumented: [...granted].filter((capability) => !claimed.has(capability)).sort(),
    overclaimed: [...claimed].filter((capability) => !granted.has(capability)).sort(),
  };
}

/**
 * @param {readonly { readonly role: string; readonly path: string }[]} pages
 * @param {(path: string) => string} readSource
 */
export function findAllDrift(pages, readSource) {
  const drift = [];
  for (const page of pages) {
    if (!ORGANIZATION_ROLES.includes(page.role)) continue;
    const { undocumented, overclaimed } = capabilityDrift(
      page.role,
      documentedCapabilities(readSource(page.path)),
    );
    if (undocumented.length > 0 || overclaimed.length > 0) {
      drift.push({ role: page.role, path: page.path, undocumented, overclaimed });
    }
  }
  return drift;
}

async function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const rolesRoot = join(repoRoot, 'apps/web/src/content/docs/help/roles');
  const pages = roleManualPages(rolesRoot);

  const missing = ORGANIZATION_ROLES.filter((role) => !pages.some((page) => page.role === role));
  const drift = findAllDrift(pages, (path) => readFileSync(path, 'utf8'));

  let failed = false;

  if (missing.length > 0) {
    failed = true;
    process.stderr.write(
      `${missing.length} organization role(s) have no manual page under apps/web/src/content/docs/help/roles/:\n` +
        missing.map((role) => `  - ${role}\n`).join(''),
    );
  }

  for (const entry of drift) {
    failed = true;
    const relPath = relative(repoRoot, entry.path);
    if (entry.undocumented.length > 0) {
      process.stderr.write(
        `${relPath} (${entry.role}): granted but undocumented — run \`node scripts/generate-role-manuals.mjs\`:\n` +
          entry.undocumented.map((id) => `  - ${id}\n`).join(''),
      );
    }
    if (entry.overclaimed.length > 0) {
      process.stderr.write(
        `${relPath} (${entry.role}): documented but not granted — the page over-promises authority:\n` +
          entry.overclaimed.map((id) => `  - ${id}\n`).join(''),
      );
    }
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Role manual drift check OK: ${pages.length} page(s) match the declared mapping exactly.\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
