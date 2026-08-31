import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ControlShell } from './components/ControlShell.js';

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CONTROL_ROUTES_SOURCE = readFileSync(
  resolve(SOURCE_DIRECTORY, 'components/ControlRoutes.tsx'),
  'utf8',
);
const HELP_CONTENT_DIRECTORY = resolve(SOURCE_DIRECTORY, '../content/docs/help/control');

/**
 * Reads the real `ControlRoutes.tsx` source and the real content directory —
 * the delta spec's "a screen without a matching help page fails the build"
 * scenario — rather than a hardcoded duplicate of either that could
 * drift out of sync with the file it is meant to check.
 */
describe('every control-panel route links to a real help page', () => {
  // Empty is not a special case: a declared-but-empty helpPath is a route
  // that opted out of documentation, and that opt-out is exactly what this
  // change closes (openspec 0162) — it must fail the same way a missing
  // path does, not be invisible to the check that catches a missing one.
  const helpPaths = [...CONTROL_ROUTES_SOURCE.matchAll(/helpPath="([\w-]*)"/g)].map(
    (match) => match[1],
  );

  it('found at least one helpPath to check (a sign this test still reads real source)', () => {
    expect(helpPaths.length).toBeGreaterThan(0);
  });

  it.each(helpPaths)(
    'helpPath="%s" is declared and resolves to a real content file',
    (helpPath) => {
      expect(helpPath).not.toBe('');
      expect(existsSync(resolve(HELP_CONTENT_DIRECTORY, `${helpPath}.md`))).toBe(true);
    },
  );
});

describe('ControlShell requires helpPath', () => {
  it('is a compile-time error to omit it', () => {
    function _neverCalled() {
      // @ts-expect-error — helpPath is required; a screen that forgets it must not compile.
      return <ControlShell organizationAlias="liga">{null}</ControlShell>;
    }
    void _neverCalled;
    expect(true).toBe(true);
  });
});
