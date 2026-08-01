import { buildSitemap } from '@copalibre/routing';
import { PUBLIC_ROUTES } from '../lib/public-routes.js';

/**
 * Built from the URL builder, so a route it cannot construct cannot be
 * advertised — `/control` and `/tv` are absent by construction rather than by
 * somebody remembering to exclude them.
 */
export function GET({ site }: { site?: URL }): Response {
  return new Response(buildSitemap(site?.toString() ?? 'http://localhost:4321', PUBLIC_ROUTES), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
