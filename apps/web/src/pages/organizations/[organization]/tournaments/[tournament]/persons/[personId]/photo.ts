import type { APIRoute } from 'astro';
import { getApiBaseUrl } from '../../../../../../../lib/public-api-client.ts';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const organization = params['organization'];
  const tournament = params['tournament'];
  const personId = params['personId'];
  if (!organization || !tournament || !personId) {
    return new Response('Missing required parameters', {
      status: 400,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const url = `${getApiBaseUrl()}/organizations/${encodeURIComponent(organization)}/tournaments/${encodeURIComponent(tournament)}/persons/${encodeURIComponent(personId)}/photo`;
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return new Response(upstream.statusText, {
        status: upstream.status,
        headers: { 'cache-control': 'private, no-store' },
      });
    }

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    const etag = upstream.headers.get('etag');
    if (etag) headers.set('etag', etag);
    headers.set('cache-control', 'private, no-store');

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response('Failed to fetch person photo', {
      status: 502,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
};
