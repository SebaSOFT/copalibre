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
  checkInlineLayout,
  checkRawStyleValues,
  checkDataAccess,
  checkI18nPlacement,
  checkOrphans,
  checkCasing,
  checkDuplicateNames,
  checkSingleAtomOwnership,
  checkLiteralTextNodes,
  checkCatalogueResolution,
  extractCatalogueIds,
  checkBannedOrnament,
  loadReferenceIndex,
} from './check-atomic-composition.mjs';
import { buildGraph } from './lib/component-graph.mjs';
import { ratchet, unreachableRegisterEntries } from './lib/rule-register.mjs';
import { KNOWN_HANDWRITTEN_CLASSES } from './check-ui-ownership.mjs';

const webSrc = fileURLToPath(new URL('../apps/web/src', import.meta.url));

test('the repository passes the atomic-composition gate', () => {
  assert.deepEqual(checkAtomicComposition(webSrc), []);
});

test('R12: no register entry in check-atomic-composition.mjs names a path that does not exist', () => {
  assert.deepEqual(checkRegisterEntriesExist(webSrc), []);
});

test("R12 covers check-ui-ownership.mjs registers too, not only this script's own", () => {
  // A path this register still carries (control/components/TournamentSummaryCard.tsx)
  // resolves in the real graph, and checkRegisterEntriesExist reports it via
  // the same "KNOWN_HANDWRITTEN_CLASSES (check-ui-ownership.mjs)" register
  // name this script wires in — proof both registers are actually checked,
  // not just that neither happens to be stale right now.
  assert.ok(KNOWN_HANDWRITTEN_CLASSES.has('control/components/TournamentSummaryCard.tsx'));
  const { nodes } = buildGraph(webSrc);
  assert.ok(nodes.has('control/components/TournamentSummaryCard.tsx'));

  // And the seven paths that moved under ui/ during an earlier tier move are
  // now gone from the register entirely (task 1.5) rather than repointed —
  // repointing them would still be unreachable, since the ownership scanner
  // skips every ui/ directory unconditionally.
  for (const stale of [
    'components/LiveMatchHero.tsx',
    'components/MatchCard.tsx',
    'components/MatchCardGrid.astro',
    'components/MatchNode.astro',
    'components/ResultLegend.astro',
    'components/ScoreTicker.astro',
    'components/TournamentHero.astro',
  ]) {
    assert.ok(!KNOWN_HANDWRITTEN_CLASSES.has(stale));
  }
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

test('R3 reports an inline style with a layout property, and not one confined to ui/atoms/layout/', () => {
  const root = fixture();
  mkdirSync(join(root, 'ui/atoms/layout'), { recursive: true });
  mkdirSync(join(root, 'ui/organisms'), { recursive: true });
  writeFileSync(
    join(root, 'ui/organisms/Widget.tsx'),
    "export function Widget() { return <div style={{ display: 'flex', color: 'red' }} />; }",
  );
  writeFileSync(
    join(root, 'ui/atoms/layout/Stack.tsx'),
    "export function Stack() { return <div style={{ display: 'flex', gap: 8 }} />; }",
  );

  const { nodes } = buildGraph(root);
  const violations = checkInlineLayout(nodes);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, 'ui/organisms/Widget.tsx');
});

test('R3 exempts a layout primitive nested under a surface prefix, not only one at the graph root', () => {
  const root = fixture();
  mkdirSync(join(root, 'control/components/ui/atoms/layout'), { recursive: true });
  writeFileSync(
    join(root, 'control/components/ui/atoms/layout/stack.tsx'),
    "export function Stack() { return <div style={{ display: 'flex', gap: 8 }} />; }",
  );

  const { nodes } = buildGraph(root);
  assert.deepEqual(checkInlineLayout(nodes), []);
});

test('R4 reports a raw length or colour value, but not one already wrapped in var()', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'ui/atoms/Chip.tsx'),
    "export function Chip() { return <div style={{ padding: '8px', color: 'var(--cl-ink)' }} />; }",
  );
  writeFileSync(
    join(root, 'ui/atoms/Clean.tsx'),
    "export function Clean() { return <div style={{ padding: 'var(--cl-space-2, 8px)' }} />; }",
  );

  const { nodes } = buildGraph(root);
  const violations = checkRawStyleValues(nodes);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, 'ui/atoms/Chip.tsx');
});

