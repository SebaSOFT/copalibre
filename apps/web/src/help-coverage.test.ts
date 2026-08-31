import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimedCapabilityIds,
  listCapabilities,
  operatorFacingCapabilityIds,
  parseHelpFrontmatter,
  uncoveredCapabilities,
  uncoveredRoles,
} from '../../../scripts/check-help-coverage.mjs';

// Runs the same real-tree assertion as scripts/check-help-coverage.test.mjs,
// inside the web workspace's own jest run — the currency gate (openspec
// 0162) is exercised from both entry points a reviewer might check.
describe('help page capability and role coverage', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

  it('every operator-facing capability is claimed by some help page, every role is named', () => {
    const capabilities = listCapabilities(join(repoRoot, 'openspec/specs'));
    const operatorFacingIds = operatorFacingCapabilityIds(capabilities);

    const helpRoot = join(repoRoot, 'apps/web/src/content/docs/help');
    const pages = readdirSync(helpRoot, { recursive: true })
      .filter((entry) => entry.toString().endsWith('.md'))
      .map((entry) => parseHelpFrontmatter(readFileSync(join(helpRoot, entry.toString()), 'utf8')))
      .filter(
        (frontmatter): frontmatter is NonNullable<typeof frontmatter> => frontmatter !== undefined,
      );

    const claimed = claimedCapabilityIds(pages);
    expect(uncoveredCapabilities(operatorFacingIds, claimed)).toEqual([]);
    expect(
      uncoveredRoles(pages, [
        'admin',
        'club-admin',
        'tournament-admin',
        'referee',
        'broadcaster',
        'viewer',
        'super-admin',
      ]),
    ).toEqual([]);
  });
});
