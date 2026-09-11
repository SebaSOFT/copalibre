import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkFileOwnership,
  checkStoryCoverage,
  scanEverySurface,
  checkScreenStoryCoverage,
  SCREEN_STORY_EXCLUSIONS,
} from './check-ui-ownership.mjs';

test('recursive story coverage includes every React surface in the repository', () => {
  const root = fileURLToPath(new URL('../apps/web/src', import.meta.url));
  assert.deepEqual(checkScreenStoryCoverage(root), []);
});

test('screens require stories based on the filesystem, excluding categories (design.md)', () => {
  const root = mkdtempSync(join(tmpdir(), 'screen-coverage-'));
  writeFileSync(join(root, 'Uncovered.tsx'), 'export function Uncovered() { return null; }');
  const violations = checkScreenStoryCoverage(root);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /Uncovered\.tsx has no Uncovered\.stories\.tsx/);

  writeFileSync(join(root, 'Uncovered.stories.tsx'), 'export default {};');
  assert.deepEqual(checkScreenStoryCoverage(root), []);
});

test('excluded categories require no story: routers, providers, and test fixtures', () => {
  const root = mkdtempSync(join(tmpdir(), 'screen-exclusions-'));
  const components = join(root, 'control/components');
  const i18n = join(root, 'control/i18n');
  mkdirSync(components, { recursive: true });
  mkdirSync(i18n, { recursive: true });
  // Category (b): Routers or route tables
  writeFileSync(join(components, 'ControlRoutes.tsx'), 'export function ControlRoutes() {}');
  writeFileSync(join(components, 'NativeAuthRoutes.tsx'), 'export function NativeAuthRoutes() {}');
  writeFileSync(
    join(components, 'ControlOrNotFound.tsx'),
    'export function ControlOrNotFound() {}',
  );
  // Category (c): Context providers and composition roots
  writeFileSync(join(components, 'ControlApp.tsx'), 'export function ControlApp() {}');
  writeFileSync(join(components, 'ToastProvider.tsx'), 'export function ToastProvider() {}');
  writeFileSync(join(i18n, 'ControlIntl.tsx'), 'export function ControlIntl() {}');
  // Category (a): Test and fixture modules
  writeFileSync(join(root, 'screen-story-fixtures.tsx'), 'export const fixtures = {};');

  assert.deepEqual(checkScreenStoryCoverage(root), []);
});

test('nested screens on every surface fail without a sibling story, including route directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'nested-screen-coverage-'));
  const directories = [
    'control/components/nested',
    'components/public/nested',
    'components/tv/nested',
    'pages/nested',
  ];
  for (const directory of directories) {
    mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, directory, 'Screen.tsx'), 'export function Screen() { return null; }');
    writeFileSync(join(root, directory, 'page.astro'), '<main />');
  }
  assert.deepEqual(
    checkScreenStoryCoverage(root)
      .map(({ component }) => component)
      .sort(),
    directories.map((directory) => `${directory}/Screen.tsx`).sort(),
  );
  for (const directory of directories) {
    writeFileSync(join(root, directory, 'Screen.stories.tsx'), 'export default {};');
  }
  assert.deepEqual(checkScreenStoryCoverage(root), []);
});

test('router, provider and deferred exemptions do not leak to same-named screens elsewhere', () => {
  const root = mkdtempSync(join(tmpdir(), 'path-story-coverage-'));
  const deferred = 'control/components/Deferred.tsx';
  SCREEN_STORY_EXCLUSIONS.cannotRenderHonestly.set(deferred, 'Requires live tournament state');
  try {
    for (const path of ['control/components', 'components/tv']) {
      mkdirSync(join(root, path), { recursive: true });
      for (const name of ['ControlRoutes', 'ToastProvider', 'Deferred']) {
        writeFileSync(
          join(root, path, `${name}.tsx`),
          `export function ${name}() { return null; }`,
        );
      }
    }
    assert.deepEqual(
      checkScreenStoryCoverage(root)
        .map(({ component }) => component)
        .sort(),
      [
        'components/tv/ControlRoutes.tsx',
        'components/tv/Deferred.tsx',
        'components/tv/ToastProvider.tsx',
      ],
    );
  } finally {
    SCREEN_STORY_EXCLUSIONS.cannotRenderHonestly.delete(deferred);
  }
});

