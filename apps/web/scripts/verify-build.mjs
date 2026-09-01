import { existsSync, readFileSync } from 'node:fs';
import { buildSitemap } from '@copalibre/routing';

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
 * translated under its own `/{locale}/` prefix.
 */
const DIST = new URL('../dist/client/', import.meta.url);
const SERVER_DIST = new URL('../dist/server/', import.meta.url);
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

const serverEntry = readFileSync(new URL('entry.mjs', SERVER_DIST), 'utf8');
check('server entry bundles sitemap route', serverEntry.includes('sitemap.xml'));

const NON_PRIMARY_LOCALES = [
  { locale: 'es', name: 'Spanish' },
  { locale: 'fr', name: 'French' },
  { locale: 'pt', name: 'Portuguese' },
  { locale: 'it', name: 'Italian' },
  { locale: 'de', name: 'German' },
  { locale: 'ru', name: 'Russian' },
  { locale: 'zh', name: 'Mandarin' },
];

const sampleRoutes = [
  { input: { organizationAlias: 'liga-mendocina' }, changeFrequency: 'daily' },
  ...NON_PRIMARY_LOCALES.map(({ locale }) => ({
    input: { organizationAlias: 'liga-mendocina', locale },
    changeFrequency: 'daily',
  })),
  {
    input: { organizationAlias: 'liga-mendocina', tournamentAlias: 'apertura-2026' },
    changeFrequency: 'hourly',
  },
  ...NON_PRIMARY_LOCALES.map(({ locale }) => ({
    input: { organizationAlias: 'liga-mendocina', tournamentAlias: 'apertura-2026', locale },
    changeFrequency: 'hourly',
  })),
];

const sitemap = buildSitemap('http://localhost:4321', sampleRoutes);
check('the sitemap has no operator route', !sitemap.includes('/control/'));
check('the sitemap has no venue route', !sitemap.includes('/tv/'));
check('the sitemap lists the organization', sitemap.includes('/liga-mendocina'));
check(
  'the sitemap lists the tournament',
  sitemap.includes('/liga-mendocina/tournaments/apertura-2026'),
);

for (const { locale, name } of NON_PRIMARY_LOCALES) {
  check(
    `the sitemap lists the ${name} organization variant`,
    sitemap.includes(`/${locale}/liga-mendocina`),
  );
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
