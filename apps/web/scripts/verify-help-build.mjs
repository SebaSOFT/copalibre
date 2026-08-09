import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, '../dist');
const STARLIGHT_ROOT = join(ROOT, '../../../node_modules/@astrojs/starlight');
const CUSTOM_CSS = join(ROOT, '../src/styles/help.css');
const failures = [];

function check(label, condition) {
  if (!condition) failures.push(label);
}

function readOutput(path) {
  return readFileSync(join(DIST, path), 'utf8');
}

function readTree(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? readTree(path) : [path];
  });
}

const help = readOutput('help/index.html');
const gettingStarted = readOutput('help/getting-started/index.html');
const apiReference = readOutput('help/api-reference/index.html');
const publicHome = readOutput('index.html');
const publicOverview = readOutput('liga-mendocina/tournaments/apertura-2026/index.html');
const controlHome = readOutput('control/index.html');
const customCss = readFileSync(CUSTOM_CSS, 'utf8');
const starlightSource = readTree(STARLIGHT_ROOT)
  .filter((path) => /\.(astro|css|ts)$/.test(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

check('help route renders Starlight navigation', help.includes('/help/getting-started/'));
check('help route renders Pagefind search', help.includes('pagefind'));
check('help route enables Astro view transitions', help.includes('astro-view-transitions-enabled'));
check('help document renders a table of contents', gettingStarted.includes('On this page'));
check('Pagefind output exists', existsSync(join(DIST, 'pagefind')));
check(
  'custom Starlight CSS does not redefine CopaLibre tokens',
  !/--cl-[\w-]+\s*:/.test(customCss),
);
check('Starlight source does not define CopaLibre tokens', !starlightSource.includes('--cl-'));
check('public home does not render Starlight markup', !publicHome.includes('starlight'));
check('public overview needs no JavaScript', !/<script/.test(publicOverview));
check('control home does not render Starlight markup', !controlHome.includes('starlight'));
check(
  'API reference reads the local OpenAPI artifact',
  apiReference.includes("url: '/openapi/v1.json'"),
);
check(
  'API reference loads Scalar from the vendored build asset, not a CDN',
  apiReference.includes('src="/vendor/scalar/standalone.js"') &&
    !apiReference.includes('cdn.jsdelivr.net') &&
    !apiReference.includes('unpkg.com'),
);
check(
  'Vendored Scalar bundle exists in the build output',
  existsSync(join(DIST, 'vendor/scalar/standalone.js')),
);
check(
  'API reference disables request execution',
  apiReference.includes('hideTestRequestButton: true'),
);
check('API reference navigation forces a document load', help.includes('data-astro-reload'));

const llmsTxt = existsSync(join(DIST, 'llms.txt')) ? readOutput('llms.txt') : '';
const llmsFullTxt = existsSync(join(DIST, 'llms-full.txt')) ? readOutput('llms-full.txt') : '';
check('llms.txt exists', llmsTxt.length > 0);
check('llms.txt points at llms-full.txt', llmsTxt.includes('llms-full.txt'));
check('llms-full.txt exists', llmsFullTxt.length > 0);
check(
  'llms-full.txt contains real page content, not a placeholder',
  llmsFullTxt.includes('copalibre init') && llmsFullTxt.includes('copalibre mcp'),
);
check(
  'llms-full.txt stays English-only as more locales are added (0051)',
  !llmsFullTxt.includes('Panel de control') && !llmsFullTxt.includes('Referencia de comandos'),
);

const esGettingStarted = readOutput('es/help/getting-started/index.html');
check(
  'the Spanish locale still builds and is reachable at /es/ (0051)',
  esGettingStarted.includes('En esta página'),
);

// Seven-language parity (0052): each new locale's own root heading confirms
// its content built and is reachable under its own prefix, not just that the
// build didn't crash.
const LOCALE_HEADINGS = {
  fr: 'Aide CopaLibre',
  pt: 'Ajuda do CopaLibre',
  it: 'Guida CopaLibre',
  de: 'CopaLibre-Hilfe',
  ru: 'Справка CopaLibre',
};
for (const [locale, heading] of Object.entries(LOCALE_HEADINGS)) {
  const page = readOutput(`${locale}/help/index.html`);
  check(
    `the ${locale} locale builds and is reachable at /${locale}/ (0052)`,
    page.includes(heading),
  );
}

const TOTAL_CHECKS = 26;
if (failures.length > 0) {
  process.stderr.write(
    `Help build failed:\n${failures.map((failure) => `  - ${failure}`).join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write(`Help build verified: ${TOTAL_CHECKS - failures.length} checks passed.\n`);
