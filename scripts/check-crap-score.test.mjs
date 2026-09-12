import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import {
  THRESHOLD,
  KNOWN_CRAP,
  collectFunctions,
  coverageOf,
  crapScore,
  checkWorkspace,
  findWorkspaces,
} from './check-crap-score.mjs';

function parse(code) {
  return ts.createSourceFile('fixture.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function firstFunction(code) {
  return collectFunctions(parse(code))[0];
}

test('a straight-line function has complexity 1', () => {
  const fn = firstFunction('function f() { return 1; }');
  assert.equal(fn.complexity, 1);
});

test('an if statement adds 1', () => {
  const fn = firstFunction('function f(x) { if (x) { return 1; } return 0; }');
  assert.equal(fn.complexity, 2);
});

test('a conditional expression adds 1', () => {
  const fn = firstFunction('function f(x) { return x ? 1 : 0; }');
  assert.equal(fn.complexity, 2);
});

test('a case clause adds 1 per case', () => {
  const fn = firstFunction(
    'function f(x) { switch (x) { case 1: return 1; case 2: return 2; default: return 0; } }',
  );
  assert.equal(fn.complexity, 3);
});

test('a catch clause adds 1', () => {
  const fn = firstFunction('function f() { try { g(); } catch (e) { return 0; } }');
  assert.equal(fn.complexity, 2);
});

test('loop statements each add 1', () => {
  const fn = firstFunction(
    'function f(xs) { for (const x of xs) { } while (true) { break; } return 0; }',
  );
  assert.equal(fn.complexity, 3);
});

test('logical operators each add 1', () => {
  const fn = firstFunction('function f(a, b, c) { return (a && b) || (c ?? a); }');
  assert.equal(fn.complexity, 4);
});

test('a nested function does not inflate its parent complexity', () => {
  const fns = collectFunctions(
    parse('function outer() { const inner = () => { if (true) return 1; }; return inner(); }'),
  );
  const outer = fns.find((fn) => fn.identity === 'outer');
  const inner = fns.find((fn) => fn.identity !== 'outer');
  assert.equal(outer.complexity, 1);
  assert.equal(inner.complexity, 2);
});

test('a function assigned to a property takes that property as its name', () => {
  const fns = collectFunctions(parse('export const widget = { onClick: () => doThing() };'));
  assert.equal(fns[0].identity, 'onClick');
});

test('a truly anonymous function falls back to its nearest named ancestor', () => {
  const fns = collectFunctions(
    parse('export const handlers = [function () { return 1; }, function () { return 2; }];'),
  );
  assert.deepEqual(
    fns.map((fn) => fn.identity),
    ['handlers.0', 'handlers.1'],
  );
});

test('anonymous-function identity is stable across a pure reformat', () => {
  const before = collectFunctions(
    parse('export const widget = {\n  onClick: () => doThing(),\n  onHover: () => other(),\n};'),
  );
  const after = collectFunctions(
    parse(
      [
        '',
        '',
        'export const widget = {',
        '  onClick: () => doThing(),',
        '  onHover: () => other(),',
        '};',
      ].join('\n'),
    ),
  );
  assert.deepEqual(
    before.map((fn) => fn.identity),
    after.map((fn) => fn.identity),
  );
});

function istanbulEntry({ statements, branches = [] }) {
  const statementMap = {};
  const s = {};
  statements.forEach(([line, hit], index) => {
    statementMap[index] = { start: { line, column: 0 }, end: { line, column: 10 } };
    s[index] = hit;
  });
  const branchMap = {};
  const b = {};
  branches.forEach(([line, hits], index) => {
    branchMap[index] = {
      loc: { start: { line, column: 0 }, end: { line, column: 10 } },
      locations: hits.map(() => ({})),
    };
    b[index] = hits;
  });
  return { statementMap, s, branchMap, b };
}

test('a fully covered function scores a coverage ratio of 1', () => {
  const entry = istanbulEntry({
    statements: [
      [2, 1],
      [3, 1],
    ],
  });
  assert.equal(coverageOf(entry, 1, 5), 1);
});

test('a fully uncovered function scores a coverage ratio of 0', () => {
  const entry = istanbulEntry({
    statements: [
      [2, 0],
      [3, 0],
    ],
  });
  assert.equal(coverageOf(entry, 1, 5), 0);
});

test('coverage mixes statement and branch units', () => {
  const entry = istanbulEntry({
    statements: [[2, 1]],
    branches: [[3, [1, 0]]],
  });
  // 1 covered statement + 1 covered branch location out of 3 total units
  assert.equal(coverageOf(entry, 1, 5), 2 / 3);
});

test('a function outside the entry span contributes no units and counts as covered', () => {
  const entry = istanbulEntry({ statements: [[100, 0]] });
  assert.equal(coverageOf(entry, 1, 5), 1);
});

test('the CRAP formula matches direct calculation', () => {
  assert.equal(crapScore(5, 0.5), 5 ** 2 * (1 - 0.5) ** 3 + 5);
  assert.equal(crapScore(1, 1), 1);
  assert.equal(crapScore(10, 0), 10 ** 2 + 10);
});

function makeWorkspace({ name, files }) {
  const dir = mkdtempSync(join(tmpdir(), 'crap-check-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }));
  const coverage = {};
  for (const [relPath, { source, entry }] of Object.entries(files)) {
    const absPath = join(dir, relPath);
    mkdirSync(join(absPath, '..'), { recursive: true });
    writeFileSync(absPath, source);
    coverage[absPath] = entry;
  }
  mkdirSync(join(dir, 'coverage'), { recursive: true });
  writeFileSync(join(dir, 'coverage', 'coverage-final.json'), JSON.stringify(coverage));
  return dir;
}

test('a workspace with no coverage-final.json is skipped with a warning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crap-check-empty-'));
  try {
    const result = checkWorkspace('@fixture/empty', dir);
    assert.deepEqual(result.offenders, []);
    assert.match(result.warning, /no coverage-final\.json yet, skipping/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a new high-complexity, zero-coverage function fails', () => {
  const source = [
    'export function risky(a, b, c, d, e) {',
    '  if (a) return 1;',
    '  if (b) return 2;',
    '  if (c) return 3;',
    '  if (d) return 4;',
    '  if (e) return 5;',
    '  return 0;',
    '}',
  ].join('\n');
  const entry = istanbulEntry({
    statements: [
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
      [6, 0],
      [7, 0],
    ],
  });
  const dir = makeWorkspace({
    name: '@fixture/offender',
    files: { 'src/risky.ts': { source, entry } },
  });
  try {
    const result = checkWorkspace('@fixture/offender', dir);
    assert.equal(result.offenders.length, 1);
    assert.match(result.offenders[0].key, /#risky$/);
    assert.match(result.offenders[0].reason, /new function above threshold/);
    assert.ok(result.offenders[0].score > THRESHOLD);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a registered function whose score has not risen does not fail', () => {
  const source = 'export function stable(a) {\n  if (a) return 1;\n  return 0;\n}';
  const entry = istanbulEntry({
    statements: [
      [2, 0],
      [3, 1],
    ],
  });
  const dir = makeWorkspace({
    name: '@fixture/stable',
    files: { 'src/stable.ts': { source, entry } },
  });
  const key = '@fixture/stable/src/stable.ts#stable';
  const recorded = crapScore(2, 0.5);
  KNOWN_CRAP.set(key, Math.round(recorded * 100) / 100);
  try {
    const result = checkWorkspace('@fixture/stable', dir);
    assert.deepEqual(result.offenders, []);
  } finally {
    KNOWN_CRAP.delete(key);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a registered function whose score has risen fails as regressed', () => {
  const source = 'export function worse(a) {\n  if (a) return 1;\n  return 0;\n}';
  const entry = istanbulEntry({
    statements: [
      [2, 0],
      [3, 0],
    ],
  });
  const dir = makeWorkspace({
    name: '@fixture/worse',
    files: { 'src/worse.ts': { source, entry } },
  });
  const key = '@fixture/worse/src/worse.ts#worse';
  KNOWN_CRAP.set(key, 0);
  try {
    const result = checkWorkspace('@fixture/worse', dir);
    assert.equal(result.offenders.length, 1);
    assert.match(result.offenders[0].reason, /regressed from recorded/);
  } finally {
    KNOWN_CRAP.delete(key);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('findWorkspaces discovers apps/* and packages/* directories with a package.json', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'crap-check-repo-'));
  try {
    writeFileSync(
      join(repoRoot, 'package.json'),
      JSON.stringify({ workspaces: ['apps/*', 'packages/*'] }),
    );
    mkdirSync(join(repoRoot, 'apps', 'demo'), { recursive: true });
    writeFileSync(
      join(repoRoot, 'apps', 'demo', 'package.json'),
      JSON.stringify({ name: '@fixture/demo' }),
    );
    mkdirSync(join(repoRoot, 'packages', 'not-a-workspace'), { recursive: true });

    const workspaces = findWorkspaces(repoRoot);
    assert.deepEqual(
      workspaces.map((w) => w.name),
      ['@fixture/demo'],
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
