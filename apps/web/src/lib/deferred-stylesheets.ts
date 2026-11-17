/**
 * Public pages name the stylesheets they load after their first paint in
 * `<meta name="copalibre:deferred-stylesheet">`: the Chinese faces, which every page in another
 * language still needs for operator text but whose first paint must not wait for them.
 */
export const DEFERRED_STYLESHEET_META = 'copalibre:deferred-stylesheet';

/** Runs `then` after the next frame has painted: none runs while rendering is blocked. */
export function afterNextPaint(then: () => void, view: Window = window): void {
  view.requestAnimationFrame(() => {
    view.requestAnimationFrame(() => {
      // Safari before 18 has no requestIdleCallback; the DOM typings say every window does.
      const idle = view.requestIdleCallback as Window['requestIdleCallback'] | undefined;
      if (idle) idle.call(view, then, { timeout: 2000 });
      else view.setTimeout(then, 0);
    });
  });
}

/** Adds each deferred stylesheet once the page has painted. */
export function addDeferredStylesheets(document: Document = window.document): void {
  const view = document.defaultView;
  if (!view) return;
  const hrefs = [
    ...document.querySelectorAll<HTMLMetaElement>(`meta[name="${DEFERRED_STYLESHEET_META}"]`),
  ].map((meta) => meta.content);
  if (hrefs.length === 0) return;
  afterNextPaint(() => {
    for (const href of hrefs) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.append(link);
    }
  }, view);
}
