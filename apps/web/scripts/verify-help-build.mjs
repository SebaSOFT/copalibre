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
check('help document renders a table of contents', gettingStarted.includes('En esta página'));
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
check('API reference pins Scalar CDN', apiReference.includes('@scalar/api-reference@1.64.0'));
check(
  'API reference disables request execution',
  apiReference.includes('hideTestRequestButton: true'),
);
check('API reference navigation forces a document load', help.includes('data-astro-reload'));

if (failures.length > 0) {
  process.stderr.write(
    `Help build failed:\n${failures.map((failure) => `  - ${failure}`).join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write(`Help build verified: ${14 - failures.length} checks passed.\n`);
