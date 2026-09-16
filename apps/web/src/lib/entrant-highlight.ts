import { entrantPath, type BracketMatch } from './bracket.js';

/** One delegated interaction per bracket, shared by its graph and responsive outline. */
export function initializeEntrantHighlight(root: HTMLElement): void {
  if (root.dataset.journeyReady) return;
  const payload = root.querySelector('[data-journey-matches]');
  if (!payload?.textContent) return;
  let matches: BracketMatch[];
  try {
    matches = JSON.parse(payload.textContent) as BracketMatch[];
  } catch {
    return;
  }
  if (!Array.isArray(matches)) return;
  let active: string | undefined;
  const buttons = root.querySelectorAll<HTMLButtonElement>('button[data-entrant-id]');
  const update = (entrantId?: string): void => {
    active = entrantId;
    const path = entrantId === undefined ? undefined : entrantPath(matches, entrantId);
    for (const node of root.querySelectorAll<HTMLElement>('[data-journey-match]')) {
      if (!path?.size) delete node.dataset.entrantPath;
      else
        node.dataset.entrantPath = path.has(node.dataset.journeyMatch ?? '')
          ? 'included'
          : 'excluded';
    }
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.entrantId === active));
    }
  };
  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-entrant-id]');
    if (!button || !root.contains(button)) return;
    update(button.dataset.entrantId === active ? undefined : button.dataset.entrantId);
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') update();
  });
  for (const button of buttons) button.hidden = false;
  for (const fallback of root.querySelectorAll<HTMLElement>('[data-journey-fallback]'))
    fallback.hidden = true;
  const hint = root.querySelector<HTMLElement>('[data-journey-hint]');
  if (hint && buttons.length > 0) hint.hidden = false;
  root.dataset.journeyReady = 'true';
}
