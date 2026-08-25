import { readFileSync, readdirSync } from 'node:fs';

/**
 * Every copied component has a notice entry.
 *
 * Copying a file is how the control app keeps control of its own interaction
 * surface, and it is also how an MIT notice quietly disappears. This makes the
 * omission a failing build rather than something found during a licence audit.
 */
const UI_DIR = new URL('../apps/web/src/control/components/ui/', import.meta.url);
const notices = readFileSync(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');

// The owned component layer is organized into atoms/molecules/organisms/templates
// subfolders (0141), so this recurses rather than reading one flat directory.
const missing = readdirSync(UI_DIR, { recursive: true })
  .filter((file) => file.endsWith('.tsx') || file.endsWith('.ts'))
  .map((file) => file.split('/').pop())
  .filter((file) => !notices.includes(`\`${file}\``));

if (missing.length > 0) {
  process.stderr.write(
    `Copied components with no THIRD_PARTY_NOTICES.md entry:\n${missing
      .map((file) => `  - ${file}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write('Every copied component has a notice entry.\n');