test('nested library stories are required on each surface without counting ui support modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'nested-library-coverage-'));
  for (const surface of ['control/components', 'components', 'components/tv']) {
    const ui = join(root, surface, 'ui');
    mkdirSync(join(ui, 'atoms/nested'), { recursive: true });
    writeFileSync(join(ui, 'story-matrix.tsx'), 'export function Matrix() { return null; }');
    writeFileSync(join(ui, 'atoms/nested/Thing.tsx'), 'export function Thing() { return null; }');
  }
  assert.equal(checkScreenStoryCoverage(root).length, 3);
  for (const surface of ['control/components', 'components', 'components/tv']) {
    const ui = join(root, surface, 'ui');
    assert.equal(checkStoryCoverage(ui)[0].component, 'atoms/nested/Thing.tsx');
    writeFileSync(join(ui, 'atoms/nested/Thing.stories.tsx'), 'export default {};');
  }
  assert.deepEqual(checkScreenStoryCoverage(root), []);
});

test('valid component with owned primitives reports zero violations', () => {
  const cleanCode = `
    import { Button } from './ui/atoms/button.js';
    import { Input } from './ui/atoms/input.js';
    import { Checkbox } from './ui/atoms/checkbox.js';
    import { FilePicker } from './ui/atoms/file-picker.js';
    import { RadioGroup, RadioGroupItem } from './ui/atoms/radio.js';
    import { Modal } from './ui/organisms/modal.js';
    import { DataTable } from './ui/organisms/data-table.js';
    import { Textarea } from './ui/atoms/textarea.js';

    export function ExampleRoute() {
      return (
        <Modal open={true} title="Clean">
          <Input value="hello" onChange={() => {}} />
          <Textarea value="details" />
          <Button variant="primary">Submit</Button>
          <Checkbox checked={true} onCheckedChange={() => {}} />
          <FilePicker label="Upload" onChange={() => {}} />
          <RadioGroup value="plan" onValueChange={() => {}}>
            <RadioGroupItem value="a" />
          </RadioGroup>
        </Modal>
      );
    }
  `;

  const violations = checkFileOwnership('ExampleRoute.tsx', cleanCode);
  assert.equal(violations.length, 0);
});

test('raw <dialog> triggers violation', () => {
  const code = `
    export function BadModal() {
      return <dialog open>Direct dialog</dialog>;
    }
  `;
  const violations = checkFileOwnership('BadModal.tsx', code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /Raw <dialog> detected/);
  assert.equal(violations[0].line, 3);
});

test('raw <table> triggers violation', () => {
  const code = `
    export function BadTable() {
      return (
        <table>
          {rows}
        </table>
      );
    }
  `;
  const violations = checkFileOwnership('BadTable.tsx', code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /Raw <table> detected/);
  assert.equal(violations[0].line, 4);
});

test('raw table parts outside the table owner each trigger their own violation (openspec 0225 task 2.4)', () => {
  const code = `
    export function BadTable() {
      return (
        <table>
          <thead><tr><th>H</th></tr></thead>
          <tbody><tr><td>Data</td></tr></tbody>
        </table>
      );
    }
  `;
  const violations = checkFileOwnership('BadTableParts.tsx', code);
  const tags = violations.map((v) => v.message.match(/Raw <(\w+)>/)?.[1]).sort();
  assert.deepEqual(tags, ['table', 'tbody', 'td', 'th', 'thead', 'tr', 'tr']);
});

test('raw form-structure elements each trigger their own violation (openspec 0225 task 2.4)', () => {
  const code = `
    export function BadForm() {
      return (
        <form>
          <fieldset>
            <legend>Group</legend>
            <label htmlFor="x">Name</label>
          </fieldset>
        </form>
      );
    }
  `;
  const violations = checkFileOwnership('BadForm.tsx', code);
  const tags = violations.map((v) => v.message.match(/Raw <(\w+)>/)?.[1]).sort();
  assert.deepEqual(tags, ['fieldset', 'form', 'label', 'legend']);
});

