/* global document, localStorage */
// Runs before first paint as a classic blocking script served from the
// application's own origin: the Content Security Policy allows it by source,
// which an inline script outside the build's hashes would not get.
//
// First, outside any try, it marks that scripting runs, so styles can paint
// the state the page's scripts are about to set (the public header's compact
// menu paints closed instead of collapsing after first paint).
document.documentElement.dataset.scripting = '';

// Then it applies the stored theme, so a light-theme visitor never sees a dark flash.
try {
  const t = localStorage.getItem('cl-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else document.documentElement.removeAttribute('data-theme');
} catch {
  document.documentElement.removeAttribute('data-theme');
}
