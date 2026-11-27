/** Measure before changing the board, then move each surviving card from its old position. */
export function measureSchedule(root: ParentNode = document): ReadonlyMap<string, DOMRect> {
  return new Map(
    [...root.querySelectorAll<HTMLElement>('[data-schedule-match]')].map((card) => [
      card.dataset.scheduleMatch ?? '',
      card.getBoundingClientRect(),
    ]),
  );
}

export function animateSchedule(
  previous: ReadonlyMap<string, DOMRect>,
  root: ParentNode = document,
): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  for (const card of root.querySelectorAll<HTMLElement>('[data-schedule-match]')) {
    const before = previous.get(card.dataset.scheduleMatch ?? '');
    if (!before || typeof card.animate !== 'function') continue;
    const after = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    const token = style.getPropertyValue('--cl-motion-slow').trim();
    const duration = parseFloat(token) * (token.endsWith('ms') ? 1 : 1000);
    if (!Number.isFinite(duration) || duration <= 0) continue;
    card.animate(
      [
        { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration, easing: style.getPropertyValue('--cl-motion-easing').trim() || 'ease-out' },
    );
  }
}
