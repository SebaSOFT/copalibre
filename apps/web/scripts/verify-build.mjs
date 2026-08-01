import { readFileSync } from 'node:fs';

/**
 * Asserts the built output over the built output (0020).
 *
 * The claims worth checking here are about what the *build* produced — that the
 * page is complete without JavaScript, that the sitemap advertises no operator
 * route — and a unit test over the model cannot see any of them. This is the
 * cheap half of section 7 that needs no browser.
 */
const DIST = new URL('../dist/', import.meta.url);
const read = (path) => readFileSync(new URL(path, DIST), 'utf8');

const failures = [];
const check = (label, condition) => {
  if (!condition) failures.push(label);
};

const overview = read('liga-mendocina/tournaments/apertura-2026/index.html');
check('the overview names the competition', overview.includes('Torneo Apertura 2026'));
check('the overview carries a score', overview.includes('TLL A'));
// Colour is never the only cue, so the label has to be in the markup.
check('every state carries its label', overview.includes('EN VIVO'));
check('the page declares a canonical URL', /rel="canonical"/.test(overview));
// A venue TV behind a hotel proxy still gets the score.
check('the page needs no JavaScript', !/<script/.test(overview));
check(
  'the skip link comes first',
  overview.indexOf('Saltar al contenido') < overview.indexOf('<main'),
);

const robots = read('robots.txt');
check('robots disallows /control/', robots.includes('Disallow: /control/'));
check('robots disallows /tv/', robots.includes('Disallow: /tv/'));

const sitemap = read('sitemap.xml');
check('the sitemap has no operator route', !sitemap.includes('/control/'));
check('the sitemap has no venue route', !sitemap.includes('/tv/'));
check(
  'the sitemap lists the tournament',
  sitemap.includes('/liga-mendocina/tournaments/apertura-2026'),
);

if (failures.length > 0) {
  process.stderr.write(`Built output failed:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`Built output verified: ${11 - failures.length} checks passed.\n`);
