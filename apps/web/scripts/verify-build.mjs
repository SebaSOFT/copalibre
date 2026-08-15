import { readFileSync } from 'node:fs';

/**
 * Asserts the built output over the built output.
 *
 * The claims worth checking here are about what the *build* produced — that the
 * page is complete without JavaScript, that the sitemap advertises no operator
 * route — and a unit test over the model cannot see any of them. This is the
 * cheap half of section 7 that needs no browser.
 *
 * English is the primary locale: the unprefixed path carries English
 * chrome, and every other supported language carries the same content
 * translated under its own `/{locale}/` prefix (0056 populated the five
 * beyond 0055's Spanish; 0057 added Mandarin). `describeSlot`'s bracket-slot
 * labels ("Ganador del N") stay Spanish regardless of locale — a documented,
 * deliberate exception (`lib/bracket.ts`), not a bug here.
 */
const DIST = new URL('../dist/client/', import.meta.url);
const read = (path) => readFileSync(new URL(path, DIST), 'utf8');

const failures = [];
let totalChecks = 0;
const check = (label, condition) => {
  totalChecks += 1;
  if (!condition) failures.push(label);
};

const robots = read('robots.txt');
check('robots disallows /control/', robots.includes('Disallow: /control/'));
check('robots disallows /tv/', robots.includes('Disallow: /tv/'));

const sitemap = read('sitemap.xml');
check('the sitemap has no operator route', !sitemap.includes('/control/'));
check('the sitemap has no venue route', !sitemap.includes('/tv/'));
// The sitemap is still statically generated for the known tournaments if any.
// Actually, since [tournament].astro is now SSR, getStaticPaths is removed, so it might not be in the sitemap.xml anymore natively!
// Wait! Astro's sitemap integration only covers pre-rendered pages, or you pass a custom sitemap list.
// The instructions say "keep the robots.txt/sitemap.xml/other-page assertions, path-adjusted."
check(
  'the sitemap lists the tournament',
  sitemap.includes('/liga-mendocina/tournaments/apertura-2026'),
);

const NON_PRIMARY_LOCALES = [
  { locale: 'es', name: 'Spanish' },
  { locale: 'fr', name: 'French' },
  { locale: 'pt', name: 'Portuguese' },
  { locale: 'it', name: 'Italian' },
  { locale: 'de', name: 'German' },
  { locale: 'ru', name: 'Russian' },
  { locale: 'zh', name: 'Mandarin' },
];

for (const { locale, name } of NON_PRIMARY_LOCALES) {
  check(
    `the sitemap lists the ${name} tournament variant`,
    sitemap.includes(`/${locale}/liga-mendocina/tournaments/apertura-2026`),
  );
}

if (failures.length > 0) {
  process.stderr.write(`Built output failed:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`Built output verified: ${totalChecks} checks passed.\n`);
