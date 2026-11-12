import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

/*
  The classic script every public and Control page runs before first paint.
  Run in a bare context with only what the script may touch, so a storage
  failure behaves as it would in a browser that blocks storage.
*/
const SCRIPT = readFileSync(
  join(import.meta.dirname, '../../public/scripts/theme-init.js'),
  'utf8',
);

function runThemeInit(localStorage: { getItem(key: string): string | null }) {
  const root = document.createElement('html');
  runInNewContext(SCRIPT, { document: { documentElement: root }, localStorage });
  return root;
}

describe('the pre-paint script', () => {
  it('marks that scripting runs and applies a stored theme', () => {
    const root = runThemeInit({ getItem: () => 'light' });
    expect(root.hasAttribute('data-scripting')).toBe(true);
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('still marks scripting when storage throws, and leaves the theme to the system', () => {
    const root = runThemeInit({
      getItem: () => {
        throw new Error('SecurityError: storage is blocked');
      },
    });
    expect(root.hasAttribute('data-scripting')).toBe(true);
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('ignores a stored value that is not a theme', () => {
    const root = runThemeInit({ getItem: () => 'sepia' });
    expect(root.hasAttribute('data-scripting')).toBe(true);
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});
