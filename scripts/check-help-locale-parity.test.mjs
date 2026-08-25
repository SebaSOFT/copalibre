import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findParityGaps } from './check-help-locale-parity.mjs';

test('full parity across every locale reports no gaps', () => {
  const english = ['index.md', 'control/seeding.md'];
  const locales = ['es', 'fr'];
  const localePages = {
    es: ['index.md', 'control/seeding.md'],
    fr: ['index.md', 'control/seeding.md'],
  };
  const { missing, orphaned } = findParityGaps(english, localePages, locales);
  assert.deepEqual(missing, []);
  assert.deepEqual(orphaned, []);
});

test('one missing page in one locale is named, other locales unaffected', () => {
  const english = ['index.md', 'control/seeding.md'];
  const locales = ['es', 'fr'];
  const localePages = {
    es: ['index.md'],
    fr: ['index.md', 'control/seeding.md'],
  };
  const { missing } = findParityGaps(english, localePages, locales);
  assert.deepEqual(missing, [{ locale: 'es', page: 'control/seeding.md' }]);
});

test('a page present only in a non-English locale is reported as orphaned, not missing', () => {
  const english = ['index.md'];
  const locales = ['es'];
  const localePages = {
    es: ['index.md', 'control/only-in-es.md'],
  };
  const { missing, orphaned } = findParityGaps(english, localePages, locales);
  assert.deepEqual(missing, []);
  assert.deepEqual(orphaned, [{ locale: 'es', page: 'control/only-in-es.md' }]);
});

test('reports every missing pair across multiple locales and pages, not just the first', () => {
  const english = ['a.md', 'b.md'];
  const locales = ['es', 'fr'];
  const localePages = {
    es: [],
    fr: ['a.md'],
  };
  const { missing } = findParityGaps(english, localePages, locales);
  assert.deepEqual(missing, [
    { locale: 'es', page: 'a.md' },
    { locale: 'es', page: 'b.md' },
    { locale: 'fr', page: 'b.md' },
  ]);
});
