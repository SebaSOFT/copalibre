import { jest } from '@jest/globals';
import { ApiRequestError, apiGet, apiPost } from './api-client.js';

function fakeConfig(fetchImplementation: typeof fetch) {
  return { baseUrl: 'http://api.invalid', token: 'test-token', fetchImplementation };
}

describe('apiGet/apiPost', () => {
  it('sends a bearer Authorization header and parses a JSON response', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ alias: 'liga' }), { status: 200 }),
    );

    const result = await apiGet(fakeConfig(fetchImplementation), '/organizations/liga');

    expect(result).toEqual({ alias: 'liga' });
    const [, init] = fetchImplementation.mock.calls[0] as [URL, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('sends a JSON body and Content-Type on POST', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );

    await apiPost(fakeConfig(fetchImplementation), '/organizations/liga/tournaments', {
      alias: 'copa',
    });

    const [, init] = fetchImplementation.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ alias: 'copa' }));
  });

  it('throws ApiRequestError with the API’s own message on a non-2xx response', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ statusCode: 403, message: 'forbidden' }), { status: 403 }),
    );

    await expect(apiGet(fakeConfig(fetchImplementation), '/organizations/liga')).rejects.toThrow(
      new ApiRequestError(403, 'forbidden'),
    );
  });

  it('handles an empty response body', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => new Response('', { status: 200 }),
    );

    await expect(apiGet(fakeConfig(fetchImplementation), '/health')).resolves.toBeUndefined();
  });
});
