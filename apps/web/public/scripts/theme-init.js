/* global document, localStorage */
// Applies the stored theme before first paint, so a light-theme visitor never
// sees a dark flash. A classic blocking script served from the application's
// own origin: the Content Security Policy allows it by source, which an inline
// script outside the build's hashes would not get.
try {
  const t = localStorage.getItem('cl-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else document.documentElement.removeAttribute('data-theme');
} catch {
  document.documentElement.removeAttribute('data-theme');
}
