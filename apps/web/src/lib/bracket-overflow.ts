/**
 * Enhancement for a bracket's horizontal scroller. Without JavaScript the native scrollbar is the
 * affordance; with it, the scroller also says whether it overflows and on which side more
 * content continues, so the stylesheet can draw an edge fade and the localized hint.
 *
 * A density the stylesheet hides has no width, so it is skipped and its marks are cleared; the
 * resize observer re-checks it when a breakpoint shows it.
 */

const OVERFLOW_TOLERANCE = 1;

export function updateBracketOverflow(scroller: HTMLElement): void {
  if (scroller.clientWidth === 0) {
    clearMarks(scroller);
    return;
  }
  const maxScroll = scroller.scrollWidth - scroller.clientWidth;
  if (maxScroll <= OVERFLOW_TOLERANCE) {
    clearMarks(scroller);
    return;
  }
  scroller.setAttribute('data-overflowing', '');
  scroller.toggleAttribute('data-overflow-start', scroller.scrollLeft > OVERFLOW_TOLERANCE);
  scroller.toggleAttribute(
    'data-overflow-end',
    scroller.scrollLeft < maxScroll - OVERFLOW_TOLERANCE,
  );
}

function clearMarks(scroller: HTMLElement): void {
  scroller.removeAttribute('data-overflowing');
  scroller.removeAttribute('data-overflow-start');
  scroller.removeAttribute('data-overflow-end');
}

export function initializeBracketOverflow(scroller: HTMLElement): void {
  if (scroller.dataset.overflowReady) return;
  scroller.dataset.overflowReady = 'true';
  const update = (): void => updateBracketOverflow(scroller);
  scroller.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(update).observe(scroller);
  } else {
    window.addEventListener('resize', update);
  }
  update();
}

/**
 * Brings the highlighted match of a bracket into view inside its scroller, on load. The
 * highlighted match sits in whichever density is shown, so the hidden copy is skipped. Under
 * reduced motion the scroll is immediate.
 */
export function revealFocusedBracketMatch(root: ParentNode): void {
  const focused = [...root.querySelectorAll<HTMLElement>('.cl-bracket-stage__node--focused')].find(
    (node) => node.getBoundingClientRect().width > 0,
  );
  const scroller = focused?.closest<HTMLElement>('.cl-bracket-stage__scroll');
  if (!focused || !scroller) return;
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const node = focused.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  const offset = node.left + node.width / 2 - (box.left + box.width / 2);
  // Only the bracket moves sideways: the page keeps its own vertical position.
  scroller.scrollTo({
    left: scroller.scrollLeft + offset,
    behavior: reduceMotion ? 'auto' : 'smooth',
  });
}
