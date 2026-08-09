import { readFileSync } from 'node:fs';

/**
 * Asserts the built output over the built output (0020).
 *
 * The claims worth checking here are about what the *build* produced — that the
 * page is complete without JavaScript, that the sitemap advertises no operator
 * route — and a unit test over the model cannot see any of them. This is the
 * cheap half of section 7 that needs no browser.
 *
 * English is the primary locale (0055): the unprefixed path carries English
 * chrome, and every other supported language carries the same content
 * translated under its own `/{locale}/` prefix (0056 populated the five
 * beyond 0055's Spanish; 0057 added Mandarin). `describeSlot`'s bracket-slot
 * labels ("Ganador del N") stay Spanish regardless of locale — a documented,
 * deliberate exception (`lib/bracket.ts`), not a bug here.
 */
const DIST = new URL('../dist/', import.meta.url);
const read = (path) => readFileSync(new URL(path, DIST), 'utf8');

const failures = [];
let totalChecks = 0;
const check = (label, condition) => {
  totalChecks += 1;
  if (!condition) failures.push(label);
};

const overview = read('liga-mendocina/tournaments/apertura-2026/index.html');
check('the overview names the competition', overview.includes('Torneo Apertura 2026'));
check('the overview carries a score', overview.includes('TLL A'));
check('the overview declares the English document language', /<html lang="en"/.test(overview));
// Colour is never the only cue, so the label has to be in the markup.
check('every state carries its label', overview.includes('LIVE'));
check('the page declares a canonical URL', /rel="canonical"/.test(overview));
// A venue TV behind a hotel proxy still gets the score.
check('the page needs no JavaScript', !/<script/.test(overview));
check('the skip link comes first', overview.indexOf('Skip to content') < overview.indexOf('<main'));

// B2 and B3 (0021): both must be right before any script runs.
const live = read('liga-mendocina/tournaments/apertura-2026/live/index.html');
check('the live page carries a score server-side', live.includes('TLL A'));
check('the live page labels its state', live.includes('LIVE'));
check('the live page shows the legend', live.includes('Legend'));

const bracket = read('liga-mendocina/tournaments/apertura-2026/stages/1/index.html');
check('the bracket names an unresolved slot', bracket.includes('Ganador del'));
check('the grand final reads as pending', bracket.includes('TBD'));
// No discipline-specific widget belongs on a shared template.
check('the bracket has no minimap', !/minimap/i.test(bracket));

// Every non-primary locale variant (0055 built `es`; 0056 added five more;
// 0057 added Mandarin): same data, translated chrome, no in-page switcher.
const NON_PRIMARY_LOCALES = [
  { locale: 'es', liveLabel: 'EN VIVO', name: 'Spanish' },
  { locale: 'fr', liveLabel: 'EN DIRECT', name: 'French' },
  { locale: 'pt', liveLabel: 'AO VIVO', name: 'Portuguese' },
  { locale: 'it', liveLabel: 'IN DIRETTA', name: 'Italian' },
  { locale: 'de', liveLabel: 'LIVE', name: 'German' },
  { locale: 'ru', liveLabel: 'В ЭФИРЕ', name: 'Russian' },
  { locale: 'zh', liveLabel: '进行中', name: 'Mandarin' },
];
for (const { locale, liveLabel, name } of NON_PRIMARY_LOCALES) {
  const overviewVariant = read(`${locale}/liga-mendocina/tournaments/apertura-2026/index.html`);
  check(
    `the ${name} overview names the same competition`,
    overviewVariant.includes('Torneo Apertura 2026'),
  );
  check(
    `the ${name} overview declares the ${name} document language`,
    new RegExp(`<html lang="${locale}"`).test(overviewVariant),
  );
  check(`the ${name} overview labels its state in ${name}`, overviewVariant.includes(liveLabel));
  check(
    `the ${name} overview canonical URL carries the /${locale}/ prefix`,
    overviewVariant.includes(`/${locale}/liga-mendocina/tournaments/apertura-2026`),
  );
}

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
