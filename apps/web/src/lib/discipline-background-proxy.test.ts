import { jest } from '@jest/globals';
import type { APIContext } from 'astro';
import { GET } from '../pages/objects/discipline-background-image.ts';

const KEY = 'modules/rink-hockey/1.1.0/rink-hockey-01.jpg';

const call = (search: string) =>
  GET({
    url: new URL(`http://localhost:4321/objects/discipline-background-image${search}`),
  } as APIContext);

describe('discipline background proxy', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('streams the upstream image with its content type and a cache lifetime', async () => {
    const fetchMock = jest.fn(
      async () => new Response('bytes', { headers: { 'content-type': 'image/jpeg' } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await call(`?key=${encodeURIComponent(KEY)}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    const requested = (fetchMock.mock.calls[0] as unknown as [string])[0];
    expect(requested).toContain('/objects/discipline-background-image?key=');
    expect(requested).toContain(encodeURIComponent(KEY));
  });

  it('refuses a request without a key', async () => {
    expect((await call('')).status).toBe(400);
  });

  it('passes an upstream refusal through', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    expect((await call(`?key=${encodeURIComponent(KEY)}`)).status).toBe(404);
  });

  it('answers 502 when the API is unreachable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('down');
    }) as typeof fetch;
    expect((await call(`?key=${encodeURIComponent(KEY)}`)).status).toBe(502);
  });
});
