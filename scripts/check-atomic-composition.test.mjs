import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkAtomicComposition,
  checkRegisterEntriesExist,
  checkTierMembership,
  checkImportDirection,
} from './check-atomic-composition.mjs';
import { buildGraph } from './lib/component-graph.mjs';
import { ratchet, unreachableRegisterEntries } from './lib/rule-register.mjs';

const webSrc = fileURLToPath(new URL('../apps/web/src', import.meta.url));

test('the repository passes the atomic-composition gate', () => {
  assert.deepEqual(checkAtomicComposition(webSrc), []);
});

test('R12: no register entry in check-atomic-composition.mjs names a path that does not exist', () => {
  assert.deepEqual(checkRegisterEntriesExist(webSrc), []);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'atomic-composition-'));
  mkdirSync(join(root, 'ui/atoms'), { recursive: true });
  return root;
}

test('R1 reports a file and line for a component sitting outside any declared tier', () => {
  const root = fixture();
  writeFileSync(join(root, 'ui/Loose.tsx'), 'export function Loose() { return <div />; }');

  const { nodes } = buildGraph(root);
  const r1 = checkTierMembership(nodes);
  assert.equal(r1.length, 1);
  assert.equal(r1[0].path, 'ui/Loose.tsx');
  assert.equal(typeof r1[0].line, 'number');
});

test('R2 reports a file and line when an atom imports a screen component', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'ui/atoms/Chip.tsx'),
    "import { Screen } from '../../Screen.js';\nexport function Chip() { return <Screen />; }",
  );
  writeFileSync(join(root, 'Screen.tsx'), 'export function Screen() { return <div />; }');

  const { nodes, edges } = buildGraph(root);
  const r2 = checkImportDirection(nodes, edges);
  assert.equal(r2.length, 1);
  assert.equal(r2[0].path, 'ui/atoms/Chip.tsx');
  assert.equal(r2[0].line, 1);
});

test('R2 still reports an upward import whose statement is split across many lines', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'ui/atoms/Chip.tsx'),
    [
      'import {',
      '  Screen,',
      "} from '../../Screen.js';",
      '',
      'export function Chip() {',
      '  return <Screen />;',
      '}',
    ].join('\n'),
  );
  writeFileSync(join(root, 'Screen.tsx'), 'export function Screen() { return <div />; }');

  const { nodes, edges } = buildGraph(root);
  const r2 = checkImportDirection(nodes, edges);
  assert.equal(r2.length, 1);
  assert.equal(r2[0].path, 'ui/atoms/Chip.tsx');
  assert.equal(r2[0].line, 1); // the `import {` line, where the statement starts
});

test('a molecule may import an organism-tier sibling (downward, into its own tier or lower is fine; same-tier is fine)', () => {
  const root = fixture();
  mkdirSync(join(root, 'ui/molecules'), { recursive: true });
  writeFileSync(
    join(root, 'ui/molecules/A.tsx'),
    "import { B } from './B.js';\nexport function A() { return <B />; }",
  );
  writeFileSync(join(root, 'ui/molecules/B.tsx'), 'export function B() { return <div />; }');

  const { nodes, edges } = buildGraph(root);
  assert.deepEqual(checkTierMembership(nodes), []);
  assert.deepEqual(checkImportDirection(nodes, edges), []);
});

test('a plain data or utility module is not tier-ranked: any tier may import one without violating R2', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'ui/atoms/Chip.tsx'),
    "import { label } from '../../lib/labels.js';\nexport function Chip() { return <div>{label}</div>; }",
  );
  mkdirSync(join(root, 'lib'), { recursive: true });
  writeFileSync(join(root, 'lib/labels.ts'), 'export const label = "chip";');

  const { nodes, edges } = buildGraph(root);
  assert.deepEqual(checkImportDirection(nodes, edges), []);
});

test('a component with no declared tier is not flagged if it is not inside a ui/ directory', () => {
  const root = fixture();
  writeFileSync(join(root, 'Screen.tsx'), 'export function Screen() { return <div />; }');
  const { nodes } = buildGraph(root);
  assert.deepEqual(checkTierMembership(nodes), []);
});

test('ratchet: a new upward-import violation in a path with no register entry fails outright', () => {
  const violations = [{ path: 'ui/atoms/x.tsx', line: 3, message: 'up' }];
  const result = ratchet(violations, new Map(), 'R', 'thing(s)');
  assert.deepEqual(result, violations);
});

test('ratchet: a violation count at or below the recorded allowance is withheld', () => {
  const violations = [
    { path: 'ui/atoms/x.tsx', line: 3, message: 'up' },
    { path: 'ui/atoms/x.tsx', line: 9, message: 'up' },
  ];
  const register = new Map([['ui/atoms/x.tsx', 2]]);
  assert.deepEqual(ratchet(violations, register, 'R', 'thing(s)'), []);
});

test('ratchet: a violation count above the recorded allowance reports only the overflow', () => {
  const violations = [
    { path: 'ui/atoms/x.tsx', line: 3, message: 'up' },
    { path: 'ui/atoms/x.tsx', line: 9, message: 'up' },
    { path: 'ui/atoms/x.tsx', line: 20, message: 'up' },
  ];
  const register = new Map([['ui/atoms/x.tsx', 2]]);
  const result = ratchet(violations, register, 'R', 'thing(s)');
  assert.equal(result.length, 1);
  assert.equal(result[0].line, 20);
});

test('ratchet: an improvement below the recorded count fails until the register is lowered', () => {
  const violations = [{ path: 'ui/atoms/x.tsx', line: 3, message: 'up' }];
  const register = new Map([['ui/atoms/x.tsx', 2]]);
  const result = ratchet(violations, register, 'MY_REGISTER', 'thing(s)');
  assert.equal(result.length, 1);
  assert.match(result[0].message, /now has 1 thing\(s\), fewer than the 2 recorded in MY_REGISTER/);
});

test('R12 fails when a register entry names a path the filesystem does not have', () => {
  const register = new Map([['ui/atoms/gone.tsx', 1]]);
  const exists = (p) => p !== 'ui/atoms/gone.tsx';
  assert.deepEqual(unreachableRegisterEntries(register, exists), ['ui/atoms/gone.tsx']);
});
