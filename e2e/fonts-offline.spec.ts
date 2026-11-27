import { expect, test } from './fixtures.js';

/**
 * The brand faces are bundled into the build and served from the application's own origin. A
 * venue with poor internet, a TV kiosk or an installation with no egress must get every page,
 * in its faces, with nothing outside that origin reachable. A third-party font host once made
 * every page wait on it: a hanging host timed out page loads on help, home, Control and TV.
 */

const SURFACES = [
  { name: 'public home', path: '/' },
  { name: 'Control login', path: '/control/login' },
  { name: 'TV', path: '/tv?bg=neutral' },
  { name: 'help', path: '/help/' },
] as const;

function isLocal(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  if (protocol === 'data:' || protocol === 'blob:') return true;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

for (const surface of SURFACES) {
  test(`${surface.name} loads in its brand faces with every other origin blocked`, async ({
    page,
  }) => {
    const external: string[] = [];
    const fontFiles: string[] = [];
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (isLocal(url)) {
        await route.fallback();
        return;
      }
      external.push(url);
      await route.abort('internetdisconnected');
    });
    page.on('request', (request) => {
      if (request.resourceType() === 'font') fontFiles.push(request.url());
    });

    await page.goto(surface.path, { waitUntil: 'load' });
    // Control's form renders after hydration, so a face may start loading after `load`.
    await page.waitForFunction(() =>
      [...document.fonts].some((face) => face.family === 'Barlow' && face.status === 'loaded'),
    );
    await page.evaluate(() => document.fonts.ready);

    expect(external).toEqual([]);
    expect(fontFiles.length).toBeGreaterThan(0);
    expect(fontFiles.filter((url) => !isLocal(url))).toEqual([]);
  });
}