test('raw <textarea> triggers violation', () => {
  const code = `
    export function BadTextarea() {
      return <textarea value="raw notes" />;
    }
  `;
  const violations = checkFileOwnership('BadTextarea.tsx', code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /Raw <textarea> detected/);
  assert.equal(violations[0].line, 3);
});

test('raw <button> in standard component triggers violation', () => {
  const code = `
    export function BadButton() {
      return <button type="button">Click me</button>;
    }
  `;
  const violations = checkFileOwnership('BadButton.tsx', code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /Raw <button> detected/);
  assert.equal(violations[0].line, 3);
});

test('raw <button> in allowed exception files passes', () => {
  const code = `
    export function JerseyGrid() {
      return (
        <div>
          <button type="button" className="jersey-btn">10</button>
        </div>
      );
    }
  `;
  assert.equal(checkFileOwnership('control/components/JerseyGrid.tsx', code).length, 0);
  assert.equal(checkFileOwnership('control/components/CountrySelect.tsx', code).length, 0);
  assert.equal(checkFileOwnership('control/components/ToastProvider.tsx', code).length, 0);
  // StandingsTemplate.tsx carries 2 owned classes in the registers, so the fixture
  // has to satisfy that while this test exercises the button exception.
  const withRecordedClasses = `${code}\n<div className="cl-card" /><span className="cl-badge" />`;
  assert.equal(
    checkFileOwnership('control/components/screens/StandingsTemplate.tsx', withRecordedClasses)
      .length,
    0,
  );
});

test('raw text or number <input> triggers violation', () => {
  const code = `
    export function BadInput() {
      return (
        <div>
          <input type="text" value="name" />
          <input type="number" value={10} />
          <input required />
        </div>
      );
    }
  `;
  const violations = checkFileOwnership('BadInput.tsx', code);
  assert.equal(violations.length, 3);
  assert.match(violations[0].message, /Raw <input> detected/);
  assert.match(violations[1].message, /Raw <input> detected/);
  assert.match(violations[2].message, /Raw <input> detected/);
});

test('comments with element tags are ignored', () => {
  const code = `
    // <button> this is a comment </button>
    /* <input type="text" /> */
    * <dialog> inside jsdoc </dialog>
    export function GoodRoute() {
      return <div>Safe</div>;
    }
  `;
  const violations = checkFileOwnership('GoodRoute.tsx', code);
  assert.equal(violations.length, 0);
});

test('sees an element Prettier wrapped across lines, not only a single-line one', () => {
  // The whole reason this scanner was rewritten: it matched per line, so the
  // character after `<button` was a newline that never reached the pattern, and
  // every real multi-prop element in the codebase went unseen.
  const singleLine = `const a = <button type="button">x</button>;`;
  const wrapped = [
    'const a = (',
    '  <button',
    '    type="button"',
    '    onClick={handle}',
    '  >x</button>',
    ');',
  ].join('\n');

  assert.equal(checkFileOwnership('Wrapped.tsx', singleLine).length, 1);
  assert.equal(checkFileOwnership('Wrapped.tsx', wrapped).length, 1);
  assert.equal(checkFileOwnership('Wrapped.tsx', wrapped)[0].line, 2);
});

test('raw checkbox, radio, and file inputs trigger violations naming their atom', () => {
  const wrappedCheckbox = ['<input', '  className="cl-checkbox"', '  type="checkbox"', '/>'].join(
    '\n',
  );
  const checkboxViolations = checkFileOwnership('Toggles.tsx', wrappedCheckbox);
  assert.equal(checkboxViolations.length, 1);
  assert.match(checkboxViolations[0].message, /`Checkbox` atom/);

  const radio = '<input type="radio" value="x" />';
  const radioViolations = checkFileOwnership('Toggles.tsx', radio);
  assert.equal(radioViolations.length, 1);
  assert.match(radioViolations[0].message, /`Radio` atom/);

  const file = '<input type="file" />';
  const fileViolations = checkFileOwnership('Toggles.tsx', file);
  assert.equal(fileViolations.length, 1);
  assert.match(fileViolations[0].message, /`FilePicker` atom/);
});