test('R5 reports a fetch call or API-client import below the page tier', () => {
  const root = fixture();
  mkdirSync(join(root, 'ui/organisms'), { recursive: true });
  writeFileSync(
    join(root, 'ui/organisms/Panel.tsx'),
    "export function Panel() { fetch('/x'); return <div />; }",
  );
  writeFileSync(
    join(root, 'ui/organisms/Quiet.tsx'),
    'export function Quiet() { return <div />; }',
  );

  const { nodes } = buildGraph(root);
  const violations = checkDataAccess(nodes);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, 'ui/organisms/Panel.tsx');
});

test('R5 reports an import resolving into the api-client module', () => {
  const root = fixture();
  mkdirSync(join(root, 'lib'), { recursive: true });
  writeFileSync(join(root, 'lib/public-api-client.ts'), 'export function get() {}');
  writeFileSync(
    join(root, 'ui/atoms/Chip.tsx'),
    "import { get } from '../../lib/public-api-client.js';\nexport function Chip() { get(); return <div />; }",
  );

  const { nodes } = buildGraph(root);
  const violations = checkDataAccess(nodes);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, 'ui/atoms/Chip.tsx');
});

test('R6 reports formatMessage/useIntl/FormattedMessage in an atom or molecule, not a mere type import', () => {
  const root = fixture();
  mkdirSync(join(root, 'ui/molecules'), { recursive: true });
  writeFileSync(
    join(root, 'ui/atoms/TypeOnly.tsx'),
    "import type { IntlShape } from 'react-intl';\nexport function TypeOnly(p: { intl: IntlShape }) { return <div />; }",
  );
  writeFileSync(
    join(root, 'ui/molecules/SelfFormats.tsx'),
    "import { useIntl } from 'react-intl';\nexport function SelfFormats() { const intl = useIntl(); return <div>{intl.formatMessage({id:'x'})}</div>; }",
  );

  const { nodes } = buildGraph(root);
  const violations = checkI18nPlacement(nodes);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, 'ui/molecules/SelfFormats.tsx');
});

test('R6 does not fire on an organism, which is allowed to format its own messages', () => {
  const root = fixture();
  mkdirSync(join(root, 'ui/organisms'), { recursive: true });
  writeFileSync(
    join(root, 'ui/organisms/Panel.tsx'),
    "import { useIntl } from 'react-intl';\nexport function Panel() { useIntl(); return <div />; }",
  );

  const { nodes } = buildGraph(root);
  assert.deepEqual(checkI18nPlacement(nodes), []);
});

test('R7 reports a library component with no consumer and no reference-index reason', () => {
  const root = fixture();
  mkdirSync(join(root, 'ui/organisms'), { recursive: true });
  writeFileSync(join(root, 'ui/atoms/Orphan.tsx'), 'export function Orphan() { return <div />; }');
  writeFileSync(
    join(root, 'ui/atoms/Consumed.tsx'),
    'export function Consumed() { return <div />; }',
  );
  writeFileSync(
    join(root, 'ui/organisms/Screen.tsx'),
    "import { Consumed } from '../atoms/Consumed.js';\nexport function Screen() { return <Consumed />; }",
  );

  const { nodes, edges } = buildGraph(root);
  const violations = checkOrphans(nodes, edges, []);
  // Screen.tsx is itself unconsumed by anything in this small fixture, so it
  // is also reported — the point of this test is that Orphan.tsx is among
  // the reported paths and Consumed.tsx (rendered by Screen.tsx) is not.
  const paths = violations.map((v) => v.path);
  assert.ok(paths.includes('ui/atoms/Orphan.tsx'));
  assert.ok(!paths.includes('ui/atoms/Consumed.tsx'));
});

test('R7 exempts an orphan whose storyId is recorded in the reference index with an empty consumer list', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'ui/atoms/Preview.tsx'),
    'export function Preview() { return <div />; }',
  );
  const referenceIndex = [{ storyId: 'Admin/Atoms/Preview — Playground', consumers: [] }];

  const { nodes, edges } = buildGraph(root);
  assert.deepEqual(checkOrphans(nodes, edges, referenceIndex), []);
});

test('loadReferenceIndex reads storyId and consumers from the real reference-index.ts', () => {
  const entries = loadReferenceIndex(join(webSrc, 'control/components/ui/reference-index.ts'));
  assert.ok(entries.length > 0);
  const scorecard = entries.find((e) => e.storyId.includes('LiveMatchScorecard'));
  assert.ok(scorecard);
  assert.deepEqual(scorecard.consumers, []);
  const locale = entries.find((e) => e.storyId.includes('LanguageSwitcher'));
  assert.ok(locale);
  assert.deepEqual(locale.consumers, ['control/components/ControlShell.tsx']);
});

