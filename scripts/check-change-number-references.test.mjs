import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findCitations,
  isExemptPath,
  isWorkflowDocumentation,
  migrationNames,
  numberedFileName,
} from './check-change-number-references.mjs';

// Fixtures are assembled from pieces so this file does not itself contain a
// citation the guard would report.
const num = (value) => String(value).padStart(4, '0');
const spec = (digits) => `open${'spec'} ${num(digits)}`;

const kinds = (text, path = 'apps/api/src/example.ts', migrations = new Set()) =>
  findCitations(path, text, migrations).map((finding) => finding.kind);

test('reports "openspec NNNN" and "change NNNN" citations', () => {
  assert.deepEqual(kinds(`// ${spec(166)}: the audit trail`), ['"openspec NNNN"']);
  assert.deepEqual(kinds(`// introduced by change ${num(166)}`), ['"change NNNN"']);
});

test('reports parenthesised, possessive and phase citations', () => {
  assert.deepEqual(kinds(`// the thing (${num(166)})`), ['"(NNNN)"']);
  assert.deepEqual(kinds(`// ${num(166)}'s evaluator`), ['"NNNN\'s"']);
  assert.deepEqual(kinds(`// lands with phase ${num(14)}`), ['"phase NNNN"']);
});

test('reports a numbered change directory name', () => {
  assert.deepEqual(kinds(`See ${num(34)}-k3s-helm-deployment for the contract`), [
    'numbered change name',
  ]);
});

test('reports a test-title or comment label such as "NNNN: ..."', () => {
  assert.deepEqual(kinds(`test('${num(201)}: the overlay is transparent', () => {})`), [
    '"NNNN: " label',
  ]);
  assert.deepEqual(kinds(`// ${num(223)} — standings panel chrome`), ['"// NNNN — " label']);
});

test('does not report bare four-digit values that are not citations', () => {
  const clean = [
    'const port = 4331;',
    "name: 'Apertura 0066',",
    'chmod 0600 file',
    'const year = 2026;',
    'sample text Aa 0123',
    'Dates like 2026-10-08 and versions like 1.2.6',
  ];
  for (const line of clean) assert.deepEqual(kinds(line), [], line);
});

test('a slug matching a tracked migration is not a change citation', () => {
  const migrations = migrationNames([
    'packages/persistence/src/migrations/0001-initial-schema.ts',
    'apps/api/src/app.ts',
  ]);
  assert.deepEqual(
    kinds('example: 0001-initial-schema', 'apps/api/src/dto/health.dto.ts', migrations),
    [],
  );
});

test('exempt paths are never scanned', () => {
  assert.equal(isExemptPath('CHANGELOG.md'), true);
  assert.equal(isExemptPath('packages/persistence/src/migrations/0001-initial-schema.ts'), true);
  assert.equal(isExemptPath('yarn.lock'), true);
  assert.deepEqual(kinds(`- ${spec(234)}`, 'CHANGELOG.md'), []);
});

test('a tracked file name starting with a change number fails, a migration does not', () => {
  assert.equal(numberedFileName(`docs/reviews/${num(222)}-owned-control-coverage.md`), true);
  assert.equal(numberedFileName(`docs/assets/screenshots/${num(239)}-bracket.png`), true);
  assert.equal(numberedFileName('docs/reviews/owned-control-coverage.md'), false);
  assert.equal(
    numberedFileName('packages/persistence/src/migrations/0001-initial-schema.ts'),
    false,
  );
});

test('reports a numbered change name embedded in a path', () => {
  assert.deepEqual(kinds(`path: 'docs/assets/screenshots/${num(240)}-series-progress.png'`), [
    'numbered change name',
  ]);
});

test('reports a task number cited as a source', () => {
  const task = (label, number) => `${label} ${number}`;
  assert.deepEqual(kinds(`// the paydown described in ${task('task', '5.1')}`), ['task number']);
  assert.deepEqual(kinds(`describe('upload flow (${task('Task', '3.2')})', () => {})`), [
    'task number',
  ]);
});

test('reports a change planning document cited as a source', () => {
  const document = (name) => `${name}.md`;
  assert.deepEqual(kinds(`// see ${document('design')}'s decision`), ['change planning document']);
  assert.deepEqual(kinds(`// listed in ${document('tasks')}`), ['change planning document']);
  assert.deepEqual(kinds(`// per ${document('proposal')}`), ['change planning document']);
});

test('the product design document and paths to files of that name are not citations', () => {
  assert.deepEqual(kinds('// the colours come from DESIGN.md'), []);
  assert.deepEqual(kinds('see docs/design.md for the layout'), []);
  assert.deepEqual(kinds('const path = new URL(`../../DESIGN.md`, import.meta.url);'), []);
});

test('runtime uses of the word "task" are not citations', () => {
  const clean = [
    'queue a task for the worker',
    'task 3 of 5 finished',
    'the scheduler runs each task once',
    'Task completed in 1.5s',
  ];
  for (const line of clean) assert.deepEqual(kinds(line), [], line);
});

test('workflow documentation may name the planning documents', () => {
  const text = `Check the boxes in the change's ${'tasks'}.md`;
  assert.equal(isWorkflowDocumentation('AGENTS.md'), true);
  assert.equal(isWorkflowDocumentation('.github/pull_request_template.md'), true);
  assert.equal(isWorkflowDocumentation('openspec/config.yaml'), true);
  assert.equal(isWorkflowDocumentation('apps/web/src/example.ts'), false);
  assert.deepEqual(kinds(text, 'AGENTS.md'), []);
  assert.deepEqual(kinds(text, 'apps/web/src/example.ts'), ['change planning document']);
});

test('workflow documentation is still held to the change-number rule', () => {
  assert.deepEqual(kinds(`// ${spec(166)}`, 'AGENTS.md'), ['"openspec NNNN"']);
});

test('reports the line number of each finding', () => {
  const findings = findCitations('a.ts', `ok\nok\n// ${spec(5)}\n`);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
});
