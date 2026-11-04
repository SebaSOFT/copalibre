/* global document, getComputedStyle, localStorage, PopStateEvent, window */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Captures screenshots and an overflow report for a design review. This is a
 * review tool, not a visual gate: nothing here compares pixels or fails a build.
 *
 * Each route names a surface, and the surface sets its widths. Control and TV are
 * not targeted at phones, so only phone-width surfaces get the extended pass: a
 * page that overflows in the first pass is captured again at 188px in all eight
 * interface languages.
 *
 * Usage:
 *   COPALIBRE_REVIEW_EMAIL=... COPALIBRE_REVIEW_PASSWORD_FILE=... \
 *   node scripts/design-review-capture.mjs --ids ids.json --out <dir> \
 *     [--base-url http://localhost:4321] [--storybook-url http://localhost:6006]
 *     [--color-scheme dark|light] [--surface <name>[,<name>...]] [--route <id>[,<id>...]]
 *     [--language <code>[,<code>...]] [--width <px>[,<px>...]]
 *     [--header <name>:<value>] [--extended]
 *
 * Emails need no running server, so they have their own pass. It renders each
 * template through the worker's builders, in eight languages at both email widths:
 *   node scripts/design-review-capture.mjs --emails --out <dir>
 *
 * Help is generated only by a production build, so capture that surface from a
 * preview server through --base-url: the dev server answers it with a placeholder.
 */

export const FIRST_PASS_LANGUAGES = ['es', 'de'];
export const ALL_LANGUAGES = ['en', 'es', 'pt', 'fr', 'it', 'de', 'ru', 'zh'];
export const EXTENDED_WIDTH = 188;
export const EMAIL_WIDTHS = [600, 375];

const DEFAULT_MANIFEST = join(dirname(fileURLToPath(import.meta.url)), 'design-review-routes.json');
const TV_HEIGHTS = { 1280: 720, 1920: 1080 };
const DEFAULT_HEIGHT = 900;
const SETTLE_MS = 600;

export function loadManifest(path = DEFAULT_MANIFEST) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  for (const route of manifest.routes) {
    if (!manifest.surfaces[route.surface]) {
      throw new Error(`route "${route.id}" names an unknown surface "${route.surface}"`);
    }
  }
  return manifest;
}

/** Fills `{name}` placeholders. An unresolved placeholder is an error, not a broken URL. */
export function resolvePath(template, values) {
  return template.replace(/\{(\w+)\}/g, (_match, name) => {
    if (values[name] === undefined) throw new Error(`no value for "{${name}}" in ${template}`);
    return values[name];
  });
}

/** One capture per route, language and surface width. */
export function expandFirstPass(manifest, ids, languages = FIRST_PASS_LANGUAGES) {
  return manifest.routes.flatMap((route) =>
    languages.flatMap((language) =>
      manifest.surfaces[route.surface].widths.map((width) => ({
        id: route.id,
        surface: route.surface,
        language,
        width,
        path: resolvePath(route.path, { ...ids, locale: language }),
        ...(route.expectNotFound ? { expectNotFound: true } : {}),
      })),
    ),
  );
}

export function hasOverflow(entry) {
  return entry.pageOverflow || entry.elements.length > 0;
}

/** Narrows a pass to the requested surfaces, routes, languages and widths. */
export function filterCaptures(captures, filters = {}) {
  const allows = (list, value) => !list || list.split(',').includes(String(value));
  return captures.filter(
    (capture) =>
      allows(filters.surface, capture.surface) &&
      allows(filters.route, capture.id) &&
      allows(filters.language, capture.language) &&
      allows(filters.width, capture.width),
  );
}

/** The route ids that earn the extended pass: phone-width surfaces that overflowed. */
export function selectOverflowing(manifest, entries) {
  const flagged = entries
    .filter((entry) => manifest.surfaces[entry.surface]?.phoneWidth && hasOverflow(entry))
    .map((entry) => entry.id);
  return [...new Set(flagged)];
}

/** Every language at 188px, for each flagged route. */
export function expandExtendedPass(manifest, ids, routeIds) {
  return manifest.routes
    .filter((route) => routeIds.includes(route.id))
    .flatMap((route) =>
      ALL_LANGUAGES.map((language) => ({
        id: route.id,
        surface: route.surface,
        language,
        width: EXTENDED_WIDTH,
        path: resolvePath(route.path, { ...ids, locale: language }),
      })),
    );
}

