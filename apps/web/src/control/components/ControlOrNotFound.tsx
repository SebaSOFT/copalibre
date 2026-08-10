import { useEffect } from 'react';
import { ControlApp } from './ControlApp.js';

/** id of `404.astro`'s own static "not found" markup, hidden once this component determines the miss was actually a `/control/**` screen. */
const STATIC_NOT_FOUND_ID = 'static-not-found';

/**
 * The site's global 404 fallback, made SPA-aware for `/control/**` (0061).
 *
 * A static build's 404 page is the one place that reliably runs for *any*
 * unmatched path on *any* static host, with no host-specific rewrite rule
 * required — `deploy/web/Caddyfile`'s own `try_files` fallback covers real
 * production deployments already, but `astro preview` (what local e2e runs
 * against) and third-party static hosts a self-hoster might use have no such
 * rule, and only ever serve this one file for a miss. Checking the path here
 * makes the control panel's client-side routing (0061) work everywhere a
 * static site can be hosted, not only behind this repo's own example proxy
 * config.
 *
 * Renders nothing for any other path: `404.astro`'s own static markup is
 * the real "not found" content for a genuinely missing public page, present
 * in the HTML without needing this (or any) script to run — the public-web
 * no-JS baseline this repo otherwise holds to.
 */
export function ControlOrNotFound(): React.JSX.Element | null {
  const isControlPath = window.location.pathname.startsWith('/control/');

  useEffect(() => {
    if (!isControlPath) return;
    document.getElementById(STATIC_NOT_FOUND_ID)?.style.setProperty('display', 'none');
  }, [isControlPath]);

  if (isControlPath) return <ControlApp />;
  return null;
}
