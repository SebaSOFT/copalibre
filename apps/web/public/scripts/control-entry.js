/* global window, URL, URLSearchParams */
// `/control/` forwards to the login page and keeps the request-time `returnTo`.
// A classic blocking script from the application's own origin, so it runs
// before the meta refresh fallback and the Content Security Policy allows it
// by source; an inline script outside the build's hashes would not run.
const target = new URL('/control/login', window.location.origin);
const returnTo = new URLSearchParams(window.location.search).get('returnTo');
if (returnTo !== null) target.searchParams.set('returnTo', returnTo);
window.location.replace(`${target.pathname}${target.search}`);