export function viewportFor(surface, width) {
  return {
    width,
    height: surface === 'tv' ? (TV_HEIGHTS[width] ?? DEFAULT_HEIGHT) : DEFAULT_HEIGHT,
  };
}

/** Storybook answers on its own server, so its stories never resolve against the site. */
export function baseUrlFor(capture, options) {
  return capture.surface === 'storybook' ? options.storybookUrl : options.baseUrl;
}

export function screenshotName(capture) {
  return `${capture.id}.${capture.language}.${capture.width}.png`;
}

/** Runs in the page: horizontal overflow of the document and of each visible element. */
function measureOverflow() {
  const root = document.documentElement;
  const describe = (element) => {
    const className = typeof element.className === 'string' ? element.className.trim() : '';
    const first = className.split(/\s+/)[0];
    return `${element.tagName.toLowerCase()}${first ? `.${first}` : ''}`;
  };
  const elements = [...document.body.querySelectorAll('*')]
    .filter((element) => {
      // A 1px box is a visually hidden label: it overflows by design and shows nothing.
      if (element.scrollWidth <= element.clientWidth + 1 || element.clientWidth <= 1) return false;
      const style = getComputedStyle(element);
      return style.display !== 'inline' && style.visibility !== 'hidden';
    })
    .slice(0, 25)
    .map((element) => ({
      element: describe(element),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
    }));
  return { pageOverflow: root.scrollWidth > root.clientWidth + 1, elements };
}