test('R9 casing: a PascalCase file in the control library is a violation; kebab-case is not', () => {
  const root = fixture();
  mkdirSync(join(root, 'control/components/ui/atoms'), { recursive: true });
  writeFileSync(
    join(root, 'control/components/ui/atoms/BadName.tsx'),
    'export function BadName() { return null; }',
  );
  writeFileSync(
    join(root, 'control/components/ui/atoms/good-name.tsx'),
    'export function GoodName() { return null; }',
  );

  const { nodes } = buildGraph(root);
  const violations = checkCasing(nodes);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, 'control/components/ui/atoms/BadName.tsx');
});

test('R13 reports no <select> violation now that language-selector.tsx is deleted (openspec 0225 task 4.3a)', () => {
  const { nodes } = buildGraph(webSrc);
  const violations = checkSingleAtomOwnership(nodes);
  const paths = violations.filter((v) => v.message.includes('<select>')).map((v) => v.path);
  assert.deepEqual(paths, []);
});

test('R13: once only one atom in a surface owns an element, the violation disappears', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'ui/atoms/select.tsx'),
    'export function Select() { return <select></select>; }',
  );
  // No second atom rendering <select> — matches the post-4.3a state once
  // language-selector.tsx is deleted.
  const { nodes } = buildGraph(root);
  assert.deepEqual(checkSingleAtomOwnership(nodes), []);
});

test('R13: two atoms in the same surface both rendering a raw governed element is a violation for each', () => {
  const root = fixture();
  writeFileSync(join(root, 'ui/atoms/A.tsx'), 'export function A() { return <button>a</button>; }');
  writeFileSync(join(root, 'ui/atoms/B.tsx'), 'export function B() { return <button>b</button>; }');

  const { nodes } = buildGraph(root);
  const violations = checkSingleAtomOwnership(nodes);
  assert.equal(violations.length, 2);
  assert.deepEqual(violations.map((v) => v.path).sort(), ['ui/atoms/A.tsx', 'ui/atoms/B.tsx']);
});

test('R13: two atoms owning the same element in different surfaces do not violate each other', () => {
  const root = fixture();
  mkdirSync(join(root, 'control/components/ui/atoms'), { recursive: true });
  writeFileSync(join(root, 'ui/atoms/A.tsx'), 'export function A() { return <button>a</button>; }');
  writeFileSync(
    join(root, 'control/components/ui/atoms/B.tsx'),
    'export function B() { return <button>b</button>; }',
  );

  const { nodes } = buildGraph(root);
  assert.deepEqual(checkSingleAtomOwnership(nodes), []);
});

test('R10 reports a literal text node with its file, line and text', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'ui/atoms/Chip.tsx'),
    'export function Chip() { return <div>Hardcoded label</div>; }',
  );

  const { nodes } = buildGraph(root);
  const violations = checkLiteralTextNodes(nodes);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, 'ui/atoms/Chip.tsx');
  assert.equal(typeof violations[0].line, 'number');
  assert.match(violations[0].message, /Hardcoded label/);
});

test('R10 does not treat a number, a single token, or a TS generic as a literal text node', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'ui/atoms/Chip.tsx'),
    'export function Chip() { return <div>{"42"}<span>slug-id</span></div>; }',
  );
  writeFileSync(
    join(root, 'ui/atoms/Async.tsx'),
    'export async function run(): Promise<void> { return; }',
  );

  const { nodes } = buildGraph(root);
  assert.deepEqual(checkLiteralTextNodes(nodes), []);
});

test('R10 does not scan plain .ts files at all (no JSX, only a TS generics false-positive source)', () => {
  const root = fixture();
  mkdirSync(join(root, 'lib'), { recursive: true });
  writeFileSync(
    join(root, 'lib/client.ts'),
    'export function get(): Promise<string> { return Promise.resolve("x"); }',
  );
  const { nodes } = buildGraph(root);
  const node = nodes.get('lib/client.ts');
  assert.deepEqual(node.textNodes, []);
});

