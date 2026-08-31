import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESCRIPTOR_FIELD_EXPLANATIONS, DISCIPLINE_DESCRIPTOR_SCHEMA } from '@copalibre/domain';
import {
  fieldsMissingExplanations,
  orphanedExplanationKeys,
  schemaFieldNames,
} from './check-descriptor-guide-coverage.mjs';

test('schemaFieldNames lists every top-level property the schema declares', () => {
  const names = schemaFieldNames({ properties: { a: {}, b: {} } });
  assert.deepEqual(names, ['a', 'b']);
});

test('fieldsMissingExplanations reports a field with no entry', () => {
  const missing = fieldsMissingExplanations(['a', 'b'], { a: 'explains a' });
  assert.deepEqual(missing, ['b']);
});

test('fieldsMissingExplanations reports a field whose entry is empty or blank', () => {
  const missing = fieldsMissingExplanations(['a', 'b'], { a: 'explains a', b: '   ' });
  assert.deepEqual(missing, ['b']);
});

test('orphanedExplanationKeys reports a key naming a field that no longer exists', () => {
  const orphaned = orphanedExplanationKeys(['a', 'removed.nested', 'a.child'], ['a']);
  assert.deepEqual(orphaned, ['removed.nested']);
});

test('orphanedExplanationKeys accepts nested dot and array-item keys of a real field', () => {
  const orphaned = orphanedExplanationKeys(['a', 'a.child', 'a[].item'], ['a']);
  assert.deepEqual(orphaned, []);
});

// 5.1-adjacent — the real schema and the real explanations map, proving the
// gap this change closes is actually closed.
test('every real top-level schema field has a non-empty explanation, and no explanation is orphaned', () => {
  const fieldNames = schemaFieldNames(DISCIPLINE_DESCRIPTOR_SCHEMA);
  assert.deepEqual(fieldsMissingExplanations(fieldNames, DESCRIPTOR_FIELD_EXPLANATIONS), []);
  assert.deepEqual(
    orphanedExplanationKeys(Object.keys(DESCRIPTOR_FIELD_EXPLANATIONS), fieldNames),
    [],
  );
});
