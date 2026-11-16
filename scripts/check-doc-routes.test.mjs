import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  citedHelpRoutes,
  livingDocuments,
  missingRoutes,
  producedHelpRoutes,
} from './check-doc-routes.mjs';

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'doc-routes-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test('reads a route out of prose, with and without its trailing slash', () => {
  assert.deepEqual(
    citedHelpRoutes('See `/help/cli/commands/` and /help/self-hosting for the rest, or /help/.'),
    ['/help/cli/commands/', '/help/self-hosting/', '/help/'],
  );
});

test('reads a locale-prefixed route as its own route', () => {
  assert.deepEqual(citedHelpRoutes('Spanish lives at /es/help/control/overview/.'), [
    '/es/help/control/overview/',
  ]);
});

test('a wildcard, a placeholder and a content path are patterns, not routes', () => {
  assert.deepEqual(
    citedHelpRoutes(
      [
        'Everything under `/help/**` builds.',
        'Translated pages are at `/{locale}/help/` and `/<locale>/help/[page]`.',
        'Pages live in apps/web/src/content/docs/help/ and docs/help/.',
      ].join('\n'),
    ),
    [],
  );
});

test('the content produces English and locale routes, an index page as its directory', () => {
  const root = tree({
    'help/index.md': '',
    'help/getting-started.md': '',
    'help/cli/index.md': '',
    'help/cli/commands.md': '',
    'es/help/index.md': '',
    'es/help/cli/commands.mdx': '',
    'help/notes.txt': '',
  });
  assert.deepEqual(
    [...producedHelpRoutes(root)].sort(),
    [
      '/es/help/',
      '/es/help/cli/commands/',
      '/help/',
      '/help/cli/',
      '/help/cli/commands/',
      '/help/getting-started/',
    ].sort(),
  );
});

test('a standalone Astro page beside the content is a route too, and not a content file', () => {
  const docs = tree({ 'help/index.md': '' });
  const pages = tree({
    'help/api-reference.astro': '',
    'help/notes.txt': '',
    'es/help/index.astro': '',
  });
  assert.deepEqual(
    [...producedHelpRoutes(docs, pages)].sort(),
    ['/es/help/', '/help/', '/help/api-reference/'].sort(),
  );
});

test('names each document and route that has no page behind it', () => {
  const produced = new Set(['/help/', '/help/cli/']);
  assert.deepEqual(
    missingRoutes(
      [
        {
          path: 'README.md',
          text: 'Help is at `/help/` and the reference at `/help/api-reference/`.',
        },
        { path: 'PRODUCT.md', text: 'Run `/help/cli/`.' },
        { path: 'docs/AUTH.md', text: 'See /help/api-reference/ and /help/missing/.' },
      ],
      produced,
    ),
    [
      { path: 'README.md', route: '/help/api-reference/' },
      { path: 'docs/AUTH.md', route: '/help/api-reference/' },
      { path: 'docs/AUTH.md', route: '/help/missing/' },
    ],
  );
});

test('passes when every cited route exists', () => {
  assert.deepEqual(
    missingRoutes(
      [{ path: 'README.md', text: '`/help/` and `/es/help/cli/`' }],
      new Set(['/help/', '/es/help/cli/']),
    ),
    [],
  );
});

test('living documents are the root ones and docs/, less the directories that record a moment', () => {
  const root = tree({
    'README.md': 'a',
    'AGENTS.md': 'b',
    'docs/self-hosting.md': 'c',
    'docs/reviews/design-review.md': 'quotes /help/api-reference/',
    'docs/deployment/evidence/run.md': 'quotes /help/api-reference/',
    'docs/deployment/runbook.md': 'd',
  });
  assert.deepEqual(
    livingDocuments(root)
      .map(({ path }) => path)
      .sort(),
    ['AGENTS.md', 'README.md', 'docs/deployment/runbook.md', 'docs/self-hosting.md'],
  );
});
