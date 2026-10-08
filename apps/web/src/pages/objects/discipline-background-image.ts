import type { APIRoute } from 'astro';
import { getApiBaseUrl } from '../../lib/public-api-client.ts';

export const prerender = false;

/**
 * Same-origin proxy of the API's discipline background image, like the emblem proxies. A gateway
 * that forwards `/objects` to the API claims the path before the web application sees it; this
 * route serves the same image when the web application is reached directly.
 */
export const GET: APIRoute = async ({ url }) => {
  const key = url.searchParams.get('key');
  if (!key) {
    return new Response('Missing key parameter', { status: 400 });
  }

  const upstreamUrl = `${getApiBaseUrl()}/objects/discipline-background-image?key=${encodeURIComponent(key)}`;
  try {
    const upstream = await fetch(upstreamUrl);
    if (!upstream.ok) {
      return new Response(upstream.statusText, { status: upstream.status });
    }

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    const etag = upstream.headers.get('etag');
    if (etag) headers.set('etag', etag);
    headers.set('cache-control', upstream.headers.get('cache-control') || 'public, max-age=3600');

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response('Failed to fetch discipline background image', { status: 502 });
  }
};
