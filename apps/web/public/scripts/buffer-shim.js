/* global window, TextEncoder */
// Control's bundle includes code that expects Node's `Buffer` and `global`.
// Defined before the bundle runs, from a file on the application's own origin
// so the Content Security Policy allows it by source.
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
  window.Buffer = {
    isBuffer: () => false,
    from: (data) => (typeof data === 'string' ? new TextEncoder().encode(data) : data),
  };
  window.global = window;
}
