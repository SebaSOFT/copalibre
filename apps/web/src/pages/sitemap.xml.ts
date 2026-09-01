import { buildSitemap } from '@copalibre/routing';
import { fetchPublicSitemapRoutes } from '../lib/public-routes.js';

export const prerender = false;

/**
 * Built from the URL builder, so a route it cannot construct cannot be
 * advertised — `/control` and `/tv` are absent by construction rather than by
 * somebody remembering to exclude them.
 */
export async function GET({ site }: { site?: URL }): Promise<Response> {
  const routes = await fetchPublicSitemapRoutes();
  return new Response(buildSitemap(site?.toString() ?? 'http://localhost:4321', routes), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
