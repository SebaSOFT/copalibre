import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractObjectLiteral,
  loadDefineMessagesCatalogue,
  loadFlatCatalogue,
  loadGlossaryTerms,
  buildReport,
} from './i18n-content-review.mjs';

function writeFixture(dir, name, content) {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

test('extractObjectLiteral finds the balanced object literal after a marker', () => {
  const source = "export const x = defineMessages({ a: { id: 'a', defaultMessage: 'A { b }' } });";
  const literal = extractObjectLiteral(source, 'defineMessages(');
  assert.equal(literal, "{ a: { id: 'a', defaultMessage: 'A { b }' } }");
});

test('loadDefineMessagesCatalogue maps message id to English defaultMessage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-review-'));
  const path = writeFixture(
    dir,
    'messages.en.ts',
    `import { defineMessages } from 'react-intl';
export const messages = defineMessages({
  seedingTitle: { id: 'control.seeding.title', defaultMessage: 'Seeding' },
  multiline: {
    id: 'control.multiline',
    defaultMessage:
      'First part of a ' +
      'concatenated string',
  },
});
`,
  );
  const catalogue = loadDefineMessagesCatalogue(path);
  assert.equal(catalogue.get('control.seeding.title'), 'Seeding');
  assert.equal(catalogue.get('control.multiline'), 'First part of a concatenated string');
});

test('loadFlatCatalogue maps message id to translated string', () => {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-review-'));
  const path = writeFixture(
    dir,
    'messages.es.ts',
    `export const messages: Record<string, string> = {
  'control.seeding.title': 'Siembra',
};
`,
  );
  const catalogue = loadFlatCatalogue(path);
  assert.equal(catalogue.get('control.seeding.title'), 'Siembra');
});

test('loadGlossaryTerms extracts backtick-quoted terms from ### headings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-review-'));
  const path = writeFixture(
    dir,
    'glossary.md',
    `# Glossary

### \`seed\` / \`seeding\`

Some text.

### \`alias\`

More text.
`,
  );
  const terms = loadGlossaryTerms(path);
  assert.deepEqual(terms, ['seed', 'seeding', 'alias']);
});

test('buildReport flags the planted bad translation and not the correct one', () => {
  const sourceCatalogue = new Map([
    ['control.seeding.title', 'Seeding'],
    ['control.nav.dashboard', 'Dashboard'],
  ]);
  // 'Semilla' is a literal agricultural mistranslation of the sports term
  // "seed" — exactly the false-friend case the glossary documents.
  const localeCatalogue = new Map([
    ['control.seeding.title', 'Semilla'],
    ['control.nav.dashboard', 'Panel'],
  ]);
  const glossaryTerms = ['seed', 'seeding'];

  // Only the deliberately bad key is supplied as a flag — the correct
  // 'control.nav.dashboard' entry is never included, since this script does
  // not itself judge correctness (see docs/i18n-glossary.md's review
  // workflow); it validates and formats a reviewer-supplied flag list.
  const flags = [
    {
      key: 'control.seeding.title',
      concern: 'Literal agricultural translation of the sports term "seed"',
      proposedReplacement: 'Cabeza de serie',
    },
  ];

  const report = buildReport({
    locale: 'es',
    sourceCatalogue,
    localeCatalogue,
    glossaryTerms,
    flags,
  });

  assert.equal(report.flaggedCount, 1);
  assert.equal(report.entries[0].key, 'control.seeding.title');
  assert.equal(report.entries[0].currentTranslation, 'Semilla');
  assert.equal(report.entries[0].proposedReplacement, 'Cabeza de serie');
  assert.equal(report.entries[0].status, 'unconfirmed');
  assert.ok(report.entries[0].glossaryHits.includes('seed'));
  assert.ok(
    !report.entries.some((entry) => entry.key === 'control.nav.dashboard'),
    'the correct translation must not appear in the report',
  );
});

test('buildReport rejects a flagged key missing from either catalogue', () => {
  const sourceCatalogue = new Map([['control.a', 'A']]);
  const localeCatalogue = new Map([['control.a', 'A traducido']]);
  assert.throws(
    () =>
      buildReport({
        locale: 'es',
        sourceCatalogue,
        localeCatalogue,
        glossaryTerms: [],
        flags: [{ key: 'control.missing', concern: 'x' }],
      }),
    /does not exist in the English source catalogue/,
  );
});