test('an element named only in a comment is not a violation', () => {
  const commented = ['// <button> in prose', '/* <table> in a block */', 'const ok = 1;'].join(
    '\n',
  );
  assert.equal(checkFileOwnership('Commented.tsx', commented).length, 0);
});

test('a URL is not mistaken for a line comment when blanking comments', () => {
  const code = ['const docs = "https://example.com";', 'const a = <button type="button" />;'].join(
    '\n',
  );
  assert.equal(checkFileOwnership('Urls.tsx', code).length, 1);
});

test('the raw-element debt register admits its recorded count and nothing beyond it', () => {
  const input = ['<input', '  type="text"', '/>'].join('\n');
  const fourInputs = [input, input, input, input].join('\n');
  // control/components/screens/TournamentRulesetTemplate.tsx is recorded at 4.
  assert.equal(
    checkFileOwnership('control/components/screens/TournamentRulesetTemplate.tsx', fourInputs)
      .length,
    0,
  );
  assert.equal(
    checkFileOwnership(
      'control/components/screens/TournamentRulesetTemplate.tsx',
      `${fourInputs}\n${input}`,
    ).length,
    1,
  );
  // An unlisted file gets no allowance at all.
  assert.equal(checkFileOwnership('NotListed.tsx', input).length, 1);
});

test('the debt register ratchets: improving below the recorded count asks for it to be lowered', () => {
  const violations = checkFileOwnership(
    'control/components/screens/TournamentRulesetTemplate.tsx',
    'const nothing = 1;',
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /fewer than the 4 recorded/);
});

test('a hand-written owned class is a violation, the way a raw element is', () => {
  const code = '<div className="cl-card">a card nobody composed</div>';
  const violations = checkFileOwnership('NotListed.tsx', code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /Hand-written `cl-card` class/);
  assert.match(violations[0].message, /`Card` atom/);
});

test('every bypassable owned class is covered, not only the card', () => {
  const code = [
    '<span className="cl-badge">x</span>',
    '<a className="cl-btn">y</a>',
    '<div className="cl-data-table">z</div>',
  ].join('\n');
  assert.equal(checkFileOwnership('NotListed.tsx', code).length, 3);
});

test("a BEM child of an owned class is that component's own structure, not a bypass", () => {
  // Counting these is what inflated the original audit by an order of
  // magnitude: `cl-card__header` inside a Card is the Card, not a second card.
  const code = [
    '<div className="cl-card__header" />',
    '<div className="cl-card__title" />',
    '<span className="cl-badge--rank" />',
    '<a className="cl-btn--primary" />',
  ].join('\n');
  assert.equal(checkFileOwnership('NotListed.tsx', code).length, 0);
});

test('the owned-class register admits its recorded count and nothing beyond it', () => {
  const badge = '<span className="cl-badge" />';
  // ActivityLog.tsx is recorded at 1.
  assert.equal(checkFileOwnership('control/components/ActivityLog.tsx', badge).length, 0);
  assert.equal(
    checkFileOwnership('control/components/ActivityLog.tsx', `${badge}\n${badge}`).length,
    1,
  );
  assert.equal(checkFileOwnership('NotListed.tsx', badge).length, 1);
});

test('the owned-class register ratchets down, naming its own register', () => {
  const violations = checkFileOwnership('control/components/ActivityLog.tsx', 'const nothing = 1;');
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /fewer than the 1 recorded in KNOWN_HANDWRITTEN_CLASSES/);
});

test('the two registers ratchet independently on the same file', () => {
  // control/components/pages/SeedingBuilderPage.tsx is recorded at 5 raw governed
  // elements and 2 owned classes. Meeting one register while missing the other
  // reports only the one missed.
  const input = ['<input', '  type="text"', '/>'].join('\n');
  const violations = checkFileOwnership(
    'control/components/pages/SeedingBuilderPage.tsx',
    [...Array(5).fill(input), '<div className="cl-card" />'].join('\n'),
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /KNOWN_HANDWRITTEN_CLASSES/);
});

test('every owned library component in the repository has a story', () => {
  const uiPath = fileURLToPath(new URL('../apps/web/src/control/components/ui', import.meta.url));
  assert.deepEqual(checkStoryCoverage(uiPath), []);
});