async function signIn(page, baseUrl, credentials) {
  await page.goto(`${baseUrl}/control/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith('/control/login'), { timeout: 20_000 });
}

/** Moves inside the single-page control app, so the in-memory session survives. */
async function navigateInApp(page, path) {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function record(page, capture, outDirectory, httpStatus) {
  await page.waitForTimeout(SETTLE_MS);
  const measured = await page.evaluate(measureOverflow);
  const heading = await page
    .locator('h1')
    .first()
    .innerText({ timeout: 1_000 })
    .catch(() => '');
  const screenshot = screenshotName(capture);
  await page.screenshot({ path: join(outDirectory, screenshot), fullPage: true });
  return { ...capture, ...measured, httpStatus, heading: heading.trim(), screenshot };
}

/** A capture of an error page is not a capture of the route: it must not count as a pass. */
export function isWrongPage(entry) {
  return !entry.expectNotFound && entry.httpStatus !== undefined && entry.httpStatus >= 400;
}

/**
 * Groups captures that can share one browser context. Control shares one per
 * language, because sign-in allows five attempts a minute: the viewport changes
 * inside the session instead of signing in again for each width.
 */
export function groupByContext(captures) {
  const groups = new Map();
  for (const capture of captures) {
    const key = `${capture.surface === 'control' ? 'control' : 'open'}:${capture.language}`;
    groups.set(key, [...(groups.get(key) ?? []), capture]);
  }
  return [...groups.values()];
}

async function capturePass(browser, captures, options) {
  const results = [];
  for (const group of groupByContext(captures)) {
    const { language, surface, width } = group[0];
    const context = await browser.newContext({
      viewport: viewportFor(surface, width),
      locale: language,
      colorScheme: options.colorScheme,
      ...(options.headers ? { extraHTTPHeaders: options.headers } : {}),
    });
    await context.addInitScript((value) => {
      localStorage.setItem('copalibre.language', value);
    }, language);
    const page = await context.newPage();
    let signInError;
    if (surface === 'control') {
      await signIn(page, options.baseUrl, options.credentials).catch((error) => {
        signInError = String(error);
      });
    }
    for (const capture of group) {
      if (signInError) {
        results.push({ ...capture, pageOverflow: false, elements: [], error: signInError });
        continue;
      }
      try {
        await page.setViewportSize(viewportFor(capture.surface, capture.width));
        let httpStatus;
        if (capture.surface === 'control') {
          await navigateInApp(page, capture.path);
        } else {
          const response = await page.goto(`${baseUrlFor(capture, options)}${capture.path}`, {
            waitUntil: 'networkidle',
          });
          httpStatus = response?.status();
        }
        results.push(await record(page, capture, options.outDirectory, httpStatus));
      } catch (error) {
        results.push({ ...capture, pageOverflow: false, elements: [], error: String(error) });
      }
    }
    await context.close();
  }
  return results;
}

function parseArguments(argv) {
  const values = {
    baseUrl: 'http://localhost:4321',
    storybookUrl: 'http://localhost:6006',
    colorScheme: 'dark',
    extended: false,
    emails: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--extended') values.extended = true;
    else if (flag === '--emails') values.emails = true;
    else if (flag === '--ids') values.ids = argv[(index += 1)];
    else if (flag === '--out') values.out = argv[(index += 1)];
    else if (flag === '--base-url') values.baseUrl = argv[(index += 1)];
    else if (flag === '--color-scheme') values.colorScheme = argv[(index += 1)];
    else if (flag === '--surface') values.surface = argv[(index += 1)];
    else if (flag === '--route') values.route = argv[(index += 1)];
    else if (flag === '--language') values.language = argv[(index += 1)];
    else if (flag === '--width') values.width = argv[(index += 1)];
    else if (flag === '--storybook-url') values.storybookUrl = argv[(index += 1)];
    else if (flag === '--header') values.header = argv[(index += 1)];
    else throw new Error(`unknown flag: ${flag}`);
  }
  if (!values.out) throw new Error('--out is required');
  if (!values.ids && !values.emails) throw new Error('--ids is required unless --emails is set');
  return values;
}

/** `name:value` as a header map, for a server that routes on a request header. */
export function parseHeader(value) {
  if (!value) return undefined;
  const separator = value.indexOf(':');
  if (separator < 1) throw new Error(`--header needs name:value, got "${value}"`);
  return { [value.slice(0, separator)]: value.slice(separator + 1) };
}

/** One capture per email and width: the HTML has no server, so it loads as page content. */
export function expandEmailPass(emails, widths = EMAIL_WIDTHS) {
  return emails.flatMap((email) =>
    widths.map((width) => ({
      id: `email-${email.template}`,
      surface: 'email',
      language: email.language,
      width,
      subject: email.subject,
      html: email.html,
    })),
  );
}

async function captureEmails(browser, outDirectory) {
  const { tsImport } = await import('tsx/esm/api');
  const { renderReviewEmails } = await tsImport('./design-review-emails.ts', import.meta.url);
  const results = [];
  for (const capture of expandEmailPass(renderReviewEmails())) {
    const { html, ...entry } = capture;
    const context = await browser.newContext({ viewport: { width: entry.width, height: 900 } });
    const page = await context.newPage();
    // Remote images point at an installation that is not running, so they show as blocked.
    await page.route(/^https?:/, (route) => route.abort());
    await page.setContent(html, { waitUntil: 'load' });
    results.push(await record(page, entry, outDirectory));
    await context.close();
  }
  return results;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const outDirectory = args.out;
  mkdirSync(outDirectory, { recursive: true });
  const reportPath = join(outDirectory, 'overflow-report.json');

  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();

  if (args.emails) {
    const entries = await captureEmails(browser, outDirectory);
    await browser.close();
    writeFileSync(reportPath, `${JSON.stringify({ entries }, null, 2)}\n`);
    const overflowing = entries.filter(hasOverflow).length;
    process.stdout.write(`${entries.length} email captures, ${overflowing} overflowing\n`);
    return;
  }

  const manifest = loadManifest();
  const ids = JSON.parse(readFileSync(args.ids, 'utf8'));
  const passwordFile = process.env.COPALIBRE_REVIEW_PASSWORD_FILE;
  const options = {
    baseUrl: args.baseUrl,
    storybookUrl: args.storybookUrl,
    colorScheme: args.colorScheme,
    headers: parseHeader(args.header),
    outDirectory,
    credentials: {
      email: process.env.COPALIBRE_REVIEW_EMAIL,
      password: passwordFile ? readFileSync(passwordFile, 'utf8').trim() : undefined,
    },
  };

  const firstPass = filterCaptures(expandFirstPass(manifest, ids), args);
  const entries = await capturePass(browser, firstPass, options);
  const flagged = selectOverflowing(manifest, entries);
  const extended = args.extended
    ? await capturePass(browser, expandExtendedPass(manifest, ids, flagged), options)
    : [];
  await browser.close();

  writeFileSync(reportPath, `${JSON.stringify({ entries, flagged, extended }, null, 2)}\n`);
  const failed = entries.filter((entry) => entry.error).length;
  const wrongPages = entries.filter(isWrongPage).length;
  process.stdout.write(
    `${entries.length} captures, ${failed} failed, ${wrongPages} error pages, ` +
      `${flagged.length} overflowing routes flagged\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
