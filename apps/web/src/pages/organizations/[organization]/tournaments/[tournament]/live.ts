import type { APIRoute } from 'astro';
import { fetchLive } from '../../../../../lib/public-api-client.ts';

export const prerender = false;

/**
 * The browser-facing read of a tournament's live matches, at the path the API itself serves it on.
 * A deployed gateway sends `/organizations/**` straight to the API, so this route answers only where
 * there is no gateway in front (the web server on its own, as in a preview or a test run): the TV
 * kiosk refreshes from one address in both.
 */
export const GET: APIRoute = async ({ params }) => {
  const organization = params['organization'];
  const tournament = params['tournament'];
  if (!organization || !tournament) {
    return new Response('Missing required parameters', { status: 400 });
  }

  const live = await fetchLive(organization, tournament);
  if (!live) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(live), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
