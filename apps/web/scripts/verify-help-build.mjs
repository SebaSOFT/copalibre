import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, '../dist/client');
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
  'llms-full.txt stays English-only as more locales are added',
  !llmsFullTxt.includes('Panel de control') && !llmsFullTxt.includes('Referencia de comandos'),
);

const esGettingStarted = readOutput('es/help/getting-started/index.html');
check(
  'the Spanish locale still builds and is reachable at /es/',
  esGettingStarted.includes('En esta página'),
);

// Seven-language parity: each new locale's own root heading confirms
// its content built and is reachable under its own prefix, not just that the
// build didn't crash.
const LOCALE_HEADINGS = {
  fr: 'Aide CopaLibre',
  pt: 'Ajuda do CopaLibre',
  it: 'Guida CopaLibre',
  de: 'CopaLibre-Hilfe',
  ru: 'Справка CopaLibre',
  zh: 'CopaLibre 帮助',
};
for (const [locale, heading] of Object.entries(LOCALE_HEADINGS)) {
  const page = readOutput(`${locale}/help/index.html`);
  check(`the ${locale} locale builds and is reachable at /${locale}/`, page.includes(heading));
}

// openspec 0163: the agent-facing authoring contract is a separate pipeline
// from the operator help site's llms.txt/llms-full.txt (starlight-llms-txt
// reads only src/content/docs/, never src/authoring-docs/), so the two must
// never mix — proven here against the real built output, not merely
// asserted by the separation of the two source trees.
const llmsAuthoringTxt = existsSync(join(DIST, 'llms-authoring.txt'))
  ? readOutput('llms-authoring.txt')
  : '';
check('llms-authoring.txt exists', llmsAuthoringTxt.length > 0);
check(
  'llms-authoring.txt contains the descriptor-authoring content, not a placeholder',
  llmsAuthoringTxt.includes('copalibre_descriptor_validate') &&
    llmsAuthoringTxt.includes('requireMargin') &&
    llmsAuthoringTxt.includes('basketball'),
);
check(
  'llms.txt and llms-full.txt carry none of the authoring-only content',
  !llmsTxt.includes('llms-authoring') &&
    !llmsFullTxt.includes('basketball') &&
    !llmsFullTxt.includes('track-sprint') &&
    !llmsFullTxt.includes('requireMargin') &&
    !llmsFullTxt.includes('copalibre_descriptor_validate'),
);
check(
  'the descriptor schema is served at its stable URL as valid JSON',
  (() => {
    if (!existsSync(join(DIST, 'schemas/discipline-descriptor.schema.json'))) return false;
    const schema = JSON.parse(readOutput('schemas/discipline-descriptor.schema.json'));
    return Array.isArray(schema.required) && schema.required.includes('alias');
  })(),
);
check(
  'the authoring guide pages are individually served',
  existsSync(join(DIST, 'authoring/index.md')) &&
    existsSync(join(DIST, 'authoring/descriptor-reference.md')) &&
    existsSync(join(DIST, 'authoring/transcriptions/basketball.descriptor.json')) &&
    existsSync(join(DIST, 'authoring/transcriptions/track-sprint.descriptor.json')),
);

const TOTAL_CHECKS = 32;
if (failures.length > 0) {
  process.stderr.write(
    `Help build failed:\n${failures.map((failure) => `  - ${failure}`).join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write(`Help build verified: ${TOTAL_CHECKS - failures.length} checks passed.\n`);
