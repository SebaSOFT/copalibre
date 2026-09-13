import type { APIRoute } from 'astro';
import { getApiBaseUrl } from '../../../lib/public-api-client.ts';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const organization = params['organization'];
  if (!organization) {
    return new Response('Missing organization parameter', { status: 400 });
  }

  const url = `${getApiBaseUrl()}/organizations/${encodeURIComponent(organization)}/emblem`;
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return new Response(upstream.statusText, { status: upstream.status });
    }

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    const etag = upstream.headers.get('etag');
    if (etag) headers.set('etag', etag);
    headers.set('cache-control', upstream.headers.get('cache-control') || 'public, max-age=3600');

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return new Response('Failed to fetch organization emblem', { status: 502 });
  }
};
