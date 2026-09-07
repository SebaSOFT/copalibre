import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFileOwnership } from './check-control-ui-ownership.mjs';

test('valid component with owned primitives reports zero violations', () => {
  const cleanCode = `
    import { Button } from './ui/atoms/button.js';
    import { Input } from './ui/atoms/input.js';
    import { Modal } from './ui/organisms/modal.js';
    import { DataTable } from './ui/organisms/data-table.js';
    import { Textarea } from './ui/atoms/textarea.js';

    export function ExampleRoute() {
      return (
        <Modal open={true} title="Clean">
          <Input value="hello" onChange={() => {}} />
          <Textarea value="details" />
          <Button variant="primary">Submit</Button>
          <label className="cl-toggle cl-focusable">
            <input type="checkbox" className="cl-checkbox cl-focusable" />
            <span>Accept</span>
          </label>
          <input type="file" onChange={() => {}} />
          <input type="radio" name="plan" />
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
          <tbody><tr><td>Data</td></tr></tbody>
        </table>
      );
    }
  `;
  const violations = checkFileOwnership('BadTable.tsx', code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /Raw <table> detected/);
  assert.equal(violations[0].line, 4);
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
  assert.equal(checkFileOwnership('JerseyGrid.tsx', code).length, 0);
  assert.equal(checkFileOwnership('CountrySelect.tsx', code).length, 0);
  assert.equal(checkFileOwnership('ToastProvider.tsx', code).length, 0);
  assert.equal(checkFileOwnership('StandingsPage.tsx', code).length, 0);
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

test('a wrapped checkbox, radio or file input stays exempt', () => {
  const wrappedCheckbox = ['<input', '  className="cl-checkbox"', '  type="checkbox"', '/>'].join(
    '\n',
  );
  assert.equal(checkFileOwnership('Toggles.tsx', wrappedCheckbox).length, 0);
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

test('the raw-input debt register admits its recorded count and nothing beyond it', () => {
  const input = ['<input', '  type="text"', '/>'].join('\n');
  // PreferencesRoute.tsx is recorded at 1.
  assert.equal(checkFileOwnership('PreferencesRoute.tsx', input).length, 0);
  assert.equal(checkFileOwnership('PreferencesRoute.tsx', `${input}\n${input}`).length, 1);
  // An unlisted file gets no allowance at all.
  assert.equal(checkFileOwnership('NotListed.tsx', input).length, 1);
});

test('the debt register ratchets: improving below the recorded count asks for it to be lowered', () => {
  const violations = checkFileOwnership('PreferencesRoute.tsx', 'const nothing = 1;');
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /fewer than the 1 recorded/);
});