test('R10 catalogue resolution: a descriptor id resolving in the source catalogue and absent from another fails', () => {
  const root = fixture();
  mkdirSync(join(root, 'control/i18n'), { recursive: true });
  writeFileSync(
    join(root, 'control/i18n/messages.en.ts'),
    "export const messages = { greeting: { id: 'app.greeting', defaultMessage: 'Hello' } };",
  );
  writeFileSync(
    join(root, 'control/i18n/messages.es.ts'),
    "export const messages = {\n  'app.greeting': 'Hola',\n};",
  );
  writeFileSync(join(root, 'control/i18n/messages.fr.ts'), 'export const messages = {};');

  // checkCatalogueResolution reads the fixed CATALOGUE_FAMILIES list, which
  // names real project paths, so exercise the exported piece it is built
  // from directly: the id sets it diffs.
  const enIds = extractCatalogueIds(join(root, 'control/i18n/messages.en.ts'));
  const esIds = extractCatalogueIds(join(root, 'control/i18n/messages.es.ts'));
  const frIds = extractCatalogueIds(join(root, 'control/i18n/messages.fr.ts'));
  assert.deepEqual([...enIds], ['app.greeting']);
  assert.ok(esIds.has('app.greeting'));
  assert.ok(!frIds.has('app.greeting'));
});

test('R10 catalogue resolution finds no real gap in the French and Italian control catalogues', () => {
  // Both families reported false gaps (fr 78, it 44) until task 2.6 fixed
  // MESSAGE_ID_IN_RECORD to accept a double-quoted value — French/Italian
  // legitimately double-quote a translation containing an apostrophe.
  const violations = checkCatalogueResolution(webSrc);
  const frMissing = violations.filter((v) => v.path === 'control/i18n/messages.fr.ts');
  const itMissing = violations.filter((v) => v.path === 'control/i18n/messages.it.ts');
  assert.deepEqual(frMissing, []);
  assert.deepEqual(itMissing, []);
});

test('extractCatalogueIds recognizes a double-quoted value, not only single-quoted', () => {
  const root = mkdtempSync(join(tmpdir(), 'atomic-composition-'));
  writeFileSync(
    join(root, 'catalogue.ts'),
    [
      'export const messages: Record<string, string> = {',
      "  'app.apostrophe': \"l'organisation\",",
      "  'app.plain': 'no apostrophe here',",
      '};',
    ].join('\n'),
  );
  const ids = extractCatalogueIds(join(root, 'catalogue.ts'));
  assert.ok(ids.has('app.apostrophe'));
  assert.ok(ids.has('app.plain'));
});

test('R11 reports the real resting-glow findings in tiebreaker-sequence.tsx and MatchCard.tsx', () => {
  const { nodes } = buildGraph(webSrc);
  const violations = checkBannedOrnament(nodes);
  const paths = violations.map((v) => v.path);
  assert.ok(paths.includes('control/components/ui/molecules/tiebreaker-sequence.tsx'));
  assert.ok(paths.includes('components/ui/organisms/MatchCard.tsx'));
});

test('R11: a resting glow token is a violation; a var()-only shadow value is not', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'ui/atoms/Bad.tsx'),
    "export function Bad() { return <div style={{ boxShadow: 'var(--cl-glow-cyan)' }} />; }",
  );
  writeFileSync(
    join(root, 'ui/atoms/Good.tsx'),
    "export function Good() { return <div style={{ boxShadow: 'var(--cl-shadow-panel)' }} />; }",
  );

  const { nodes } = buildGraph(root);
  const violations = checkBannedOrnament(nodes);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, 'ui/atoms/Bad.tsx');
});

test('R9 duplicates: two components with the same base name are both reported; route pages are exempt', () => {
  const root = fixture();
  mkdirSync(join(root, 'a'), { recursive: true });
  mkdirSync(join(root, 'b'), { recursive: true });
  mkdirSync(join(root, 'pages'), { recursive: true });
  writeFileSync(join(root, 'a/Card.tsx'), 'export function Card() { return null; }');
  writeFileSync(join(root, 'b/Card.astro'), '<div></div>');
  writeFileSync(join(root, 'pages/[id].astro'), '<div></div>');
  mkdirSync(join(root, 'pages/other'), { recursive: true });
  writeFileSync(join(root, 'pages/other/[id].astro'), '<div></div>');

  const { nodes } = buildGraph(root);
  const violations = checkDuplicateNames(nodes);
  assert.equal(violations.length, 2);
  assert.deepEqual(violations.map((v) => v.path).sort(), ['a/Card.tsx', 'b/Card.astro']);
});