test('a library component without a story is reported by name', () => {
  const root = mkdtempSync(join(tmpdir(), 'ui-coverage-'));
  mkdirSync(join(root, 'atoms'));
  writeFileSync(join(root, 'atoms', 'thing.tsx'), 'export function Thing() { return null; }');
  const missing = checkStoryCoverage(root);
  assert.equal(missing.length, 1);
  assert.match(missing[0].message, /atoms\/thing.tsx has no thing.stories.tsx/);

  writeFileSync(join(root, 'atoms', 'thing.stories.tsx'), 'export default {};');
  assert.deepEqual(checkStoryCoverage(root), []);
});

test('a tier file that exports no component needs no story', () => {
  // A shared type or a helper beside the components is not a library member.
  const root = mkdtempSync(join(tmpdir(), 'ui-coverage-'));
  mkdirSync(join(root, 'molecules'));
  writeFileSync(join(root, 'molecules', 'shapes.tsx'), 'export const rows = [];');
  assert.deepEqual(checkStoryCoverage(root), []);
});

test('a raw <select> is a violation, because a Select atom exists to replace it', () => {
  const code = ['<select', '  value={value}', '  onChange={onChange}', '>', '</select>'].join('\n');
  const violations = checkFileOwnership('control/components/NotListed.tsx', code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /Raw <select> detected/);
  assert.match(violations[0].message, /`Select` atom/);
});

test('an .astro file is scanned like any other source', () => {
  // The public site is mostly .astro, and nothing read it before: being
  // unreadable by the tool was never a decision that the rule did not apply.
  const code = [
    '---',
    'const x = 1;',
    '---',
    '<div class="cl-card">',
    '  <button>Go</button>',
    '</div>',
  ].join('\n');
  const violations = checkFileOwnership('components/NotListed.astro', code);
  assert.equal(violations.length, 2);
  assert.equal(violations[0].line, 4);
  assert.equal(violations[1].line, 5);
});

test('a class styled in a <style> block is not a class applied to an element', () => {
  // `.cl-card-actions :global(.cl-btn) { … }` styles the button an owned
  // component renders. Reporting it would tell an author to stop styling the
  // design system from the one place that is supposed to.
  const code = [
    '<div class="wrapper" />',
    '<style>',
    '  .cl-card-actions :global(.cl-btn) { margin: 0; }',
    '  .cl-badge { text-transform: none; }',
    '</style>',
  ].join('\n');
  assert.deepEqual(checkFileOwnership('components/NotListed.astro', code), []);
});

test('registers key on the path, so two files with one name are not confused', () => {
  // Widening the scan to pages/ made a bare name unsafe: `index.astro`,
  // `[match].astro`, `[tournament].astro` and `emblem.ts` each exist more than
  // once, and a name-keyed allowance would silently cover a file nobody audited.
  const card = '<div class="cl-card" />';
  const registered =
    'pages/[...locale]/[organization]/tournaments/[tournament]/players/[personId].astro';
  assert.equal(checkFileOwnership(registered, card).length, 0);
  assert.equal(checkFileOwnership('pages/somewhere/else/[personId].astro', card).length, 1);
});

test('a file inside a ui/ directory is the design language, not a bypass of it', () => {
  // Ownership is expressed by directory on every surface: control/components/ui
  // and components/ui alike. That is why the public primitives moved there
  // rather than being named in an allowlist.
  const uiPath = fileURLToPath(new URL('../apps/web/src/components/ui/atoms', import.meta.url));
  const scanned = Object.keys(
    scanEverySurface(fileURLToPath(new URL('../apps/web/src', import.meta.url))),
  );
  assert.ok(existsSync(join(uiPath, 'Button.astro')), 'expected the public Button primitive');
  assert.equal(
    scanned.filter((f) => f.includes('/ui/')).length,
    0,
    'no file inside a ui/ directory should be scanned',
  );
});

test('the repository passes the widened check', () => {
  // The registers are a measurement, not an estimate: this is the assertion
  // that they match what the tree actually contains, on every surface.
  const results = scanEverySurface(fileURLToPath(new URL('../apps/web/src', import.meta.url)));
  assert.deepEqual(results, {});
});
