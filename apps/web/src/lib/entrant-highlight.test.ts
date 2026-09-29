import { initializeEntrantHighlight } from './entrant-highlight.js';

function query<T extends Element>(root: Element, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing fixture element: ${selector}`);
  return element;
}

function bracket(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `<script type="application/json" data-journey-matches>${JSON.stringify([
    {
      matchId: 'one',
      matchNumber: 1,
      slots: [{ kind: 'entrant', entrantId: 'a' }],
      state: 'upcoming',
    },
    {
      matchId: 'two',
      matchNumber: 2,
      slots: [{ kind: 'winner-of', matchId: 'one' }],
      state: 'upcoming',
    },
    { matchId: 'other', matchNumber: 3, slots: [], state: 'upcoming' },
  ])}</script><p hidden data-journey-hint>Hint</p><span data-journey-fallback>A</span>
    <button hidden data-entrant-id="a" aria-pressed="false"><span>A</span></button>
    <button hidden data-entrant-id="unknown">Unknown</button>
    <article data-journey-match="one"></article><article data-journey-match="two"></article>
    <li data-journey-match="one"></li><article data-journey-match="other"></article>`;
  document.body.append(root);
  return root;
}
afterEach(() => {
  document.body.innerHTML = '';
});
it('enhances once, synchronizes both presentations, toggles and clears with Escape', () => {
  const root = bracket();
  initializeEntrantHighlight(root);
  initializeEntrantHighlight(root);
  const button = query<HTMLButtonElement>(root, 'button');
  expect(button.hidden).toBe(false);
  expect(query<HTMLElement>(root, '[data-journey-fallback]').hidden).toBe(true);
  query<HTMLSpanElement>(root, 'button span').click();
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelectorAll('[data-entrant-path="included"]')).toHaveLength(3);
  expect(root.querySelectorAll('[data-entrant-path="excluded"]')).toHaveLength(1);
  button.click();
  expect(root.querySelectorAll('[data-entrant-path]')).toHaveLength(0);
  button.click();
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(button.getAttribute('aria-pressed')).toBe('false');
  query<HTMLButtonElement>(root, '[data-entrant-id="unknown"]').click();
  expect(root.querySelectorAll('[data-entrant-path]')).toHaveLength(0);
});
it('isolates bracket instances and ignores unrelated clicks and keys', () => {
  const first = bracket();
  const second = bracket();
  initializeEntrantHighlight(first);
  initializeEntrantHighlight(second);
  first.click();
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  query<HTMLButtonElement>(first, 'button').click();
  expect(second.querySelectorAll('[data-entrant-path]')).toHaveLength(0);
});
it.each([
  '',
  '<script data-journey-matches></script>',
  '<script data-journey-matches>{</script>',
  '<script data-journey-matches>{}</script>',
])('leaves incomplete payloads unenhanced: %s', (html) => {
  const root = document.createElement('section');
  root.innerHTML = html;
  initializeEntrantHighlight(root);
  expect(root.dataset.journeyReady).toBeUndefined();
});
